from flask import Blueprint, jsonify, request
from services.ai_recommendation_engine import ai_recommendation_engine
from services.genai_service import genai_service as ollama_service  # renamed backend, same object shape — see genai_service.py
from datetime import datetime
import jwt
import os
from functools import wraps
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET_KEY = os.getenv('SECRET_KEY', '')
JWT_ALGORITHM = 'HS256'

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
        except Exception as e:
            return jsonify({'success': False, 'error': 'Token verification failed'}), 401

        return f(*args, **kwargs)      
    return decorated

ai_bp = Blueprint('ai', __name__)

@ai_bp.route('/personalized-recommendations', methods=['GET'])
@token_required
def get_personalized_recommendations():
    """Get personalized AI recommendations using real AI"""
    try:
        user_id = request.user_id
        zone_id = request.args.get('zone_id', type=int)
        force_refresh = request.args.get('refresh', 'false').lower() == 'true'
        
        print(f"🔍 AI Personalized Recommendation - User: {user_id}, Zone: {zone_id}, refresh={force_refresh}")
        
        # Use the real AI engine (cached unless force_refresh)
        result = ai_recommendation_engine.generate_intelligent_recommendations(user_id, zone_id, force_refresh=force_refresh)
        
        print(f"✅ AI Recommendation generated - Ollama: {result.get('ollama_available', False)}")
        
        return jsonify(result)
        
    except Exception as e:
        print(f"❌ AI recommendation error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@ai_bp.route('/smart-recommendation', methods=['GET'])
@token_required
def get_smart_recommendation():
    """Get smart AI recommendation using real AI"""
    try:
        user_id = request.user_id
        zone_id = request.args.get('zone_id', type=int)
        force_refresh = request.args.get('refresh', 'false').lower() == 'true'
        
        print(f"🔍 AI Smart Recommendation - User: {user_id}, Zone: {zone_id}, refresh={force_refresh}")
        
        # Use the real AI engine (cached unless force_refresh)
        result = ai_recommendation_engine.generate_intelligent_recommendations(user_id, zone_id, force_refresh=force_refresh)
        
        return jsonify(result)
        
    except Exception as e:
        print(f"❌ Smart recommendation error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@ai_bp.route('/system-state', methods=['GET'])
@token_required
def get_system_state():
    """Get current system state"""
    try:
        user_id = request.user_id
        zone_id = request.args.get('zone_id', type=int)
        
        print(f"🔍 AI System State - User: {user_id}, Zone: {zone_id}")
        
        # Get real system state from AI engine
        system_state = ai_recommendation_engine.get_current_system_state(zone_id)
        
        return jsonify({
            'success': True,
            'system_state': system_state,
            'user_id': user_id,
            'zone_id': zone_id,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        print(f"❌ System state error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@ai_bp.route('/ollama-status', methods=['GET'])
@token_required
def get_ollama_status():
    """Get Ollama service status"""
    try:
        models = ollama_service.get_available_models()
        
        return jsonify({
            'success': True,
            'ollama_available': ollama_service.is_available,
            'base_url': ollama_service.base_url,
            'current_model': ollama_service.model,
            'available_models': models,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        print(f"❌ Ollama status error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@ai_bp.route('/test-ai', methods=['GET'])
@token_required
def test_ai_integration():
    """Test AI integration with real data"""
    try:
        user_id = request.user_id
        
        # Test Ollama
        ollama_status = ollama_service.is_available
        ollama_models = ollama_service.get_available_models()
        
        # Test ML engine
        test_features = [45, 25, 65, 0, 5, 12, 1, 6, 1, 1]  # Sample features
        ml_prediction, ml_confidence = ai_recommendation_engine.ml_engine.predict_irrigation_need(test_features)
        
        # Test weather service
        weather_data = ai_recommendation_engine.weather_service.get_current_weather()
        
        return jsonify({
            'success': True,
            'ai_integration_test': {
                'ollama_available': ollama_status,
                'ollama_models': [m.get('name', 'Unknown') for m in ollama_models],
                'ml_engine_working': True,
                'ml_prediction': ml_prediction,
                'ml_confidence': ml_confidence,
                'weather_service_working': weather_data.get('success', False),
                'weather_source': weather_data.get('source', 'unknown')
            },
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        print(f"❌ AI integration test error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@ai_bp.route('/test-simple', methods=['GET'])
def test_simple():
    """Simple test endpoint without authentication"""
    return jsonify({
        'success': True, 
        'message': 'AI routes are working!',
        'ollama_available': ollama_service.is_available,
        'timestamp': datetime.now().isoformat()
    })