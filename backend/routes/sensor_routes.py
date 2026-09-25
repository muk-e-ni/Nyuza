from flask import Blueprint, jsonify, request
from models import Sensors, SensorReadings, MoistureReading, IrrigationZone, ZoneSensor
from config import database
from datetime import datetime, timedelta
from utils.auth import token_required
import logging
import traceback

logger = logging.getLogger(__name__)

sensor_bp = Blueprint('sensors', __name__)

# NOTE on scoping: Sensors/SensorReadings have no user_id/farm_id column at
# all right now — that's real, but it's tied to introducing a proper Farm
# concept (deliberately deferred; this is a single-farm prototype today).
# @token_required below closes the "anyone, logged in or not" hole, which
# is the real gap for now. It does NOT yet mean "only your sensors" for the
# routes that return sensor data broadly (recent/readings/history) — there's
# only one farm's worth of sensors in the database at this stage, so that
# distinction doesn't bite yet, but it will need the Farm/Device work before
# this file is correct for more than one farm. get_zone_moisture_data below
# CAN be properly scoped already, since IrrigationZone already has user_id —
# so that one gets a real ownership check, not just a login check.

@sensor_bp.route('/api/sensors/readings', methods=['GET'])
@token_required
def get_sensor_readings():
    """Get latest readings from all sensors"""
    try:
        # Get latest readings for each sensor type
        latest_readings = {}
        
        # Soil moisture
        moisture_reading = SensorReadings.query.filter_by(
            reading_type='soil_moisture'
        ).order_by(SensorReadings.timestamp.desc()).first()
        if moisture_reading:
            latest_readings['soilMoisture'] = moisture_reading.value
        
        # Temperature
        temp_reading = SensorReadings.query.filter_by(
            reading_type='temperature'
        ).order_by(SensorReadings.timestamp.desc()).first()
        if temp_reading:
            latest_readings['temperature'] = temp_reading.value
        
        # Humidity
        humidity_reading = SensorReadings.query.filter_by(
            reading_type='humidity'
        ).order_by(SensorReadings.timestamp.desc()).first()
        if humidity_reading:
            latest_readings['humidity'] = humidity_reading.value
        
        # Water level
        water_reading = SensorReadings.query.filter_by(
            reading_type='water_level'
        ).order_by(SensorReadings.timestamp.desc()).first()
        if water_reading:
            latest_readings['waterLevel'] = water_reading.value
        
        return jsonify(latest_readings)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@sensor_bp.route('/api/sensors/recent', methods=['GET'])
@token_required
def get_recent_sensor_data():
    """Get every sensor with its latest reading and a real connectivity
    status — 'active' is derived from HOW RECENT the last reading is, not
    a static DB column. The old version just echoed sensor.status, which
    is set to 'active' once at creation and never touched again, so every
    sensor always looked fine regardless of whether it was still reporting."""
    try:
        # The background monitoring loop polls every 10 minutes; allow one
        # missed cycle before calling a sensor stale/offline.
        STALE_AFTER = timedelta(minutes=22)
        now = datetime.now()

        UNIT_BY_TYPE = {
            'moisture': '%',
            'moisture_percentage': '%',
            'rain': '',
            'ultrasonic': 'cm',
            'water_level': 'cm',
        }

        sensors = Sensors.query.all()
        sensor_data = []

        for sensor in sensors:
            # Defensive per-sensor: one bad/unexpected row (e.g. a null
            # timestamp, a value of an unexpected type) shouldn't 500 the
            # entire list — better to show that one sensor as unknown and
            # still return everything else.
            try:
                latest_reading = SensorReadings.query.filter_by(
                    sensor_id=sensor.sensor_id
                ).order_by(SensorReadings.timestamp.desc()).first()

                connectivity = 'never_reported'
                if latest_reading and latest_reading.timestamp:
                    age = now - latest_reading.timestamp
                    connectivity = 'active' if age <= STALE_AFTER else 'stale'
                elif latest_reading:
                    connectivity = 'stale'  # has a reading but no usable timestamp

                display_value = None
                if latest_reading is not None:
                    if sensor.type == 'rain':
                        display_value = 'Rain detected' if latest_reading.value else 'Dry'
                    else:
                        unit = UNIT_BY_TYPE.get(sensor.type, '')
                        display_value = f"{latest_reading.value}{unit}"

                sensor_data.append({
                    'sensor_id': sensor.sensor_id,
                    'sensor_name': sensor.sensor_name,
                    'location': sensor.location,
                    'type': sensor.type,
                    'status': connectivity,
                    'last_value': latest_reading.value if latest_reading else None,
                    'display_value': display_value,
                    'last_updated': latest_reading.timestamp.isoformat() if (latest_reading and latest_reading.timestamp) else None,
                })
            except Exception as sensor_error:
                logger.error(f"Error processing sensor {getattr(sensor, 'sensor_id', '?')}: {sensor_error}")
                sensor_data.append({
                    'sensor_id': getattr(sensor, 'sensor_id', None),
                    'sensor_name': getattr(sensor, 'sensor_name', 'Unknown'),
                    'location': getattr(sensor, 'location', None),
                    'type': getattr(sensor, 'type', None),
                    'status': 'error',
                    'last_value': None,
                    'display_value': None,
                    'last_updated': None,
                })

        return jsonify(sensor_data)

    except Exception as e:
        logger.error(f"Error in get_recent_sensor_data: {e}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@sensor_bp.route('/api/sensors/moisture/<int:zone_id>', methods=['GET'])
@token_required
def get_zone_moisture_data(zone_id):
    """Get moisture data for a specific zone"""
    try:
        # Real ownership check — IrrigationZone already has user_id, so
        # unlike the sensor-wide routes above, there's no excuse not to
        # scope this one properly right now. 404 (not 403) so a non-owner
        # can't even tell whether the zone_id exists at all.
        zone = IrrigationZone.query.filter_by(zone_id=zone_id, user_id=request.user_id).first()
        if not zone:
            return jsonify({'message': 'No moisture data found for this zone'}), 404

        # Get latest moisture reading for the zone
        moisture_data = MoistureReading.query.filter_by(
            zone_id=zone_id
        ).order_by(MoistureReading.timestamp.desc()).first()
        
        if moisture_data:
            return jsonify({
                'zone_id': zone_id,
                'moisture_level': moisture_data.moisture_level,
                'temperature': moisture_data.temperature,
                'timestamp': moisture_data.timestamp.isoformat()
            })
        else:
            return jsonify({'message': 'No moisture data found for this zone'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@sensor_bp.route('/api/sensors/history', methods=['GET'])
@token_required
def get_sensor_history():
    """Get sensor history for charts"""
    try:
        hours = request.args.get('hours', 24, type=int)
        since_time = datetime.now() - timedelta(hours=hours)
        
        readings = SensorReadings.query.filter(
            SensorReadings.timestamp >= since_time
        ).order_by(SensorReadings.timestamp).all()
        
        history_data = {}
        for reading in readings:
            if reading.reading_type not in history_data:
                history_data[reading.reading_type] = []
            
            history_data[reading.reading_type].append({
                'timestamp': reading.timestamp.isoformat(),
                'value': reading.value
            })
        
        return jsonify(history_data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
