from flask import Blueprint, jsonify, request
from models import SystemSettings, IrrigationZone, SensorReadings, Sensors, ZoneSensor, Farm
from config import database
from datetime import timezone, datetime, timedelta
from services.sensor_service import sensor_service
from services.weather_service import weather_service
from utils.auth import token_required
import json

system_bp = Blueprint('system', __name__)


def _get_farm_for_user(user_id):
    """The farm this user owns. Single-owner-per-farm today (see Farm
    model notes) — once FarmMembership actually supports non-owner roles,
    this should check membership rather than owner_user_id alone."""
    return Farm.query.filter_by(owner_user_id=user_id).first()

@system_bp.route('/api/system/settings', methods=['GET'])
@token_required
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
@token_required
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
@token_required
def get_irrigation_zones():
    """Get all irrigation zones belonging to the logged-in user.

    Previously returned every zone for every user in the database — this
    was scoped the same way IrrigationZone is scoped everywhere else in
    the app (e.g. irrigations_routes.py), it just hadn't been applied here.

    Now also includes each zone's assigned sensors (via ZoneSensor) — this
    table existed in the schema already but nothing actually read from it
    anywhere, so the frontend had no way to show (or the farmer to
    confirm) which physical sensor reports to which zone."""
    try:
        zones = IrrigationZone.query.filter_by(user_id=request.user_id).all()
        zones_data = []
        
        for zone in zones:
            assigned_sensors = [
                {'sensor_id': zs.sensor_id, 'sensor_name': zs.sensor.sensor_name, 'type': zs.sensor.type}
                for zs in zone.zone_sensors
            ]
            zones_data.append({
                'zone_id': zone.zone_id,
                'zone_name': zone.zone_name,
                'description': zone.description,
                'area_sqm': zone.area_sqm,
                'crop_type': zone.crop_type,
                'soil_type': zone.soil_type,
                'water_requirement': zone.water_requirement,
                'is_active': zone.is_active,
                'created_at': zone.created_at.isoformat() if zone.created_at else None,
                'assigned_sensors': assigned_sensors,
            })
        
        return jsonify(zones_data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@system_bp.route('/api/system/zones', methods=['POST'])
@token_required
def create_irrigation_zone():
    """Create a new irrigation zone. The frontend already had a
    zoneAPI.createZone calling this exact path — there was just no
    matching route, so it 404'd. This is also the reason a farmer could
    only edit zones seeded by mockDBdata.py, never add their own.

    Sensor assignment happens via the separate
    POST /api/system/zones/<id>/sensors endpoint below, once the zone
    exists — kept as a second step rather than bundled into this one,
    since a farmer may not have a sensor ready to assign yet (this
    prototype only has one physical sensor total) and shouldn't be
    blocked from creating the zone in the meantime.
    """
    try:
        data = request.get_json() or {}
        zone_name = (data.get('zone_name') or '').strip()
        if not zone_name:
            return jsonify({'success': False, 'message': 'zone_name is required'}), 400

        farm = _get_farm_for_user(request.user_id)

        zone = IrrigationZone(
            zone_name=zone_name,
            description=data.get('description'),
            area_sqm=float(data['area_sqm']) if data.get('area_sqm') not in (None, '') else None,
            crop_type=data.get('crop_type'),
            soil_type=data.get('soil_type'),
            water_requirement=float(data['water_requirement']) if data.get('water_requirement') not in (None, '') else None,
            is_active=data.get('is_active', True),
            user_id=request.user_id,
            farm_id=farm.farm_id if farm else None,
        )
        database.session.add(zone)
        database.session.commit()

        return jsonify({
            'success': True,
            'message': 'Zone created successfully',
            'zone': {
                'zone_id': zone.zone_id,
                'zone_name': zone.zone_name,
                'description': zone.description,
                'area_sqm': zone.area_sqm,
                'crop_type': zone.crop_type,
                'soil_type': zone.soil_type,
                'water_requirement': zone.water_requirement,
                'is_active': zone.is_active,
                'assigned_sensors': [],
            }
        }), 201
    except Exception as e:
        database.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@system_bp.route('/api/system/sensors', methods=['GET'])
@token_required
def get_farm_sensors():
    """List sensors belonging to this user's farm, for the 'assign a
    sensor to this zone' picker. Separate from /api/sensors/recent (which
    is farm-unscoped today, see that file's notes) — this one can be
    scoped properly since it goes through Farm, which does have a real
    owner column."""
    try:
        farm = _get_farm_for_user(request.user_id)
        if not farm:
            return jsonify([])

        sensors = Sensors.query.filter_by(farm_id=farm.farm_id).all()
        return jsonify([
            {
                'sensor_id': s.sensor_id,
                'sensor_name': s.sensor_name,
                'type': s.type,
                'location': s.location,
            }
            for s in sensors
        ])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@system_bp.route('/api/system/zones/<int:zone_id>/sensors', methods=['POST'])
@token_required
def assign_sensor_to_zone(zone_id):
    """Assign an existing sensor to report to this zone (creates a
    ZoneSensor row). This is the missing link Brandon flagged: nothing
    previously recorded which sensor serves which zone at all — sensor
    readings just got attached to whichever zone store_sensor_data
    guessed was 'the' active one. See sensor_service.py's
    _store_sensor_data_in_context for the corresponding read-side fix."""
    try:
        zone = IrrigationZone.query.filter_by(zone_id=zone_id, user_id=request.user_id).first()
        if not zone:
            return jsonify({'success': False, 'message': 'Zone not found'}), 404

        data = request.get_json() or {}
        sensor_id = data.get('sensor_id')
        if not sensor_id:
            return jsonify({'success': False, 'message': 'sensor_id is required'}), 400

        farm = _get_farm_for_user(request.user_id)
        sensor = Sensors.query.filter_by(sensor_id=sensor_id, farm_id=farm.farm_id if farm else None).first()
        if not sensor:
            return jsonify({'success': False, 'message': 'Sensor not found'}), 404

        existing = ZoneSensor.query.filter_by(zone_id=zone_id, sensor_id=sensor_id).first()
        if existing:
            return jsonify({'success': True, 'message': 'Sensor already assigned to this zone'})

        database.session.add(ZoneSensor(zone_id=zone_id, sensor_id=sensor_id))
        database.session.commit()

        return jsonify({'success': True, 'message': f'{sensor.sensor_name} assigned to {zone.zone_name}'}), 201
    except Exception as e:
        database.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@system_bp.route('/api/system/zones/<int:zone_id>/sensors/<int:sensor_id>', methods=['DELETE'])
@token_required
def unassign_sensor_from_zone(zone_id, sensor_id):
    """Remove a sensor-to-zone assignment."""
    try:
        zone = IrrigationZone.query.filter_by(zone_id=zone_id, user_id=request.user_id).first()
        if not zone:
            return jsonify({'success': False, 'message': 'Zone not found'}), 404

        link = ZoneSensor.query.filter_by(zone_id=zone_id, sensor_id=sensor_id).first()
        if not link:
            return jsonify({'success': False, 'message': 'Assignment not found'}), 404

        database.session.delete(link)
        database.session.commit()
        return jsonify({'success': True, 'message': 'Sensor unassigned'})
    except Exception as e:
        database.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@system_bp.route('/api/system/zones/<int:zone_id>', methods=['PUT'])
@token_required
def update_irrigation_zone(zone_id):
    """Update an irrigation zone's configuration (name, crop/soil type, area, etc).

    Added to back the Zone Configuration settings screen — the frontend
    already called this endpoint (zoneAPI.updateZone) but no matching
    route existed, so edits silently failed. Only touches real
    IrrigationZone columns; moisture_threshold lives on IrrigationSchedule
    and is intentionally not accepted here.

    Ownership check added: originally this matched its (then-also-open)
    sibling GET above and let anyone edit any zone by ID. 404 rather than
    403 on a mismatch, so a non-owner can't even tell the zone exists.
    """
    try:
        zone = IrrigationZone.query.filter_by(zone_id=zone_id, user_id=request.user_id).first()
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
@token_required
def get_system_health():
    """Get system health status — every field here is a real check now.
    Previously 'irrigation_system' and 'weather_api' were hardcoded to
    fixed values regardless of actual state, and 'sensors' only checked
    whether ANY sensor reading had EVER been stored, not whether one had
    been stored recently."""
    try:
        database.session.execute('SELECT 1')
        db_status = 'online'
    except Exception:
        db_status = 'offline'

    # Sensors: online only if something reported within the last polling
    # window (loop runs every 10 min; allow one missed cycle).
    recent_cutoff = datetime.now() - timedelta(minutes=22)
    recent_sensor = SensorReadings.query.filter(
        SensorReadings.timestamp >= recent_cutoff
    ).order_by(SensorReadings.timestamp.desc()).first()
    sensor_status = 'online' if recent_sensor else 'offline'

    # Irrigation system: is the Arduino link actually up (works for both
    # USB serial and the ESP8266 WiFi bridge transports).
    irrigation_status = 'online' if sensor_service.is_connected() else 'offline'

    # Weather API: a real reachability check, not a hardcoded guess.
    try:
        weather_result = weather_service.get_current_weather()
        weather_status = 'online' if weather_result and weather_result.get('success', True) and 'temperature' in weather_result else 'offline'
    except Exception:
        weather_status = 'offline'

    health_data = {
        'database': db_status,
        'sensors': sensor_status,
        'irrigation_system': irrigation_status,
        'weather_api': weather_status,
        'last_checked': datetime.now(timezone.utc).isoformat()
    }

    return jsonify(health_data)
