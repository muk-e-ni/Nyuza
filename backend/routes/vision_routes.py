from flask import Blueprint, jsonify, request
from datetime import datetime
import os
import jwt
from functools import wraps
from dotenv import load_dotenv

from services.disease_model_service import disease_model_service
from utils.image_storage import save_plant_image
from models import PlantHealthReading
from config import database

load_dotenv()

JWT_SECRET_KEY = os.getenv('SECRET_KEY', '')
JWT_ALGORITHM = 'HS256'


# Same token_required pattern as routes/ai_routes.py — kept local to this
# file rather than shared, matching how the rest of the codebase does it.
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]

        if not token:
            return jsonify({'success': False, 'error': 'Token is missing'}), 401

        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            request.user_id = payload.get('user_id')
            request.user_role = payload.get('role')
        except jwt.ExpiredSignatureError:
            return jsonify({'success': False, 'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'success': False, 'error': 'Invalid token'}), 401
        except Exception:
            return jsonify({'success': False, 'error': 'Token verification failed'}), 401

        return f(*args, **kwargs)
    return decorated


vision_bp = Blueprint('vision', __name__)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@vision_bp.route('/detect-disease', methods=['POST'])
@token_required
def detect_disease():
    """Upload a leaf image (multipart form field 'image') and get a disease prediction."""
    try:
        if not disease_model_service.is_ready():
            return jsonify({
                'success': False,
                'error': 'Disease model is not loaded on the server — check models/disease_model.pt exists'
            }), 503

        if 'image' not in request.files:
            return jsonify({'success': False, 'error': 'No image file provided (expected form field "image")'}), 400

        image_file = request.files['image']
        if image_file.filename == '':
            return jsonify({'success': False, 'error': 'Empty filename'}), 400

        if not allowed_file(image_file.filename):
            return jsonify({'success': False, 'error': 'Unsupported file type — use png, jpg, or jpeg'}), 400

        zone_id = request.form.get('zone_id', type=int)
        user_id = request.user_id

        image_bytes = image_file.read()
        result = disease_model_service.predict(image_bytes)
        image_path = save_plant_image(image_bytes, user_id, result['predicted_class'])

        # Persist the reading so it shows up in history / a future dashboard.
        reading = PlantHealthReading(
            user_id=user_id,
            zone_id=zone_id,
            predicted_class=result['predicted_class'],
            confidence=result['confidence'],
            is_healthy=result['is_healthy'],
            image_path=image_path,
            model_version='disease_v1',
        )
        database.session.add(reading)
        database.session.commit()

        print(f"🔍 Disease detection — User: {user_id}, Zone: {zone_id}, "
              f"Result: {result['predicted_class']} ({result['confidence']:.2%})")

        return jsonify({
            'success': True,
            'reading_id': reading.reading_id,
            'result': result,
            'zone_id': zone_id,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        print(f"❌ Disease detection error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@vision_bp.route('/history', methods=['GET'])
@token_required
def get_detection_history():
    """List recent plant health readings for the current user, optionally filtered by zone."""
    try:
        user_id = request.user_id
        zone_id = request.args.get('zone_id', type=int)
        limit = request.args.get('limit', default=20, type=int)

        query = PlantHealthReading.query.filter_by(user_id=user_id)
        if zone_id:
            query = query.filter_by(zone_id=zone_id)

        readings = query.order_by(PlantHealthReading.timestamp.desc()).limit(limit).all()

        return jsonify({
            'success': True,
            'count': len(readings),
            'readings': [
                {
                    'reading_id': r.reading_id,
                    'zone_id': r.zone_id,
                    'predicted_class': r.predicted_class,
                    'confidence': r.confidence,
                    'is_healthy': r.is_healthy,
                    'timestamp': r.timestamp.isoformat(),
                }
                for r in readings
            ]
        })

    except Exception as e:
        print(f"❌ Detection history error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500