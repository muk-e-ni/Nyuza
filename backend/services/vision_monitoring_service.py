"""
Nyuza — vision monitoring service
------------------------------------
The automated counterpart to services/sensor_service.py's monitoring_loop,
but for the camera instead of Arduino sensors. Runs as a background thread
that wakes up every CHECK_INTERVAL_SECONDS, grabs a frame from the phone
camera, and reacts — no manual upload, no human in the loop.

Decision policy :
  - Healthy                                    -> log only
  - Disease, confidence >= AUTO_DOSE_THRESHOLD  -> log + auto-trigger dosing
  - Disease, confidence <  AUTO_DOSE_THRESHOLD  -> log + create a
                                                    Recommendation + notify
                                                    the farmer, no auto action

Camera source: a phone running the "IP Webcam" Android app (or DroidCam),
streaming over wifi to CAMERA_SOURCE. No cable, no manual capture.
"""

import threading
import time
import logging
from datetime import datetime, timedelta

import cv2

from services.disease_model_service import disease_model_service
from services.sensor_service import sensor_service
from utils.image_storage import save_plant_image
from models import PlantHealthReading, Recommendation, NotificationLog
from config import database

logger = logging.getLogger(__name__)

CAMERA_SOURCE = "http://192.168.1.100:8080/video"  # <-- set to phone's IP Webcam URL
CHECK_INTERVAL_SECONDS = 180                        # every 3 minutes, for the demo
AUTO_DOSE_THRESHOLD = 0.90                          # only auto-act when very confident
DOSE_DURATION_MS = 1500
DOSE_COOLDOWN_SECONDS = 6 * 3600                    # don't re-dose the same zone within 6 hours


class VisionMonitoringService:
    def __init__(self, app=None):
        self.app = app
        self.is_monitoring = False
        self.monitoring_thread = None
        self.camera_source = CAMERA_SOURCE

    def init_app(self, app):
        self.app = app

    def start_monitoring(self):
        if self.is_monitoring:
            return

        self.is_monitoring = True
        logger.info("Starting vision monitoring service")

        def monitoring_loop():
            while self.is_monitoring:
                try:
                    if self.app:
                        with self.app.app_context():
                            self._check_once()
                    else:
                        self._check_once()
                except Exception as e:
                    logger.error(f"Vision monitoring error: {e}")

                # Non-blocking-ish wait so stop_monitoring() takes effect quickly
                for _ in range(CHECK_INTERVAL_SECONDS):
                    if not self.is_monitoring:
                        break
                    time.sleep(1)

        self.monitoring_thread = threading.Thread(target=monitoring_loop)
        self.monitoring_thread.daemon = True
        self.monitoring_thread.start()

    def stop_monitoring(self):
        self.is_monitoring = False
        logger.info("Vision monitoring stopped")

    def _capture_frame(self):
        """Grab a single frame from the phone camera stream.
        Opens and releases the connection each check rather than holding it
        open continuously — simpler and more resilient to a phone briefly
        dropping wifi between checks."""
        cap = cv2.VideoCapture(self.camera_source)
        if not cap.isOpened():
            logger.error(f"Could not open camera source: {self.camera_source}")
            return None

        ret, frame = cap.read()
        cap.release()

        if not ret:
            logger.error("Camera opened but failed to read a frame")
            return None

        return frame

    def _check_once(self, user_id=1, zone_id=None):
        """One full check: capture -> classify -> act. user_id defaults to
        the primary farm account for the demo; a multi-user deployment would
        associate cameras with specific users/zones instead."""
        if not disease_model_service.is_ready():
            logger.warning("Disease model not loaded — skipping this check")
            return

        frame = self._capture_frame()
        if frame is None:
            return

        # Encode the frame the same way an uploaded file would arrive, so we
        # reuse disease_model_service.predict()'s existing image-bytes interface.
        success, buffer = cv2.imencode(".jpg", frame)
        if not success:
            logger.error("Failed to encode captured frame")
            return

        result = disease_model_service.predict(buffer.tobytes())
        logger.info(
            f"Vision check — {result['predicted_class']} "
            f"({result['confidence']:.2%} confidence)"
        )

        image_path = save_plant_image(buffer.tobytes(), user_id, result["predicted_class"])

        reading = PlantHealthReading(
            user_id=user_id,
            zone_id=zone_id,
            predicted_class=result["predicted_class"],
            confidence=result["confidence"],
            is_healthy=result["is_healthy"],
            image_path=image_path,
            model_version="disease_v1",
        )
        database.session.add(reading)
        database.session.commit()

        if result["is_healthy"]:
            return  # nothing further to do

        if result["confidence"] >= AUTO_DOSE_THRESHOLD:
            self._auto_dose(user_id, result)
        else:
            self._notify_farmer(user_id, result)

    def _recently_dosed(self, user_id, within_seconds):
        """Check whether we already auto-dosed recently, so we don't spray
        again every single check cycle just because the same disease is
        still visibly present (it won't disappear in 3 minutes)."""
        cutoff = datetime.now() - timedelta(seconds=within_seconds)
        recent = Recommendation.query.filter(
            Recommendation.user_id == user_id,
            Recommendation.recommendation_type == "pest_control",
            Recommendation.status == "applied",
            Recommendation.applied_at >= cutoff,
        ).first()
        return recent is not None

    def _auto_dose(self, user_id, result):
        """High-confidence disease detection — act automatically, unless
        we already dosed this recently (see DOSE_COOLDOWN_SECONDS)."""
        if self._recently_dosed(user_id, DOSE_COOLDOWN_SECONDS):
            logger.info(
                f"Skipping auto-dose for {result['predicted_class']} — "
                f"already dosed within the last {DOSE_COOLDOWN_SECONDS // 3600}h, "
                f"logging detection only"
            )
            recommendation = Recommendation(
                user_id=user_id,
                title=f"Still detecting: {result['predicted_class'].replace('_', ' ').title()}",
                description=(
                    f"Still detecting {result['predicted_class'].replace('_', ' ')} at "
                    f"{result['confidence']:.0%} confidence, but already treated recently — "
                    f"logged for monitoring, no pump triggered this cycle."
                ),
                recommendation_type="pest_control",
                priority="low",
                status="applied",  # already handled via the earlier dose; this is a monitoring log entry
                applied_at=datetime.now(),
                ai_model_version="disease_v1",
                confidence_score=result["confidence"],
            )
            database.session.add(recommendation)
            database.session.commit()
            return

        dose_success = sensor_service.trigger_dosing_pump(DOSE_DURATION_MS)

        recommendation = Recommendation(
            user_id=user_id,
            title=f"Auto-treated: {result['predicted_class'].replace('_', ' ').title()}",
            description=(
                f"Detected {result['predicted_class'].replace('_', ' ')} at "
                f"{result['confidence']:.0%} confidence — dosing pump triggered automatically."
            ),
            recommendation_type="pest_control",
            priority="high",
            status="applied",
            applied_at=datetime.now(),
            ai_model_version="disease_v1",
            confidence_score=result["confidence"],
        )
        database.session.add(recommendation)
        database.session.commit()

        logger.info(
            f"Auto-dose {'succeeded' if dose_success else 'FAILED (Arduino unreachable?)'} "
            f"for {result['predicted_class']}"
        )

    def _notify_farmer(self, user_id, result):
        """Lower-confidence detection — flag it for the farmer instead of acting."""
        recommendation = Recommendation(
            user_id=user_id,
            title=f"Possible {result['predicted_class'].replace('_', ' ').title()} detected",
            description=(
                f"Camera detected possible {result['predicted_class'].replace('_', ' ')} "
                f"at {result['confidence']:.0%} confidence — below the auto-treatment "
                f"threshold. Please review and confirm before any pesticide is applied."
            ),
            recommendation_type="alert",
            priority="medium",
            status="pending",
            ai_model_version="disease_v1",
            confidence_score=result["confidence"],
        )
        database.session.add(recommendation)
        database.session.commit()

        notification = NotificationLog(
            user_id=user_id,
            title="Plant health alert",
            message=recommendation.description,
            notification_type="warning",
            sent_via="web",
            status="delivered",
        )
        database.session.add(notification)
        database.session.commit()

        logger.info(f"Farmer notified — {result['predicted_class']} needs review")


# Global instance, same pattern as sensor_service
vision_monitoring_service = VisionMonitoringService()