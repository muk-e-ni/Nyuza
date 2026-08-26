from flask import Blueprint, request, jsonify
import jwt
import os
from functools import wraps
from services.ai_recommendation_engine import ai_recommendation_engine
from services.ollama_service import ollama_service
from services.weather_service import weather_service
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

ai_bp = Blueprint('ai', __name__)

JWT_SECRET_KEY = os.getenv('SECRET_KEY', '')
JWT_ALGORITHM = 'HS256'

def token_required(f):
    """JWT token verification decorator"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Get token from Authorization header
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({
                'success': False, 
                'error': 'Token is missing'
            }), 401
        
        try:
            # Decode and verify the token
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            # Store user info in request context for access in routes
            request.user_id = payload.get('user_id')
            request.user_role = payload.get('role')
        except jwt.ExpiredSignatureError:
            return jsonify({
                'success': False, 
                'error': 'Token has expired'
            }), 401
        except jwt.InvalidTokenError:
            return jsonify({
                'success': False, 
                'error': 'Invalid token'
            }), 401
        except Exception as e:
            return jsonify({
                'success': False, 
                'error': 'Token verification failed'
            }), 401
        
        return f(*args, **kwargs)
    return decorated

def get_jwt_identity():
    """Get user identity from JWT token"""
    return getattr(request, 'user_id', None)

def get_jwt_role():
    """Get user role from JWT token"""
    return getattr(request, 'user_role', None)

@ai_bp.route('/smart-recommendation', methods=['GET'])
@token_required
def get_smart_ai_recommendation():
    """Get comprehensive AI recommendation with Ollama insights"""
    try:
        user_id = get_jwt_identity()
        zone_id = request.args.get('zone_id', type=int)
        
        if not user_id:
            return jsonify({
                'success': False, 
                'error': 'User identity not found'
            }), 401
        
        result = ai_recommendation_engine.generate_intelligent_recommendations(
            user_id, zone_id
        )
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
@ai_bp.route('/personalized-recommendations', methods=['GET'])
@token_required
def get_personalized_recommendations():
    """Get personalized recommendations based on user's actual setup and history"""
    try:
        user_id = get_jwt_identity()
        zone_id = request.args.get('zone_id', type=int)
        
        if not user_id:
            return jsonify({
                'success': False, 
                'error': 'User identity not found'
            }), 401
        
        result = ai_recommendation_engine.generate_intelligent_recommendations(user_id, zone_id)
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@ai_bp.route('/personalized-report/<int:days>', methods=['GET'])
@token_required
def get_personalized_report(days):
    """Get personalized report with user-specific insights"""
    try:
        user_id = get_jwt_identity()
        
        if not user_id:
            return jsonify({
                'success': False, 
                'error': 'User identity not found'
            }), 401
        
        result = ai_recommendation_engine.generate_personalized_report(user_id, days)
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@ai_bp.route('/user-profile', methods=['GET'])
@token_required
def get_user_profile():
    """Get user profile information for personalization"""
    try:
        user_id = get_jwt_identity()
        
        if not user_id:
            return jsonify({
                'success': False, 
                'error': 'User identity not found'
            }), 401
        
        user_profile = ai_recommendation_engine.get_user_profile(user_id)
        
        return jsonify({
            'success': True,
            'user_profile': user_profile
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    
@ai_bp.route('/comprehensive-report/<int:days>', methods=['GET'])
@token_required
def get_comprehensive_report(days):
    """Get comprehensive AI analysis report using Ollama"""
    try:
        user_id = get_jwt_identity()
        
        if not user_id:
            return jsonify({
                'success': False, 
                'error': 'User identity not found'
            }), 401
        
        result = ai_recommendation_engine.generate_comprehensive_report(user_id, days)
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@ai_bp.route('/ollama-status', methods=['GET'])
@token_required
def get_ollama_status():
    """Check Ollama service status"""
    try:
        user_id = get_jwt_identity()
        
        if not user_id:
            return jsonify({
                'success': False, 
                'error': 'User identity not found'
            }), 401
            
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
        return jsonify({'success': False, 'error': str(e)}), 500

@ai_bp.route('/test-prompt', methods=['POST'])
@token_required
def test_ollama_prompt():
    """Test Ollama with a custom prompt"""
    try:
        user_id = get_jwt_identity()
        
        if not user_id:
            return jsonify({
                'success': False, 
                'error': 'User identity not found'
            }), 401
            
        data = request.get_json()
        prompt = data.get('prompt', '')
        
        if not prompt:
            return jsonify({
                'success': False, 
                'error': 'Prompt is required'
            }), 400
        
        # Simple test with Ollama
        test_response = ollama_service.generate_irrigation_insights(
            {'current_moisture': 45, 'temperature': 25},
            {'temperature': 28, 'humidity': 65, 'rainfall': 0, 'success': True},
            {'irrigation_needed': True, 'confidence': 0.85, 'recommended_water': 25}
        )
        
        return jsonify({
            'success': True,
            'prompt': prompt,
            'response': test_response,
            'ollama_available': ollama_service.is_available
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500