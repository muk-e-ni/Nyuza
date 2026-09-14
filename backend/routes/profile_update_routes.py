from flask import Blueprint, jsonify, request
from models import UserPreferences, User, IrrigationLog, IrrigationSchedule
from config import database
from datetime import datetime, timedelta
import jwt
import os 
from functools import wraps
import re 
from dotenv import load_dotenv

profile_bp = Blueprint('profile', __name__)

load_dotenv()
JWT_SECRET_KEY = os.getenv('SECRET_KEY', '')
JWT_ALGORITHM = 'HS256'

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if request.method == 'OPTIONS':
           return jsonify({'success': True}), 200

        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '): 
            token = auth_header.split(' ')[1]

        if not token:
            return jsonify({'success': False, 'error': 'Token is missing'}), 401
        
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            request.user_id = payload.get('user_id')
            request.user_role = payload.get('role')

            print(f"JWT DEBUG - User ID: {request.user_id}, Role: {request.user_role}")

        except jwt.ExpiredSignatureError:
            return jsonify({'success': False, 'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'success': False, 'error': 'Invalid token'}), 401
        except Exception as e:
            return jsonify({'success': False, 'error': 'Token verification failed'}), 401

        return f(*args, **kwargs)      
    return decorated

@profile_bp.route('/api/profile', methods=['PUT', 'OPTIONS'])
@token_required
def update_profile():  
    try:
        data = request.get_json()
        user_id = request.user_id
        
        user = User.query.get(user_id)
        if not user:
            return jsonify({'success': False, 'message': 'User not found'}), 404
        
        # Check if username is being changed and validate
        if 'username' in data and data['username'] != user.username:
            # Check if username already exists
            existing_user = User.query.filter(
                User.username == data['username'],
                User.user_id != user_id
            ).first()
            
            if existing_user:
                return jsonify({
                    'success': False, 
                    'message': 'Username already taken'
                }), 400
            
            # Validate username
            if len(data['username'].strip()) < 3:
                return jsonify({
                    'success': False,
                    'message': 'Username must be at least 3 characters long'
                }), 400
            
            if not re.match(r'^[a-zA-Z0-9_]+$', data['username'].strip()):
                return jsonify({
                    'success': False,
                    'message': 'Username can only contain letters, numbers, and underscores'
                }), 400
            
            user.username = data['username'].strip()

        # Update phone/contact number if provided
        if 'phone_number' in data:
            user.phone_number = data['phone_number']

        # Update profile picture if provided (client-resized base64 data URI,
        # or null/empty string to remove it)
        if 'profile_picture' in data:
            picture = data['profile_picture']
            if picture and len(picture) > 2_000_000:  # ~2MB base64 safety cap
                return jsonify({'success': False, 'message': 'Image is too large — please use a smaller photo'}), 400
            user.profile_picture = picture or None
        
        # Update password if provided
        if 'new_password' in data and 'current_password' in data:
            # Verify current password
            if not user.check_password(data['current_password']):
                return jsonify({'success': False, 'message': 'Current password is incorrect'}), 400
            
            # Validate new password
            if len(data['new_password']) < 6:
                return jsonify({
                    'success': False,
                    'message': 'New password must be at least 6 characters long'
                }), 400
            
            user.set_password(data['new_password'])
        
        # Update preferences
        if 'notifications' in data or 'language' in data or 'timezone' in data:
            preferences = UserPreferences.query.filter_by(user_id=user_id).first()
            if not preferences:
                preferences = UserPreferences(user_id=user_id)
                database.session.add(preferences)
            
            if 'notifications' in data:
                preferences.notifications = data['notifications']
            if 'language' in data:
                preferences.language = data['language']
            if 'timezone' in data:
                preferences.timezone = data['timezone']
            
            preferences.updated_at = datetime.now()
        
        database.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Profile updated successfully',
            'user': {
                'id': user.user_id,
                'username': user.username,
                'email': user.email,
                'phone_number': user.phone_number,
                'profile_picture': user.profile_picture
            }
        })
        
    except Exception as e:
        database.session.rollback()
        print(f"Profile update error: {str(e)}")
        return jsonify({'success': False, 'message': 'An error occurred while updating profile'}), 500

@profile_bp.route('/api/delete-account', methods=['POST'])
@token_required
def delete_account():
    if request.method == 'OPTIONS':
        return jsonify({'success': True}), 200    
    try:
        data = request.get_json()
        user_id = request.user_id
        
        user = User.query.get(user_id)
        if not user:
            return jsonify({'success': False, 'message': 'User not found'}), 404
        
        # Verify password
        if not user.check_password(data.get('password', '')):
            return jsonify({'success': False, 'message': 'Invalid password'}), 400
        
        # Delete user data
        IrrigationLog.query.filter_by(user_id=user_id).delete()
        IrrigationSchedule.query.filter_by(user_id=user_id).delete()
        UserPreferences.query.filter_by(user_id=user_id).delete()
        
        # Delete user account
        database.session.delete(user)
        database.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Account deleted successfully'
        })
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@profile_bp.route('/api/export-data', methods=['GET'])
@token_required
def export_user_data():
    if request.method == 'OPTIONS':
        return jsonify({'success': True}), 200    
    try:
        user_id = request.user_id
        
        # Get user data
        user = User.query.get(user_id)
        if not user:
            return jsonify({'success': False, 'message': 'User not found'}), 404
        
        # Get user's irrigation history
        irrigation_logs = IrrigationLog.query.filter_by(user_id=user_id).all()
        
        # Get user's schedules
        schedules = IrrigationSchedule.query.filter_by(user_id=user_id).all()
        
        # Compile export data
        export_data = {
            'user_info': {
                'user_id': user.user_id,
                'username': user.username,
                'email': user.email,
                'role': user.type,
                'date_registered': user.date_registered.isoformat() if user.date_registered else None
            },
            'irrigation_history': [
                {
                    'log_id': log.log_id,
                    'zone': log.zone,
                    'duration': log.duration,
                    'water_used': log.water_used,
                    'start_time': log.start_time.isoformat(),
                    'trigger_type': log.trigger_type,
                    'status': log.status
                } for log in irrigation_logs
            ],
            'schedules': [
                {
                    'schedule_id': schedule.schedule_id,
                    'zone_name': schedule.zone.zone_name if schedule.zone else None,
                    'name': schedule.name,
                    'trigger_type': schedule.trigger_type,
                    'moisture_threshold': schedule.moisture_threshold,
                    'duration': schedule.duration,
                    'is_active': schedule.is_active
                } for schedule in schedules
            ],
            'export_info': {
                'export_date': datetime.now().isoformat(),
                'data_points': len(irrigation_logs) + len(schedules)
            }
        }
        
        return jsonify({
            'success': True,
            'data': export_data
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500