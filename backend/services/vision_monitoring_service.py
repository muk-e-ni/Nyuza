"""
Nyuza — vision monitoring service
------------------------------------
Background thread, same pattern as sensor_service.py's monitoring_loop, but
for the camera. Every CHECK_INTERVAL_SECONDS it grabs one frame and runs
BOTH the disease model and the pest model against it — no manual upload,
no human in the loop.

Decision policy:
  - Both negative (healthy AND no_pest)              -> log only
  - Either model >= AUTO_DOSE_THRESHOLD               -> ONE dosing trigger
    (not one per model — there's one physical pump, so if both models flag
    a problem in the same cycle, we still only dose once, and the
    recommendation records whichever issue(s) triggered it)
  - Below threshold but not negative                  -> notify the farmer,
    one Recommendation per flagged issue, no auto action
  - Auto-dose eligible, but already dosed recently     -> log only, no
    second dose (see DOSE_COOLDOWN_SECONDS)

Camera source: a phone running "IP Webcam" (Android), streaming over wifi.
"""

import threading
import time
import logging
from datetime import datetime, timedelta

import cv2

from services.disease_model_service import disease_model_service
from services.pest_model_service import pest_model_service
from services.sensor_service import sensor_service
from utils.image_storage import save_plant_image
from models import PlantHealthReading, Recommendation, NotificationLog
from config import database

logger = logging.getLogger(__name__)

CAMERA_SOURCE = "http://192.168.1.100:8080/video"  # <-- set to your phone's IP Webcam URL
CHECK_INTERVAL_SECONDS = 180                        # every 3 minutes, for the demo
AUTO_DOSE_THRESHOLD = 0.90                          # only auto-act when very confident
DOSE_DURATION_MS = 1500
DOSE_COOLDOWN_SECONDS = 6 * 3600                    # don't re-dose within 6 hours


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
        """One full check: capture -> run both models -> decide -> act.
        Both models run against the exact same frame, so a single capture
        serves both checks."""
        disease_ready = disease_model_service.is_ready()
        pest_ready = pest_model_service.is_ready()

        if not disease_ready and not pest_ready:
            logger.warning("Neither model is loaded — skipping this check")
            return

        frame = self._capture_frame()
        if frame is None:
            return

        success, buffer = cv2.imencode(".jpg", frame)
        if not success:
            logger.error("Failed to encode captured frame")
            return

        image_bytes = buffer.tobytes()
        # Both readings come from the same frame — save the image once and
        # reuse the path for both DB rows, rather than saving it twice.
        image_path = save_plant_image(image_bytes, user_id, "check")

        results = []
        if disease_ready:
            disease_result = disease_model_service.predict(image_bytes)
            results.append(disease_result)
            self._log_reading(user_id, zone_id, disease_result, image_path)
            logger.info(
                f"Disease check — {disease_result['predicted_class']} "
                f"({disease_result['confidence']:.2%})"
            )

        if pest_ready:
            pest_result = pest_model_service.predict(image_bytes)
            results.append(pest_result)
            self._log_reading(user_id, zone_id, pest_result, image_path)
            logger.info(
                f"Pest check — {pest_result['predicted_class']} "
                f"({pest_result['confidence']:.2%})"
            )

        # Split this cycle's findings into "problem" results (something
        # other than healthy/no_pest) vs everything else.
        problems = [r for r in results if not r["is_negative"]]
        if not problems:
            return  # both models agree nothing's wrong — nothing further to do

        auto_dose_candidates = [r for r in problems if r["confidence"] >= AUTO_DOSE_THRESHOLD]
        review_candidates = [r for r in problems if r["confidence"] < AUTO_DOSE_THRESHOLD]

        if auto_dose_candidates:
            self._handle_auto_dose(user_id, auto_dose_candidates)

        for result in review_candidates:
            self._notify_farmer(user_id, result)

    def _log_reading(self, user_id, zone_id, result, image_path):
        reading = PlantHealthReading(
            user_id=user_id,
            zone_id=zone_id,
            predicted_class=result["predicted_class"],
            confidence=result["confidence"],
            is_healthy=result["is_negative"],
            image_path=image_path,
            model_version=result["model_version"],
        )
        database.session.add(reading)
        database.session.commit()

    def _recently_dosed(self, user_id, within_seconds):
        """Have we auto-dosed recently, for ANY reason (disease or pest)?
        There's one physical pump/chemical, so the cooldown is shared
        across both models, not tracked separately."""
        cutoff = datetime.now() - timedelta(seconds=within_seconds)
        recent = Recommendation.query.filter(
            Recommendation.user_id == user_id,
            Recommendation.recommendation_type == "pest_control",
            Recommendation.status == "applied",
            Recommendation.applied_at >= cutoff,
        ).first()
        return recent is not None

    def _describe(self, result):
        label = result["predicted_class"].replace("_", " ")
        return f"{label} ({result['confidence']:.0%} confidence, {result['model_version']})"

    def _handle_auto_dose(self, user_id, candidates):
        """One or more models flagged a high-confidence problem this cycle.
        Fire the pump AT MOST ONCE, and describe every contributing issue
        in a single recommendation — not one dose per model."""
        issue_summary = ", ".join(self._describe(r) for r in candidates)

        if self._recently_dosed(user_id, DOSE_COOLDOWN_SECONDS):
            logger.info(
                f"Skipping auto-dose ({issue_summary}) — already dosed within "
                f"the last {DOSE_COOLDOWN_SECONDS // 3600}h, logging only"
            )
            recommendation = Recommendation(
                user_id=user_id,
                title="Still detecting an issue",
                description=(
                    f"Still detecting: {issue_summary}. Already treated recently — "
                    f"monitoring instead of re-dosing."
                ),
                recommendation_type="pest_control",
                priority="low",
                status="applied",
                applied_at=datetime.now(),
                ai_model_version="+".join(sorted({r["model_version"] for r in candidates})),
                confidence_score=max(r["confidence"] for r in candidates),
            )
            database.session.add(recommendation)
            database.session.commit()
            return

        dose_success = sensor_service.trigger_dosing_pump(DOSE_DURATION_MS)

        recommendation = Recommendation(
            user_id=user_id,
            title="Auto-treated: " + ", ".join(r["predicted_class"].replace("_", " ").title() for r in candidates),
            description=f"Detected: {issue_summary} — dosing pump triggered automatically.",
            recommendation_type="pest_control",
            priority="high",
            status="applied",
            applied_at=datetime.now(),
            ai_model_version="+".join(sorted({r["model_version"] for r in candidates})),
            confidence_score=max(r["confidence"] for r in candidates),
        )
        database.session.add(recommendation)
        database.session.commit()

        logger.info(
            f"Auto-dose {'succeeded' if dose_success else 'FAILED (Arduino unreachable?)'} "
            f"for {issue_summary}"
        )

    def _notify_farmer(self, user_id, result):
        """Lower-confidence detection — flag it for the farmer instead of acting."""
        recommendation = Recommendation(
            user_id=user_id,
            title=f"Possible {result['predicted_class'].replace('_', ' ').title()} detected",
            description=(
                f"Camera detected possible {result['predicted_class'].replace('_', ' ')} "
                f"at {result['confidence']:.0%} confidence ({result['model_version']}) — "
                f"below the auto-treatment threshold. Please review and confirm before "
                f"any pesticide is applied."
            ),
            recommendation_type="alert",
            priority="medium",
            status="pending",
            ai_model_version=result["model_version"],
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