from flask import Blueprint, jsonify, request
from services.notification_service import notification_service
from models import NotificationLog, User
from config import database
from datetime import datetime, timedelta
import jwt
import os

notification_bp = Blueprint('notifications', __name__)
JWT_SECRET_KEY = os.getenv('SECRET_KEY', '123BRANDON')

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

@notification_bp.route('/api/notifications', methods=['GET'])
@token_required
def get_notifications():
    """Get user's notifications"""
    try:
        user_id = request.user_id
        days = request.args.get('days', 7, type=int)
        
        since_date = datetime.now() - timedelta(days=days)
        
        notifications = NotificationLog.query.filter(
            NotificationLog.user_id == user_id,
            NotificationLog.created_at >= since_date
        ).order_by(NotificationLog.created_at.desc()).all()
        
        notifications_data = []
        for notification in notifications:
            notifications_data.append({
                'id': notification.notification_id,
                'title': notification.title,
                'message': notification.message,
                'type': notification.notification_type,
                'sent_via': notification.sent_via.split(','),
                'status': notification.status,
                'created_at': notification.created_at.isoformat(),
                'read': notification.read
            })
        
        return jsonify({
            'success': True,
            'notifications': notifications_data,
            'unread_count': len([n for n in notifications if not n.read])
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@notification_bp.route('/api/notifications/<int:notification_id>/read', methods=['PUT'])
@token_required
def mark_notification_read(notification_id):
    """Mark notification as read"""
    try:
        notification = NotificationLog.query.get(notification_id)
        
        if not notification or notification.user_id != request.user_id:
            return jsonify({'success': False, 'error': 'Notification not found'}), 404
        
        notification.read = True
        database.session.commit()
        
        return jsonify({'success': True, 'message': 'Notification marked as read'})
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@notification_bp.route('/api/notifications/read-all', methods=['PUT'])
@token_required
def mark_all_notifications_read():
    """Mark all notifications as read"""
    try:
        NotificationLog.query.filter_by(
            user_id=request.user_id,
            read=False
        ).update({'read': True})
        
        database.session.commit()
        
        return jsonify({'success': True, 'message': 'All notifications marked as read'})
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@notification_bp.route('/api/notifications/test', methods=['POST'])
@token_required
def test_notification():
    """Test notification method"""
    try:
        data = request.get_json()
        method = data.get('method')
        
        if method not in ['email', 'sms', 'push']:
            return jsonify({'success': False, 'error': 'Invalid method'}), 400
        
        success = notification_service.test_notification(request.user_id, method)
        
        if success:
            return jsonify({'success': True, 'message': f'{method.upper()} test notification sent'})
        else:
            return jsonify({'success': False, 'error': f'Failed to send {method} test'}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@notification_bp.route('/api/notifications/system-alert', methods=['POST'])
@token_required
def send_system_alert():
    """Send system alert (admin only)"""
    try:
        data = request.get_json()
        alert_type = data.get('alert_type')
        details = data.get('details')
        user_id = data.get('user_id')  # Optional: send to specific user
        
        # Check if user is admin (you might want to add proper admin check)
        user = User.query.get(request.user_id)
        if not user or user.role != 'admin':
            return jsonify({'success': False, 'error': 'Admin access required'}), 403
        
        success = notification_service.send_system_alert(alert_type, details, user_id)
        
        if success:
            return jsonify({'success': True, 'message': 'System alert sent'})
        else:
            return jsonify({'success': False, 'error': 'Failed to send system alert'}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500