from dotenv import load_dotenv
from flask import Blueprint, jsonify, request
from models import Recommendation, RecommendationAction
from config import database
from datetime import datetime
from services.ai_recommendation_engine import ai_recommendation_engine
from services import ollama_service

import jwt
import os
from functools import wraps
from datetime import datetime, timedelta

recommendation_bp = Blueprint('recommendations', __name__)

load_dotenv()
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

@recommendation_bp.route('/api/recommendations', methods=['GET'])
def get_recommendations():
    """Get AI recommendations"""
    try:
        status = request.args.get('status', 'pending')
        
        recommendations = Recommendation.query.filter_by(
            status=status
        ).order_by(
            Recommendation.priority.desc(),
            Recommendation.created_at.desc()
        ).all()
        
        recommendations_data = []
        for rec in recommendations:
            recommendations_data.append({
                'id': rec.recommendation_id,
                'title': rec.title,
                'description': rec.description,
                'type': rec.recommendation_type,
                'priority': rec.priority,
                'status': rec.status,
                'confidence_score': rec.confidence_score,
                'created_at': rec.created_at.isoformat(),
                'applied_at': rec.applied_at.isoformat() if rec.applied_at else None,
                'expires_at': rec.expires_at.isoformat() if rec.expires_at else None
            })
        
        return jsonify(recommendations_data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@recommendation_bp.route('/api/recommendations/<int:rec_id>/apply', methods=['POST'])
def apply_recommendation(rec_id):
    """Apply a recommendation"""
    try:
        recommendation = Recommendation.query.get(rec_id)
        if not recommendation:
            return jsonify({'error': 'Recommendation not found'}), 404
        
        # Implement recommendation logic based on type
        if recommendation.recommendation_type == 'irrigation_adjustment':
            # Adjust irrigation schedule
            pass
        elif recommendation.recommendation_type == 'water_saving':
            # Implement water saving measures
            pass
        # Add more recommendation types as needed
        
        recommendation.status = 'applied'
        recommendation.applied_at = datetime.now()
        
        # Create action log
        action = RecommendationAction(
            recommendation_id=rec_id,
            action_type='applied',
            executed_at=datetime.now(),
            result='success'
        )
        database.session.add(action)
        database.session.commit()
        
        return jsonify({'message': 'Recommendation applied successfully'})
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'error': str(e)}), 500

@recommendation_bp.route('/api/recommendations/<int:rec_id>/dismiss', methods=['POST'])
def dismiss_recommendation(rec_id):
    """Dismiss a recommendation"""
    try:
        recommendation = Recommendation.query.get(rec_id)
        if not recommendation:
            return jsonify({'error': 'Recommendation not found'}), 404
        
        recommendation.status = 'dismissed'
        database.session.commit()
        
        return jsonify({'message': 'Recommendation dismissed'})
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'error': str(e)}), 500
    

# Add these AI routes to your existing recommendation_routes.py

@recommendation_bp.route('/api/personalized-report/<int:days>', methods=['GET'])
@token_required
def get_personalized_report(days):
    """Get personalized report with user-specific insights"""
    try:
        user_id = request.user_id
        force_refresh = request.args.get('refresh', 'false').lower() == 'true'
        
        if not user_id:
            return jsonify({
                'success': False, 
                'error': 'User identity not found'
            }), 401
        
        result = ai_recommendation_engine.generate_personalized_report(user_id, days, force_refresh=force_refresh)
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error in personalized report: {e}")
        return jsonify({
            'success': False, 
            'error': str(e)
        }), 500

@recommendation_bp.route('/api/comprehensive-report/<int:days>', methods=['GET'])
@token_required
def get_comprehensive_report(days):
    """Get comprehensive AI analysis report"""
    try:
        user_id = request.user_id
        force_refresh = request.args.get('refresh', 'false').lower() == 'true'
        
        if not user_id:
            return jsonify({
                'success': False, 
                'error': 'User identity not found'
            }), 401
        
        result = ai_recommendation_engine.generate_comprehensive_report(user_id, days, force_refresh=force_refresh)
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error in comprehensive report: {e}")
        return jsonify({
            'success': False, 
            'error': str(e)
        }), 500

# Track last generation time per user
last_generation_time = {}

@recommendation_bp.route('/api/smart-recommendation', methods=['GET'])
@token_required
def get_smart_ai_recommendation():
    """Get comprehensive AI recommendation with throttling"""
    try:
        user_id = request.user_id
        zone_id = request.args.get('zone_id', type=int)
        
        if not user_id:
            return jsonify({'success': False, 'error': 'User identity not found'}), 401
        
        # Throttle: Only generate new recommendations once per hour per user
        now = datetime.now()
        last_gen = last_generation_time.get(user_id)
        
        if last_gen and (now - last_gen) < timedelta(minutes=20):
            return jsonify({
                'success': True,
                'message': 'Recommendations recently generated. Using cached data.',
                'throttled': True
            })
        
        # Update generation time
        last_generation_time[user_id] = now
        
        result = ai_recommendation_engine.generate_intelligent_recommendations(user_id, zone_id)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@recommendation_bp.route('/api/personalized-recommendations', methods=['GET'])
@token_required
def get_personalized_recommendations():
    """Get personalized recommendations based on user's setup and history"""
    try:
        user_id = request.user_id
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
@recommendation_bp.route('/api/debug/recommendations', methods=['GET'])
def debug_recommendations():
    """Debug endpoint to check recommendation service"""
    try:
        return jsonify({
            'success': True,
            'message': 'Recommendation service is running',
            'timestamp': datetime.now().isoformat(),
            'endpoints_working': True
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@recommendation_bp.route('/api/ollama-status', methods=['GET'])
def get_ollama_status():
    """Check Ollama service status"""
    try:
        # Test if Ollama is responding
        test_prompt = "Hello"
        response = ollama_service.client.chat(
            model=ollama_service.model,
            messages=[{"role": "user", "content": test_prompt}]
        )
        
        return jsonify({
            'success': True,
            'status': 'online',
            'model': ollama_service.model,
            'response': 'Ollama is working'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'status': 'offline',
            'error': str(e),
            'model': ollama_service.model
        }), 500