from flask import Blueprint, jsonify, request
from models import SystemSettings, IrrigationZone, SensorReadings
from config import database
from datetime import timezone, datetime

system_bp = Blueprint('system', __name__)

@system_bp.route('/api/system/settings', methods=['GET'])
def get_system_settings():
    """Get all system settings"""
    try:
        settings = SystemSettings.query.all()
        settings_data = {}
        
        for setting in settings:
            # Convert value based on data type
            if setting.data_type == 'integer':
                value = int(setting.setting_value)
            elif setting.data_type == 'float':
                value = float(setting.setting_value)
            elif setting.data_type == 'boolean':
                value = setting.setting_value.lower() == 'true'
            elif setting.data_type == 'json':
                value = json.loads(setting.setting_value)
            else:
                value = setting.setting_value
                
            settings_data[setting.setting_key] = value
        
        return jsonify(settings_data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@system_bp.route('/api/system/settings', methods=['PUT'])
def update_system_settings():
    """Update system settings"""
    try:
        data = request.get_json()
        
        for key, value in data.items():
            setting = SystemSettings.query.filter_by(setting_key=key).first()
            if setting:
                setting.setting_value = str(value)
                setting.last_updated = datetime.now()
        
        database.session.commit()
        return jsonify({'message': 'Settings updated successfully'})
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'error': str(e)}), 500

@system_bp.route('/api/system/zones', methods=['GET'])
def get_irrigation_zones():
    """Get all irrigation zones"""
    try:
        zones = IrrigationZone.query.all()
        zones_data = []
        
        for zone in zones:
            zones_data.append({
                'zone_id': zone.zone_id,
                'zone_name': zone.zone_name,
                'description': zone.description,
                'area_sqm': zone.area_sqm,
                'crop_type': zone.crop_type,
                'soil_type': zone.soil_type,
                'water_requirement': zone.water_requirement,
                'is_active': zone.is_active,
                'created_at': zone.created_at.isoformat() if zone.created_at else None
            })
        
        return jsonify(zones_data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@system_bp.route('/api/system/zones/<int:zone_id>', methods=['PUT'])
def update_irrigation_zone(zone_id):
    """Update an irrigation zone's configuration (name, crop/soil type, area, etc).

    Added to back the Zone Configuration settings screen — the frontend
    already called this endpoint (zoneAPI.updateZone) but no matching
    route existed, so edits silently failed. Only touches real
    IrrigationZone columns; moisture_threshold lives on IrrigationSchedule
    and is intentionally not accepted here.
    """
    try:
        zone = IrrigationZone.query.get(zone_id)
        if not zone:
            return jsonify({'success': False, 'message': 'Zone not found'}), 404

        data = request.get_json() or {}

        if 'zone_name' in data and data['zone_name']:
            zone.zone_name = data['zone_name']
        if 'crop_type' in data:
            zone.crop_type = data['crop_type']
        if 'soil_type' in data:
            zone.soil_type = data['soil_type']
        if 'description' in data:
            zone.description = data['description']
        if 'area_sqm' in data and data['area_sqm'] not in (None, ''):
            zone.area_sqm = float(data['area_sqm'])
        if 'water_requirement' in data and data['water_requirement'] not in (None, ''):
            zone.water_requirement = float(data['water_requirement'])
        if 'is_active' in data:
            zone.is_active = bool(data['is_active'])

        database.session.commit()

        return jsonify({
            'success': True,
            'message': 'Zone updated successfully',
            'zone': {
                'zone_id': zone.zone_id,
                'zone_name': zone.zone_name,
                'description': zone.description,
                'area_sqm': zone.area_sqm,
                'crop_type': zone.crop_type,
                'soil_type': zone.soil_type,
                'water_requirement': zone.water_requirement,
                'is_active': zone.is_active,
            }
        })
    except Exception as e:
        database.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@system_bp.route('/api/system/health', methods=['GET'])
def get_system_health():
    """Get system health status"""
    try:
        # Check database connection
        database.session.execute('SELECT 1')
        db_status = 'online'
    except:
        db_status = 'offline'
    
    # Check sensor status 
    recent_sensor = SensorReadings.query.order_by(
        SensorReadings.timestamp.desc()
    ).first()
    
    sensor_status = 'online' if recent_sensor else 'offline'
    
    health_data = {
        'database': db_status,
        'sensors': sensor_status,
        'irrigation_system': 'online',  # checks Arduino connection
        'weather_api': 'offline',  #  weather API check
        'last_checked': datetime.now(timezone.utc).isoformat()
    }
    
    return jsonify(health_data)