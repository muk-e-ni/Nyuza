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

CAMERA_SOURCE = "http://192.168.100.96:8080/video"  # <-- set to your phone's IP Webcam URL
CHECK_INTERVAL_SECONDS = 180                        # every 3 minutes, for the demo
AUTO_DOSE_THRESHOLD = 0.90                          # only auto-act when very confident
DOSE_DURATION_MS = 1500
DOSE_COOLDOWN_SECONDS = 6 * 3600                    # don't re-dose within 6 hours

# Rule-based next-step guidance for every known model class. Deliberately
# NOT routed through Ollama — recommendations already flagged as slow, and
# with only 9 fixed classes across both models, a fast, reliable lookup
# beats an LLM round-trip on every single manual analyze click.
ADVICE = {
    'common_rust': {
        'summary': "Common Rust — a fungal disease causing reddish-brown pustules on leaves.",
        'next_steps': "Apply a fungicide labeled for corn rust, avoid overhead irrigation that keeps leaves wet, and remove heavily infected leaves. Usually low yield impact unless severe before tasseling.",
    },
    'gray_leaf_spot': {
        'summary': "Gray Leaf Spot — a fungal disease favored by humid, warm conditions.",
        'next_steps': "Apply a foliar fungicide if caught before tasseling, and consider crop rotation away from corn next season. Managing old corn residue (tilling it under) reduces spread.",
    },
    'northern_leaf_blight': {
        'summary': "Northern Leaf Blight — long, greyish-green cigar-shaped lesions on leaves.",
        'next_steps': "Apply a fungicide if infection reaches upper leaves before grain fill. Resistant hybrids and crop rotation are the most effective long-term controls.",
    },
    'corn_borer': {
        'summary': "Corn Borer — larvae tunnel into stalks and ears, weakening the plant.",
        'next_steps': "Light infestations are often handled by the auto-dosing pump. For heavier infestations, consider a targeted insecticide and clear stalk debris after harvest to reduce overwintering larvae.",
    },
    'army_worm': {
        'summary': "Armyworm — caterpillars that strip leaves rapidly, often in large numbers.",
        'next_steps': "Act quickly and check neighboring zones for spread. Anything beyond light feeding usually needs an insecticide application — scout again at dawn or dusk when they're most active.",
    },
    'aphid': {
        'summary': "Aphids — small sap-sucking insects that cluster on new growth and can spread plant viruses.",
        'next_steps': "Light infestations often clear up with natural predators like ladybugs. For heavier clusters, an insecticidal soap or targeted insecticide is more reliable.",
    },
    'potosia_brevitarsis': {
        'summary': "Flower Beetle (Potosia brevitarsis) — feeds on flowers and soft plant tissue.",
        'next_steps': "Hand removal is usually enough for light presence. If numbers are high, a targeted insecticide applied in early morning works best.",
    },
    'healthy': {
        'summary': "No disease symptoms detected on this leaf.",
        'next_steps': "No action needed — keep up the current care routine.",
    },
    'no_pest': {
        'summary': "No pest activity detected.",
        'next_steps': "No action needed — continue routine monitoring.",
    },
}


def get_advice(predicted_class):
    return ADVICE.get(predicted_class, {
        'summary': predicted_class.replace('_', ' ').title(),
        'next_steps': "Monitor this zone closely and consider a manual inspection to confirm.",
    })


class VisionMonitoringService:
    def __init__(self, app=None):
        self.app = app
        self.is_monitoring = False
        self.monitoring_thread = None
        self.camera_source = CAMERA_SOURCE
        self.last_check_time = None
        self.last_check_results = []

    def init_app(self, app):
        self.app = app

    def _resolve_monitoring_identity(self):
        """Same approach as sensor_service.py's version — farm is the real
        identity (resolve_monitoring_farm_id reads it from the registered
        Device), this just looks up that farm's owner so _check_once's
        existing user_id-based internals don't need to change."""
        from utils.monitoring_user import resolve_monitoring_farm_id, resolve_monitoring_user_id
        farm_id = resolve_monitoring_farm_id()
        if farm_id:
            try:
                from models import Farm
                farm = Farm.query.get(farm_id)
                if farm:
                    return farm.owner_user_id
            except Exception as e:
                logger.error(f"Could not resolve owner for farm_id={farm_id}: {e}")
        return resolve_monitoring_user_id()

    def get_status(self):
        """Everything the frontend needs to render the 'Active Feed Modules'
        panel honestly: is the background loop running, is a camera even
        configured, and when did it last actually run."""
        return {
            'monitoring_active': self.is_monitoring,
            'camera_configured': bool(self.camera_source),
            'check_interval_seconds': CHECK_INTERVAL_SECONDS,
            'auto_dose_threshold': AUTO_DOSE_THRESHOLD,
            'dose_cooldown_seconds': DOSE_COOLDOWN_SECONDS,
            'disease_model_ready': disease_model_service.is_ready(),
            'pest_model_ready': pest_model_service.is_ready(),
            'last_check_time': self.last_check_time.isoformat() if self.last_check_time else None,
            'last_check_results': self.last_check_results,
        }

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
                            self._check_once(user_id=self._resolve_monitoring_identity())
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

    def capture_snapshot_bytes(self):
        """Grab a single JPEG frame from the configured camera right now —
        used by the manual 'capture from live feed' flow, and by /vision/snapshot
        for a still preview of the 'Active Feed Modules' tile."""
        frame = self._capture_frame()
        if frame is None:
            return None
        success, buffer = cv2.imencode(".jpg", frame)
        if not success:
            return None
        return buffer.tobytes()

    def stream_frames(self):
        """Generator yielding one open, persistent capture as an MJPEG
        multipart stream. Opens its own cv2.VideoCapture, separate from the
        one the background loop uses for periodic checks — most IP camera
        servers (e.g. Android IP Webcam) support multiple simultaneous MJPEG
        viewers fine, but this hasn't been load-tested against the real
        camera, so treat concurrent viewers as a known unknown."""
        cap = cv2.VideoCapture(self.camera_source)
        if not cap.isOpened():
            logger.error(f"Stream: could not open camera source: {self.camera_source}")
            return
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                success, buffer = cv2.imencode(".jpg", frame)
                if not success:
                    continue
                frame_bytes = buffer.tobytes()
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
                )
        finally:
            cap.release()

    def analyze_image(self, image_bytes, user_id, zone_id=None, save=True):
        """Run every ready model against ONE already-captured image and
        return the results — no auto-dose decision here. Used by both:
          - the manual 'Analyze' flow in Vision Monitoring (uploaded photo
            or a snapshot the farmer chose to submit), where a human is in
            the loop and should decide on treatment themselves; and
          - _check_once() below, which layers the auto-dose policy on top
            for the unattended camera loop.
        This is also the fix for models 'getting confused about which check
        to run': the frontend no longer has to pick disease vs. pest — both
        run, always, and the result tells you which (if either) found
        something.

        Each result also carries 'advice' (summary + next steps) and, when
        saved, a 'reading_id' for the farmer-feedback/retraining loop. When
        both models flag a problem in the same image, the higher-confidence
        one is marked 'primary' so the frontend can present one clear
        answer instead of two competing diagnoses."""
        results = []

        if disease_model_service.is_ready():
            disease_result = disease_model_service.predict(image_bytes)
            results.append(disease_result)

        if pest_model_service.is_ready():
            pest_result = pest_model_service.predict(image_bytes)
            results.append(pest_result)

        if not results:
            return results

        for result in results:
            result['advice'] = get_advice(result['predicted_class'])

        problems = [r for r in results if not r['is_negative']]
        if problems:
            top = max(problems, key=lambda r: r['confidence'])
            for r in results:
                r['primary'] = (r is top) if not r['is_negative'] else False
        else:
            for r in results:
                r['primary'] = False

        if save:
            image_path = save_plant_image(image_bytes, user_id, "check")
            for result in results:
                reading = self._log_reading(user_id, zone_id, result, image_path)
                result['reading_id'] = reading.reading_id

        return results

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
        results = self.analyze_image(image_bytes, user_id, zone_id, save=True)

        self.last_check_time = datetime.now()
        self.last_check_results = [
            {
                'predicted_class': r['predicted_class'],
                'confidence': r['confidence'],
                'is_negative': r['is_negative'],
                'model_version': r['model_version'],
            }
            for r in results
        ]

        for r in results:
            kind = 'Disease' if r['model_version'].startswith('disease') else 'Pest'
            logger.info(f"{kind} check — {r['predicted_class']} ({r['confidence']:.2%})")

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

    def _log_reading(self, user_id, zone_id, result, image_path, dosed=False):
        reading = PlantHealthReading(
            user_id=user_id,
            zone_id=zone_id,
            predicted_class=result["predicted_class"],
            confidence=result["confidence"],
            is_healthy=result["is_negative"],
            image_path=image_path,
            model_version=result["model_version"],
            dosed=dosed,
        )
        database.session.add(reading)
        database.session.commit()
        return reading

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

        if dose_success:
            reading_ids = [r["reading_id"] for r in candidates if r.get("reading_id")]
            if reading_ids:
                PlantHealthReading.query.filter(PlantHealthReading.reading_id.in_(reading_ids)).update(
                    {'dosed': True}, synchronize_session=False
                )

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
        advice = result.get('advice') or get_advice(result['predicted_class'])
        recommendation = Recommendation(
            user_id=user_id,
            title=f"Possible {result['predicted_class'].replace('_', ' ').title()} detected",
            description=(
                f"Camera detected possible {result['predicted_class'].replace('_', ' ')} "
                f"at {result['confidence']:.0%} confidence ({result['model_version']}) — "
                f"below the auto-treatment threshold. {advice['next_steps']}"
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