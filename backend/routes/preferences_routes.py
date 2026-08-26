from flask import Blueprint, jsonify, request
from models import UserPreferences, database
import jwt
import os

from dotenv import load_dotenv

load_dotenv()
preferences_bp = Blueprint('preferences', __name__)
JWT_SECRET_KEY = os.getenv('SECRET_KEY', '')

def token_required(f):
    """JWT token verification decorator"""
    from functools import wraps
    
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'success': False, 'error': 'Token is missing'}), 401
        
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=['HS256'])
            request.user_id = payload.get('user_id')
        except:
            return jsonify({'success': False, 'error': 'Invalid token'}), 401
        
        return f(*args, **kwargs)
    return decorated

@preferences_bp.route('/api/preferences', methods=['GET'])
@token_required
def get_preferences():
    """Get user preferences"""
    try:
        preferences = UserPreferences.query.filter_by(user_id=request.user_id).first()
        
        if not preferences:
            # Create default preferences
            preferences = UserPreferences(user_id=request.user_id)
            database.session.add(preferences)
            database.session.commit()
        
        # Ensure notification_methods has a value
        notification_methods = preferences.notification_methods or {
            'web': True,
            'email': False,
            'sms': False,
            'push': False
        }
        
        return jsonify({
            'success': True,
            'preferences': {
                'notifications': preferences.notifications,
                'language': preferences.language,
                'timezone': preferences.timezone,
                'notification_methods': notification_methods
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@preferences_bp.route('/api/preferences', methods=['PUT'])
@token_required
def update_preferences():
    """Update user preferences"""
    try:
        data = request.get_json()
        preferences = UserPreferences.query.filter_by(user_id=request.user_id).first()
        
        if not preferences:
            preferences = UserPreferences(user_id=request.user_id)
            database.session.add(preferences)
        
        # Update fields
        if 'notifications' in data:
            preferences.notifications = data['notifications']
        if 'language' in data:
            preferences.language = data['language']
        if 'timezone' in data:
            preferences.timezone = data['timezone']
        if 'notification_methods' in data:
            preferences.notification_methods = data['notification_methods']
        
        database.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Preferences updated successfully'
        })
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500