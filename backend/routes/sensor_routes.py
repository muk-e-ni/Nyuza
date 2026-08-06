from flask import Blueprint, jsonify, request
from models import Sensors, SensorReadings, MoistureReading, IrrigationZone, ZoneSensor
from config import database
from datetime import datetime, timedelta

sensor_bp = Blueprint('sensors', __name__)

@sensor_bp.route('/api/sensors/readings', methods=['GET'])
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
def get_recent_sensor_data():
    """Get recent sensor data for status page"""
    try:
        # Get all sensors with their latest readings
        sensors = Sensors.query.all()
        sensor_data = []
        
        for sensor in sensors:
            latest_reading = SensorReadings.query.filter_by(
                sensor_id=sensor.sensor_id
            ).order_by(SensorReadings.timestamp.desc()).first()
            
            sensor_data.append({
                'sensor_id': sensor.sensor_id,
                'sensor_name': sensor.sensor_name,
                'location': sensor.location,
                'type': sensor.type,
                'status': sensor.status,
                'last_value': latest_reading.value if latest_reading else None,
                'last_updated': sensor.last_updated.isoformat() if sensor.last_updated else None
            })
        
        return jsonify(sensor_data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@sensor_bp.route('/api/sensors/moisture/<int:zone_id>', methods=['GET'])
def get_zone_moisture_data(zone_id):
    """Get moisture data for a specific zone"""
    try:
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