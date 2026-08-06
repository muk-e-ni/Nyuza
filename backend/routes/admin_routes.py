from flask import Blueprint, request, jsonify, session
from models import User, AdminLog, Sensors, IrrigationZone, SystemSettings
from config import database
from datetime import datetime
from functools import wraps

admin_bp = Blueprint('admin', __name__)

# Admin authentication decorator
def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        
        user = User.query.get(session['user_id'])
        if not user or user.role != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        
        return f(*args, **kwargs)
    return decorated

def log_admin_action(action, details=None):
    """Log admin actions for audit trail"""
    if 'user_id' in session:
        admin_log = AdminLog(
            admin_id=session['user_id'],
            action=action,
            details=details,
            ip_address=request.remote_addr
        )
        database.session.add(admin_log)
        database.session.commit()

# Admin Dashboard Statistics
@admin_bp.route('/api/dashboard', methods=['GET'])
@admin_required
def admin_dashboard():
    """Get admin dashboard statistics"""
    try:
        # User statistics
        total_users = User.query.count()
        active_users = User.query.filter_by(is_active=True).count()
        admin_users = User.query.filter_by(role='admin').count()
        
        # System statistics
        total_sensors = Sensors.query.count()
        active_sensors = Sensors.query.filter_by(status='active').count()
        total_zones = IrrigationZone.query.count()
        
        # Recent activity
        recent_logs = AdminLog.query.order_by(
            AdminLog.timestamp.desc()
        ).limit(10).all()
        
        recent_activity = []
        for log in recent_logs:
            recent_activity.append({
                'admin': log.admin.username,
                'action': log.action,
                'details': log.details,
                'timestamp': log.timestamp.isoformat()
            })
        
        return jsonify({
            'user_stats': {
                'total_users': total_users,
                'active_users': active_users,
                'admin_users': admin_users
            },
            'system_stats': {
                'total_sensors': total_sensors,
                'active_sensors': active_sensors,
                'total_zones': total_zones
            },
            'recent_activity': recent_activity
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# User Management
@admin_bp.route('/api/users', methods=['GET'])
@admin_required
def get_all_users():
    """Get all users (admin only)"""
    try:
        users = User.query.all()
        users_data = []
        
        for user in users:
            users_data.append({
                'id': user.user_id,
                'username': user.username,
                'email': user.email,
                'role': user.role,
                'is_active': user.is_active,
                'date_registered': user.date_registered.isoformat(),
                'last_login': user.last_login.isoformat() if user.last_login else None
            })
        
        log_admin_action('VIEW_ALL_USERS')
        return jsonify(users_data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/users/<int:user_id>/role', methods=['PUT'])
@admin_required
def update_user_role(user_id):
    """Update user role (admin only)"""
    try:
        data = request.get_json()
        new_role = data.get('role')
        
        if new_role not in ['admin', 'user']:
            return jsonify({'error': 'Invalid role'}), 400
        
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        old_role = user.role
        user.role = new_role
        database.session.commit()
        
        log_admin_action(
            'UPDATE_USER_ROLE',
            f'Changed user {user.username} from {old_role} to {new_role}'
        )
        
        return jsonify({'message': f'User role updated to {new_role}'})
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/users/<int:user_id>/status', methods=['PUT'])
@admin_required
def update_user_status(user_id):
    """Activate/deactivate user (admin only)"""
    try:
        data = request.get_json()
        is_active = data.get('is_active')
        
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        user.is_active = is_active
        database.session.commit()
        
        action = 'ACTIVATE_USER' if is_active else 'DEACTIVATE_USER'
        log_admin_action(action, f'User: {user.username}')
        
        return jsonify({'message': f'User {"activated" if is_active else "deactivated"}'})
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'error': str(e)}), 500

# Sensor Management
@admin_bp.route('/api/sensors/calibrate', methods=['POST'])
@admin_required
def calibrate_sensor():
    """Calibrate a sensor (admin only)"""
    try:
        data = request.get_json()
        sensor_id = data.get('sensor_id')
        calibration_data = data.get('calibration_data')
        
        sensor = Sensors.query.get(sensor_id)
        if not sensor:
            return jsonify({'error': 'Sensor not found'}), 404
        
        sensor.calibration_data = str(calibration_data)
        sensor.last_updated = datetime.now()
        database.session.commit()
        
        log_admin_action(
            'CALIBRATE_SENSOR',
            f'Sensor: {sensor.sensor_name}, Data: {calibration_data}'
        )
        
        return jsonify({'message': 'Sensor calibrated successfully'})
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/sensors', methods=['POST'])
@admin_required
def add_sensor():
    """Add new sensor (admin only)"""
    try:
        data = request.get_json()
        
        sensor = Sensors(
            sensor_name=data['sensor_name'],
            location=data['location'],
            type=data['type'],
            status='active'
        )
        
        database.session.add(sensor)
        database.session.commit()
        
        log_admin_action('ADD_SENSOR', f'Sensor: {sensor.sensor_name}')
        
        return jsonify({'message': 'Sensor added successfully', 'sensor_id': sensor.sensor_id})
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'error': str(e)}), 500

# System Configuration
@admin_bp.route('/api/system/advanced-settings', methods=['GET'])
@admin_required
def get_advanced_settings():
    """Get advanced system settings (admin only)"""
    try:
        settings = SystemSettings.query.all()
        settings_data = {}
        
        for setting in settings:
            settings_data[setting.setting_key] = {
                'value': setting.setting_value,
                'data_type': setting.data_type,
                'description': setting.description
            }
        
        return jsonify(settings_data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/system/advanced-settings', methods=['PUT'])
@admin_required
def update_advanced_settings():
    """Update advanced system settings (admin only)"""
    try:
        data = request.get_json()
        
        for key, value_data in data.items():
            setting = SystemSettings.query.filter_by(setting_key=key).first()
            if setting:
                setting.setting_value = str(value_data['value'])
                setting.last_updated = datetime.now()
        
        database.session.commit()
        
        log_admin_action('UPDATE_ADVANCED_SETTINGS', f'Updated: {list(data.keys())}')
        
        return jsonify({'message': 'Advanced settings updated successfully'})
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'error': str(e)}), 500

# Admin Logs
@admin_bp.route('/api/admin/logs', methods=['GET'])
@admin_required
def get_admin_logs():
    """Get admin activity logs (admin only)"""
    try:
        days = request.args.get('days', 7, type=int)
        since_time = datetime.now() - timedelta(days=days)
        
        logs = AdminLog.query.filter(
            AdminLog.timestamp >= since_time
        ).order_by(AdminLog.timestamp.desc()).all()
        
        logs_data = []
        for log in logs:
            logs_data.append({
                'log_id': log.log_id,
                'admin_username': log.admin.username,
                'action': log.action,
                'details': log.details,
                'ip_address': log.ip_address,
                'timestamp': log.timestamp.isoformat()
            })
        
        return jsonify(logs_data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500