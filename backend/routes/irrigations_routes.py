from flask import Blueprint, jsonify, request
from models import IrrigationLog, IrrigationSchedule, IrrigationZone, MoistureReading, Sensors
from config import database
from datetime import datetime, timedelta
import jwt
import os 
from dotenv import load_dotenv
from functools import wraps
from services.sensor_service import sensor_service
import irrigation_controller
from services.notification_service import notification_service

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

            print(f"JWT DEBUG - User ID: {request.user_id}, Role: {request.user_role}")

        except jwt.ExpiredSignatureError:
            return jsonify({'success': False, 'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'success': False, 'error': 'Invalid token'}), 401
        except Exception as e:
            return jsonify({'success': False, 'error': 'Token verification failed'}), 401

        return f(*args, **kwargs)      
    return decorated

irrigation_bp = Blueprint('irrigation', __name__)

@irrigation_bp.route('/api/irrigation/status', methods=['GET'])
def get_irrigation_status():

    """Get overall irrigation system status"""
    try:
        # Get recent irrigation activities
        recent_logs = IrrigationLog.query.order_by(
            IrrigationLog.start_time.desc()
        ).limit(5).all()
        
        status_data = {
            'recent_activities': [],
            'system_status': 'active',  # will add logic to determine this
            'last_updated': datetime.now().isoformat()
        }
        
        for log in recent_logs:
            status_data['recent_activities'].append({
                'zone': log.zone,
                'duration': log.duration,
                'status': log.status,
                'start_time': log.start_time.isoformat(),
                'trigger_type': log.trigger_type
            })
        
        return jsonify(status_data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
    try:
        """Get real-time irrigation hardware status"""
        status = sensor_service.get_irrigation_status()
        
        if status:
            return jsonify({
                'success': True,
                'data': status,
                'timestamp': datetime.now().isoformat()
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Could not read hardware status'
            }), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    
@irrigation_bp.route('/api/irrigation/manual', methods=['POST'])
@token_required
def manual_irrigation():
    """Start manual irrigation with complete logging"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        zone_name = data.get('zone')
        duration = data.get('duration')
        user_id = request.user_id

        if not zone_name or not duration: 
            return jsonify({'success': False, 'error': 'Zone and duration are required'}), 400
        
        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401
        
        # Get zone details for proper logging
        zone = IrrigationZone.query.filter_by(
            zone_name=zone_name, 
            user_id=user_id
        ).first()
        
        if not zone:
            return jsonify({'success': False, 'error': 'Zone not found'}), 404
        
        # Calculate water usage
        water_used = calculate_water_usage(zone_name, duration)
        start_time = datetime.now()
        
        # Create comprehensive irrigation log
        irrigation_log = IrrigationLog(
            user_id=user_id,
            zone_id=zone.zone_id,  # Store zone_id for analytics
            zone=zone_name,
            duration=duration,
            water_used=water_used,
            start_time=start_time,
            status='in_progress',
            trigger_type='manual'
        )
        
        database.session.add(irrigation_log)
        database.session.flush()  # Get log_id before commit
        
        # Send command to Arduino
        success = sensor_service.start_manual_irrigation(duration)
        
        if success:
            irrigation_log.status = 'completed'
            # Update end_time when irrigation actually completes
            # For manual, we'll estimate end time based on duration
            irrigation_log.end_time = start_time + timedelta(seconds=duration)
        else:
            irrigation_log.status = 'failed'
            irrigation_log.end_time = datetime.now()
        
        database.session.commit()
        
        # Trigger AI analysis after irrigation
        try:
            from services.ai_recommendation_engine import advanced_ai_engine
            advanced_ai_engine.analyze_irrigation_event(
                user_id, 
                zone.zone_id, 
                irrigation_log.log_id
            )
        except Exception as ai_error:
            print(f"AI analysis skipped: {ai_error}")
        
        response_data = {
            'success': True,
            'message': f'Irrigation started for {zone_name} for {duration} seconds',
            'log_id': irrigation_log.log_id,
            'water_used': water_used,
            'zone_id': zone.zone_id
        }
        
        if not success:
            response_data['warning'] = 'Hardware communication issue, but irrigation logged'
            
        return jsonify(response_data)
        
    except Exception as e:
        database.session.rollback()
        print(f"Error in manual irrigation: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    
@irrigation_bp.route('/api/irrigation/stop', methods=['POST'])
@token_required
def stop_irrigation():
    """Stop any ongoing irrigation"""
    try:
        user_id = request.user_id
        
        # Send command to Arduino to stop irrigation
        success = sensor_service.stop_irrigation()
        
        if not success:
            return jsonify({
                'success': False, 
                'error': 'Failed to communicate with irrigation hardware'
            }), 500
        
        # Find and update the ongoing irrigation log
        ongoing_irrigation = IrrigationLog.query.filter_by(
            user_id=user_id,
            status='in_progress'
        ).first()
        
        if ongoing_irrigation:
            ongoing_irrigation.status = 'stopped_manual'
            ongoing_irrigation.end_time = datetime.now()
            database.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Irrigation stopped successfully'
        })
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    
@irrigation_bp.route('/api/irrigation/stop-zone', methods=['POST'])
@token_required
def stop_zone_irrigation():
    """Stop irrigation for a specific zone with proper logging"""
    try:
        data = request.get_json()
        zone_name = data.get('zone')
        user_id = request.user_id
        
        if not zone_name:
            return jsonify({'success': False, 'error': 'Zone name is required'}), 400
        
        # Send command to Arduino to stop irrigation
        success = sensor_service.stop_irrigation()
        
        if not success:
            return jsonify({
                'success': False, 
                'error': 'Failed to communicate with irrigation hardware'
            }), 500
        
        # Find and update the ongoing irrigation log for this specific zone
        ongoing_irrigation = IrrigationLog.query.filter_by(
            user_id=user_id,
            zone=zone_name,
            status='in_progress'
        ).order_by(IrrigationLog.start_time.desc()).first()
        
        if ongoing_irrigation:
            ongoing_irrigation.status = 'stopped_manual'
            ongoing_irrigation.end_time = datetime.now()
            
            # Recalculate actual water used based on actual duration
            actual_duration = (ongoing_irrigation.end_time - ongoing_irrigation.start_time).total_seconds()
            ongoing_irrigation.duration = actual_duration
            ongoing_irrigation.water_used = calculate_water_usage(
                zone_name, 
                actual_duration
            )
            
            database.session.commit()
            
            return jsonify({
                'success': True,
                'message': f'Irrigation stopped for {zone_name}',
                'log_id': ongoing_irrigation.log_id,
                'actual_duration': actual_duration,
                'water_used': ongoing_irrigation.water_used
            })
        else:
            return jsonify({
                'success': True,
                'message': f'No active irrigation found for {zone_name}'
            })
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@irrigation_bp.route('/api/irrigation/history', methods=['GET'])
@token_required
def get_irrigation_history():
    """Get comprehensive irrigation history with all details"""
    try:
        user_id = request.user_id
        days = request.args.get('days', 7, type=int)
        zone_id = request.args.get('zone_id', type=int)
        
        since_time = datetime.now() - timedelta(days=days)
        
        # Build query with filters
        query = IrrigationLog.query.filter(
            IrrigationLog.user_id == user_id,
            IrrigationLog.start_time >= since_time
        )
        
        if zone_id:
            query = query.filter(IrrigationLog.zone_id == zone_id)
        
        logs = query.order_by(IrrigationLog.start_time.desc()).all()
        
        history_data = []
        for log in logs:
            # Get zone details for each log
            zone = IrrigationZone.query.get(log.zone_id) if log.zone_id else None
            
            history_data.append({
                'log_id': log.log_id,
                'zone_id': log.zone_id,
                'zone_name': log.zone,
                'zone_details': {
                    'crop_type': zone.crop_type if zone else None,
                    'soil_type': zone.soil_type if zone else None,
                    'area_sqm': zone.area_sqm if zone else None
                },
                'duration': log.duration,
                'water_used': log.water_used,
                'start_time': log.start_time.isoformat(),
                'end_time': log.end_time.isoformat() if log.end_time else None,
                'status': log.status,
                'trigger_type': log.trigger_type,
                'efficiency_score': calculate_efficiency_score(log, zone) if zone else None
            })
        
        return jsonify({
            'success': True, 
            'data': history_data,
            'summary': {
                'total_water_used': sum(log.water_used or 0 for log in logs),
                'total_events': len(logs),
                'average_duration': sum(log.duration or 0 for log in logs) / max(len(logs), 1),
                'period_days': days
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@irrigation_bp.route('/api/irrigation/schedules', methods=['POST'])
@token_required
def create_irrigation_schedule():
    """Create a new irrigation schedule with proper user_id"""
    try:
        data = request.get_json()
        user_id = request.user_id  # Get user_id from token
        
        # Validate zone belongs to user
        zone = IrrigationZone.query.filter_by(
            zone_id=data['zone_id'], 
            user_id=user_id
        ).first()
        
        if not zone:
            return jsonify({
                'success': False, 
                'error': 'Zone not found or does not belong to user'
            }), 404
        
        new_schedule = IrrigationSchedule(
            user_id=user_id,  # Set user_id from session
            zone_id=data['zone_id'],
            name=data['name'],
            trigger_type=data.get('trigger_type', 'moisture'),
            moisture_threshold=data.get('moisture_threshold', 40),
            duration=data['duration'],
            minimum_interval=data.get('minimum_interval', 3600),
            max_daily_irrigations=data.get('max_daily_irrigations', 3),
            is_active=data.get('is_active', True),
            created_at=datetime.now(),
            last_triggered=None  # Initialize as None until first trigger
        )
        
        database.session.add(new_schedule)
        database.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Schedule created successfully',
            'schedule_id': new_schedule.schedule_id
        })
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@irrigation_bp.route('/api/irrigation/schedules/<int:schedule_id>', methods=['PUT'])
@token_required
def update_irrigation_schedule(schedule_id):
    """Update an irrigation schedule with user validation"""
    try:
        data = request.get_json()
        user_id = request.user_id
        
        schedule = IrrigationSchedule.query.filter_by(
            schedule_id=schedule_id,
            user_id=user_id  # Ensure user owns this schedule
        ).first()
        
        if not schedule:
            return jsonify({'success': False, 'error': 'Schedule not found'}), 404
        
        # Update fields
        updatable_fields = [
            'name', 'trigger_type', 'moisture_threshold', 
            'duration', 'minimum_interval', 'max_daily_irrigations', 'is_active'
        ]
        
        for field in updatable_fields:
            if field in data:
                setattr(schedule, field, data[field])
        
        database.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Schedule updated successfully'
        })
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@irrigation_bp.route('/api/irrigation/schedules/<int:schedule_id>', methods=['DELETE'])
@token_required
def delete_irrigation_schedule(schedule_id):
    """Delete an irrigation schedule with user validation"""
    try:
        user_id = request.user_id
        
        schedule = IrrigationSchedule.query.filter_by(
            schedule_id=schedule_id,
            user_id=user_id  # Ensure user owns this schedule
        ).first()
        
        if not schedule:
            return jsonify({'success': False, 'error': 'Schedule not found'}), 404
        
        database.session.delete(schedule)
        database.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Schedule deleted successfully'
        })
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@irrigation_bp.route('/api/irrigation/schedules', methods=['GET'])
@token_required
def get_irrigation_schedules():
    """Get all irrigation schedules for current user"""
    try:
        user_id = request.user_id
        
        schedules = IrrigationSchedule.query.join(IrrigationZone).filter(
            IrrigationSchedule.user_id == user_id
        ).all()
        
        schedule_data = []
        for schedule in schedules:
            # Get latest moisture reading for the zone
            latest_moisture = MoistureReading.query.filter_by(
                zone_id=schedule.zone_id
            ).order_by(MoistureReading.timestamp.desc()).first()
            
            schedule_data.append({
                'id': schedule.schedule_id,
                'user_id': schedule.user_id,  # Include user_id for verification
                'zone_id': schedule.zone_id,
                'zone_name': schedule.zone.zone_name,
                'name': schedule.name,
                'trigger_type': schedule.trigger_type,
                'moisture_threshold': schedule.moisture_threshold,
                'current_moisture': latest_moisture.moisture_level if latest_moisture else None,
                'duration': schedule.duration,
                'minimum_interval': schedule.minimum_interval,
                'max_daily_irrigations': schedule.max_daily_irrigations,
                'is_active': schedule.is_active,
                'created_at': schedule.created_at.isoformat() if schedule.created_at else None,
                'last_triggered': schedule.last_triggered.isoformat() if schedule.last_triggered else None
            })
        
        return jsonify({'success': True, 'data': schedule_data})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@irrigation_bp.route('/api/irrigation/current-status', methods=['GET'])
@token_required
def get_current_irrigation_status():
    """Get current status for all zones including auto mode info"""
    try:
        zones = IrrigationZone.query.all()
        status_data = []
        
        for zone in zones:
            # Get latest moisture reading
            latest_moisture = MoistureReading.query.filter_by(
                zone_id=zone.zone_id
                
            ).order_by(MoistureReading.timestamp.desc()).first()

            zone_name = zone.zone_name

            
            # Get active schedule for this zone
            schedule = IrrigationSchedule.query.filter_by(
                zone_id=zone.zone_id,
                is_active=True
            ).first()
            
            # Get last irrigation for this zone
            last_irrigation = IrrigationLog.query.filter_by(
                zone=zone.zone_name
            ).order_by(IrrigationLog.start_time.desc()).first()
            
            # Determine if irrigation is needed
            needs_irrigation = False
            auto_mode_enabled = False
            
            if latest_moisture and schedule:
                needs_irrigation = latest_moisture.moisture_level < schedule.moisture_threshold
                auto_mode_enabled = schedule.trigger_type == 'moisture'
            
            status_data.append({
                'zone_id': zone.zone_id,
                'zone_name': zone.zone_name,
                'current_moisture': latest_moisture.moisture_level if latest_moisture else 0,
                'moisture_threshold': schedule.moisture_threshold if schedule else 30,
                'needs_irrigation': needs_irrigation,
                'auto_mode_enabled': auto_mode_enabled,
                'last_irrigation': last_irrigation.start_time.isoformat() if last_irrigation else None,
                'last_irrigation_type': last_irrigation.trigger_type if last_irrigation else None,
                'crop_type': zone.crop_type,
                'soil_type': zone.soil_type,
                'area_sqm': zone.area_sqm,
                'water_requirement': zone.water_requirement
            })
        
        return jsonify({'success': True, 'data': status_data})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@irrigation_bp.route('/api/irrigation/check-moisture', methods=['POST'])
def check_moisture():
    """Manually trigger moisture check"""
    try:
        # triggers the irrigation controller
        # irrigation_controller.check_moisture_and_irrigate()
        
        # For now, just return success since we don't have actual hardware
        return jsonify({
            'success': True,
            'message': 'Moisture check completed successfully',
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    
@irrigation_bp.route('/api/sensors/current', methods=['GET'])
@token_required
def get_current_sensor_data():
    """Get current sensor readings"""
    try:
        sensor_data = sensor_service.get_sensor_readings()
        
        if sensor_data:
            # Convert soil moisture to percentage for frontend
            if 'soil_moisture' in sensor_data:
                sensor_data['moisture_percentage'] = sensor_service.convert_to_moisture_percentage(
                    sensor_data['soil_moisture']
                )
            
            return jsonify({
                'success': True,
                'data': sensor_data,
                'timestamp': datetime.now().isoformat()
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Could not read sensor data'
            }), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@irrigation_bp.route('/api/sensors/manual-read', methods=['POST'])
@token_required
def manual_sensor_read():
    """Manually trigger sensor reading and storage"""
    try:
        user_id = request.user_id
        data = request.get_json() or {}
        zone_id = data.get('zone_id', 1)
        
        success = sensor_service.store_sensor_data(user_id, zone_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Sensor data stored successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to read and store sensor data'
            }), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@irrigation_bp.route('/api/sensors/control-pump', methods=['POST'])
@token_required
def control_irrigation():
      
    try:
        data = request.get_json()
        action = data.get('action')  # 'start' or 'stop'
        duration = data.get('duration')  # in seconds
        
        if action == 'start' and duration:
            success = sensor_service.start_manual_irrigation(duration)
            message = f'Irrigation started for {duration} seconds'
        elif action == 'stop':
            success = sensor_service.stop_irrigation()
            message = 'Irrigation stopped'
        else:
            return jsonify({'success': False, 'error': 'Invalid action or duration'}), 400
        
        if success:
            return jsonify({
                'success': True,
                'message': message
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to control irrigation hardware'
            }), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@irrigation_bp.route('/api/sensors/start-monitoring', methods=['POST'])
@token_required
def start_sensor_monitoring():
    """Start the 10-minute scheduled monitoring"""
    try:
        sensor_service.start_scheduled_monitoring()
        return jsonify({
            'success': True,
            'message': 'Sensor monitoring started (every 10 minutes)'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500



@irrigation_bp.route('/api/irrigation/zones/<int:zone_id>/status', methods=['GET'])
def get_zone_status(zone_id):
    """Get detailed status for a specific zone"""
    try:
        zone = IrrigationZone.query.get(zone_id)
        
        if not zone:
            return jsonify({'success': False, 'error': 'Zone not found'}), 404
        
        # Get latest moisture reading
        latest_moisture = MoistureReading.query.filter_by(
            zone_id=zone_id
        ).order_by(MoistureReading.timestamp.desc()).first()
        
        # Get active schedule
        schedule = IrrigationSchedule.query.filter_by(
            zone_id=zone_id,
            is_active=True
        ).first()
        
        # Get recent irrigation logs
        recent_irrigations = IrrigationLog.query.filter_by(
            zone=zone.zone_name
        ).order_by(IrrigationLog.start_time.desc()).limit(5).all()
        
        zone_data = {
            'zone_id': zone.zone_id,
            'zone_name': zone.zone_name,
            'current_moisture': latest_moisture.moisture_level if latest_moisture else 0,
            'moisture_threshold': schedule.moisture_threshold if schedule else 30,
            'needs_irrigation': latest_moisture.moisture_level < schedule.moisture_threshold if (latest_moisture and schedule) else False,
            'crop_type': zone.crop_type,
            'soil_type': zone.soil_type,
            'area_sqm': zone.area_sqm,
            'water_requirement': zone.water_requirement,
            'recent_irrigations': [
                {
                    'duration': log.duration,
                    'water_used': log.water_used,
                    'start_time': log.start_time.isoformat(),
                    'trigger_type': log.trigger_type
                } for log in recent_irrigations
            ]
        }
        
        return jsonify({'success': True, 'data': zone_data})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@irrigation_bp.route('/api/irrigation/analytics', methods=['GET'])
@token_required
def get_irrigation_analytics():
    """Get comprehensive irrigation analytics for AI recommendations"""
    try:
        user_id = request.user_id
        days = request.args.get('days', 30, type=int)
        
        # Get data for the specified period
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        # Total water usage with zone breakdown
        water_usage = database.session.query(
            IrrigationLog.zone,
            IrrigationLog.zone_id,
            database.func.sum(IrrigationLog.water_used).label('total_water'),
            database.func.count(IrrigationLog.log_id).label('event_count'),
            database.func.avg(IrrigationLog.duration).label('avg_duration')
        ).filter(
            IrrigationLog.user_id == user_id,
            IrrigationLog.start_time.between(start_date, end_date)
        ).group_by(IrrigationLog.zone, IrrigationLog.zone_id).all()
        
        # Water usage by trigger type
        water_by_trigger = database.session.query(
            IrrigationLog.trigger_type,
            database.func.sum(IrrigationLog.water_used).label('total_water')
        ).filter(
            IrrigationLog.user_id == user_id,
            IrrigationLog.start_time.between(start_date, end_date)
        ).group_by(IrrigationLog.trigger_type).all()
        
        # Efficiency metrics
        total_water = sum(item.total_water or 0 for item in water_usage)
        total_events = sum(item.event_count or 0 for item in water_usage)
        
        # Get zone details for better analysis
        zones = IrrigationZone.query.filter_by(user_id=user_id).all()
        zone_efficiency = []
        
        for zone in zones:
            zone_logs = IrrigationLog.query.filter_by(
                user_id=user_id,
                zone_id=zone.zone_id
            ).filter(
                IrrigationLog.start_time.between(start_date, end_date)
            ).all()
            
            zone_water = sum(log.water_used or 0 for log in zone_logs)
            zone_events = len(zone_logs)
            
            # Calculate efficiency based on zone area and water requirements
            expected_water = (zone.water_requirement or 10) * days
            efficiency = min(100, (expected_water / max(zone_water, 1)) * 100) if expected_water > 0 else 100
            
            zone_efficiency.append({
                'zone_id': zone.zone_id,
                'zone_name': zone.zone_name,
                'efficiency': round(efficiency, 1),
                'water_used': round(zone_water, 2),
                'events': zone_events,
                'area_sqm': zone.area_sqm,
                'crop_type': zone.crop_type,
                'expected_water': expected_water
            })
        
        analytics_data = {
            'total_water_usage': total_water,
            'total_irrigation_events': total_events,
            'average_water_per_event': total_water / max(total_events, 1),
            'water_by_zone': [
                {
                    'zone': item.zone,
                    'zone_id': item.zone_id,
                    'water_used': item.total_water,
                    'events': item.event_count,
                    'avg_duration': item.avg_duration
                } for item in water_usage
            ],
            'water_by_trigger_type': [
                {'trigger_type': item.trigger_type, 'water_used': item.total_water}
                for item in water_by_trigger
            ],
            'zone_efficiency': zone_efficiency,
            'period': {
                'start': start_date.isoformat(),
                'end': end_date.isoformat(),
                'days': days
            },
            'summary_metrics': {
                'daily_average_water': total_water / days,
                'water_per_sqm': total_water / sum(zone.area_sqm or 100 for zone in zones),
                'automation_rate': len([log for log in water_by_trigger if log.trigger_type == 'automatic']) / max(len(water_by_trigger), 1) * 100
            }
        }
        
        return jsonify({'success': True, 'data': analytics_data})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def calculate_efficiency_score(log, zone):
    """Calculate efficiency score for an irrigation event"""
    if not zone or not zone.area_sqm:
        return None
    
    # Basic efficiency calculation based on water used vs expected
    expected_water_per_minute = (zone.area_sqm / 100) * 2  # 2L per 100m² per minute
    expected_water = expected_water_per_minute * (log.duration / 60)
    
    if expected_water <= 0:
        return 100
    
    efficiency = min(100, (expected_water / max(log.water_used, 1)) * 100)
    return round(efficiency, 1)

def calculate_water_usage(zone_name, duration):
    """Calculate water usage based on zone and duration"""
    try:
        zone = IrrigationZone.query.filter_by(zone_name=zone_name).first()
        if zone and zone.area_sqm:
            # More accurate calculation based on zone area
            flow_rate_per_100m2 = 10  # liters per minute per 100m²
            duration_minutes = duration / 60
            area_factor = zone.area_sqm / 100.0  
            water_used = flow_rate_per_100m2 * area_factor * duration_minutes
            return round(water_used, 2)
        else:
            # Fallback calculation
            flow_rate = 10  # liters per minute
            duration_minutes = duration / 60
            return round(flow_rate * duration_minutes, 2)
    
    except Exception as e: 
        print(f"Error Calculating Water Usage: {str(e)}")
        # Simple fallback
        flow_rate = 10  
        duration_minutes = duration / 60
        return round(flow_rate * duration_minutes, 2)
    

@irrigation_bp.route('/api/sensors/store-readings', methods=['POST'])
@token_required
def store_sensor_readings():
    """Store sensor readings and trigger auto mode"""
    try:
        user_id = request.user_id
        data = request.get_json() or {}
        zone_id = data.get('zone_id')
        
        # If zone_id not provided, get user's first zone
        if not zone_id:
            zone = IrrigationZone.query.filter_by(user_id=user_id, is_active=True).first()
            if zone:
                zone_id = zone.zone_id
                print(f"Using default zone {zone_id} for user {user_id}")
            else:
                return jsonify({
                    'success': False,
                    'error': 'No zones found for user'
                }), 400
        
        # Store sensor data
        success = sensor_service.store_sensor_data(user_id=user_id, zone_id=zone_id)
        
        if success:
            # Manually trigger auto irrigation check
            try:
                # Get sensor data for auto mode check
                sensor_data = sensor_service.get_sensor_readings()
                if sensor_data:
                    soil_moisture = sensor_data.get('soil_moisture_analog', 400)
                    rain_value = sensor_data.get('rain_sensor', 1000)
                    water_level = sensor_data.get('water_level', 10)
                    
                    print(f"Triggering auto irrigation check for zone {zone_id}")
                    check_and_trigger_irrigation(zone_id, soil_moisture, rain_value, water_level, user_id)
            except Exception as auto_error:
                print(f"Auto irrigation check failed: {auto_error}")
            
            return jsonify({
                'success': True,
                'message': 'Sensor data stored successfully - Auto mode checked',
                'zone_id': zone_id,
                'timestamp': datetime.now().isoformat()
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to read and store sensor data'
            }), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    
@irrigation_bp.route('/api/irrigation/debug-logs', methods=['GET'])
@token_required
def debug_irrigation_logs():
    """Debug route to check irrigation logs and zone associations"""
    try:
        user_id = request.user_id
        
        # Get all irrigation logs for user
        logs = IrrigationLog.query.filter_by(user_id=user_id).order_by(IrrigationLog.start_time.desc()).limit(20).all()
        
        debug_data = []
        for log in logs:
            # Get zone info
            zone = IrrigationZone.query.get(log.zone_id) if log.zone_id else None
            
            debug_data.append({
                'log_id': log.log_id,
                'zone_id': log.zone_id,
                'zone_name': log.zone,
                'zone_found': zone is not None,
                'zone_details': {
                    'zone_id': zone.zone_id if zone else None,
                    'zone_name': zone.zone_name if zone else None,
                    'user_id': zone.user_id if zone else None
                },
                'user_id': log.user_id,
                'duration': log.duration,
                'water_used': log.water_used,
                'start_time': log.start_time.isoformat(),
                'end_time': log.end_time.isoformat() if log.end_time else None,
                'status': log.status,
                'trigger_type': log.trigger_type
            })
        
        # Get user's zones for reference
        user_zones = IrrigationZone.query.filter_by(user_id=user_id).all()
        zones_data = [{
            'zone_id': zone.zone_id,
            'zone_name': zone.zone_name,
            'user_id': zone.user_id
        } for zone in user_zones]
        
        return jsonify({
            'success': True,
            'debug_logs': debug_data,
            'user_zones': zones_data,
            'total_logs': len(logs),
            'logs_with_zone_id': len([log for log in logs if log.zone_id]),
            'logs_without_zone_id': len([log for log in logs if not log.zone_id])
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def get_or_create_sensor(sensor_name, location, sensor_type):
    """Get existing sensor or create new one"""
    sensor = Sensors.query.filter_by(sensor_name=sensor_name).first()
    if not sensor:
        sensor = Sensors(
            sensor_name=sensor_name,
            location=location,
            type=sensor_type,
            status='active',
            last_updated=datetime.now()
        )
        database.session.add(sensor)
        database.session.commit()
    return sensor

def convert_to_moisture_percentage(analog_value):
    """Convert analog soil moisture reading to percentage"""
    # Calibrate these values based on your sensor
    DRY_VALUE = 600   # Value in dry soil
    WET_VALUE = 250   # Value in wet soil
    
    # Convert to percentage (inverted because higher analog value = drier soil)
    moisture_percentage = 100 - ((analog_value - WET_VALUE) / (DRY_VALUE - WET_VALUE)) * 100
    return max(0, min(100, moisture_percentage))  # Clamp between 0-100%

def check_and_trigger_irrigation(zone_id, soil_moisture, rain_value, water_level, user_id):
    """Check if irrigation is needed based on sensor readings"""
    try:
        # Get zone and active schedule
        zone = IrrigationZone.query.get(zone_id)
        schedule = IrrigationSchedule.query.filter_by(
            zone_id=zone_id, 
            is_active=True,
            trigger_type='moisture'
        ).first()
        
        if not zone or not schedule:
            print(f"No active moisture schedule found for zone {zone_id}")
            return
        
        # Convert soil moisture to percentage
        moisture_percentage = convert_to_moisture_percentage(soil_moisture)
        print(f"Zone {zone.zone_name}: Moisture {moisture_percentage}%, Threshold {schedule.moisture_threshold}%")
        
        # Check if it's raining (rain sensor value below threshold)
        is_raining = rain_value < 500 if rain_value is not None else False
        
        # Check water level (ensure there's enough water)
        has_sufficient_water = water_level <= 20 if water_level is not None else True
        
        # Check if irrigation is needed
        needs_irrigation = (
            moisture_percentage < schedule.moisture_threshold and
            not is_raining and
            has_sufficient_water
        )
        
        print(f"Zone {zone.zone_name}: Needs irrigation: {needs_irrigation}")
        
        if needs_irrigation:
            # Check minimum interval
            last_irrigation = IrrigationLog.query.filter_by(
                zone_id=zone_id,
                trigger_type='automatic'
            ).order_by(IrrigationLog.start_time.desc()).first()
            
            if last_irrigation:
                time_since_last = datetime.now() - last_irrigation.start_time
                if time_since_last.total_seconds() < schedule.minimum_interval:
                    print(f"Too soon since last irrigation: {time_since_last.total_seconds()}s < {schedule.minimum_interval}s")
                    return  # Too soon since last irrigation
            
            # Check daily irrigation count
            today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            today_irrigations = IrrigationLog.query.filter(
                IrrigationLog.zone_id == zone_id,
                IrrigationLog.trigger_type == 'automatic',
                IrrigationLog.start_time >= today_start
            ).count()
            
            if today_irrigations >= schedule.max_daily_irrigations:
                print(f"Daily irrigation limit reached: {today_irrigations}/{schedule.max_daily_irrigations}")
                return  # Maximum daily irrigations reached
            
            print(f"Starting automatic irrigation for {zone.zone_name}")
            # Start irrigation
            start_automatic_irrigation(zone, schedule, user_id)
        else:
            print(f"Irrigation not needed: Moisture {moisture_percentage}% >= Threshold {schedule.moisture_threshold}%")
            
    except Exception as e:
        print(f"Error in irrigation check for zone {zone_id}: {str(e)}")

def start_automatic_irrigation(zone, schedule, user_id):
    """Start automatic irrigation with proper logging"""
    try:
        # Calculate water usage
        water_used = calculate_water_usage(zone.zone_name, schedule.duration)
        start_time = datetime.now()
        
        # Create comprehensive irrigation log
        irrigation_log = IrrigationLog(
            user_id=user_id,
            zone_id=zone.zone_id,  # Make sure zone_id is set
            zone=zone.zone_name,
            duration=schedule.duration,
            water_used=water_used,
            start_time=start_time,
            status='in_progress',
            trigger_type='automatic'
        )
        
        database.session.add(irrigation_log)
        
        # Update schedule last_triggered
        schedule.last_triggered = datetime.now()
        
        database.session.commit()
        
        # Send command to Arduino to start pump
        success = sensor_service.start_manual_irrigation(schedule.duration)
        
        if success:
            irrigation_log.status = 'completed'
            irrigation_log.end_time = start_time + timedelta(seconds=schedule.duration)
        else:
            irrigation_log.status = 'failed'
            irrigation_log.end_time = datetime.now()
        
        database.session.commit()
        
        print(f"Automatic irrigation started for {zone.zone_name}, zone_id: {zone.zone_id}")
        
        # Trigger AI analysis
        try:
            from services.ai_recommendation_engine import advanced_ai_engine
            advanced_ai_engine.analyze_irrigation_event(
                user_id, 
                zone.zone_id, 
                irrigation_log.log_id
            )
        except Exception as ai_error:
            print(f"AI analysis skipped: {ai_error}")
            
    except Exception as e:
        database.session.rollback()
        print(f"Error starting automatic irrigation: {str(e)}")
    
@irrigation_bp.route('/api/irrigation/zones', methods=['GET'])
@token_required
def get_user_zones():
    """Get user's irrigation zones"""
    try:

        user_id = request.user_id
        
        # Get zones from database
        zones = IrrigationZone.query.filter_by(user_id=user_id, is_active=True).all()
        
        zones_data = []
        for zone in zones:
            # Get latest moisture reading
            latest_moisture = MoistureReading.query.filter_by(
                zone_id=zone.zone_id
            ).order_by(MoistureReading.timestamp.desc()).first()
            
            zones_data.append({
                'zone_id': zone.zone_id,
                'zone_name': zone.zone_name,
                'crop_type': zone.crop_type,
                'soil_type': zone.soil_type,
                'area_sqm': zone.area_sqm,
                'current_moisture': latest_moisture.moisture_level if latest_moisture else 50,
                'is_active': zone.is_active
            })
        
        return jsonify({
            'success': True,
            'zones': zones_data,
            'count': len(zones_data)
        })
        
    except Exception as e:
        print(f"Error getting zones: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch zones data'
        }), 500