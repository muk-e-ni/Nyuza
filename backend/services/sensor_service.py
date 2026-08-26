import threading
import time
import json
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

# Background monitoring stores data against this account by default, since
# there's one physical Arduino for the demo farm. Matches the same default
# used in vision_monitoring_service.py — revisit for real multi-farm support.
DEFAULT_MONITORING_USER_ID = 1

# Import serial
import serial
from serial import SerialException

from models import Sensors, SensorReadings, MoistureReading, IrrigationLog, IrrigationSchedule, IrrigationZone
from config import database

class SensorDataService:
    def __init__(self, app=None):
        self.arduino = None
        self.is_monitoring = False
        self.last_reading = None
        self.serial_port = 'COM16'  # Arduino COM port
        self.baudrate = 9600
        self.monitoring_thread = None
        self.connection_attempts = 0
        self.max_connection_attempts = 6
        self.app = app
        self._lock = threading.Lock()
        
    def init_app(self, app):
        """Initialize with Flask app"""
        self.app = app
        
    def connect_arduino(self):
        """Connect to Arduino"""
        if self.connection_attempts >= self.max_connection_attempts:
            logger.error("Max connection attempts reached")
            self.connection_attempts = 0
            return False
            
        try:
            if self.arduino and self.arduino.is_open:
                return True
                
            logger.info(f"Connecting to Arduino on {self.serial_port}")
            self.arduino = serial.Serial(
                port=self.serial_port,
                baudrate=self.baudrate,
                timeout=2,
                write_timeout=2
            )
            
            # Wait for Arduino to initialize
            time.sleep(2)
            if self.arduino.in_waiting:
                self.arduino.reset_input_buffer()
                
            logger.info(f"Connected to Arduino on {self.serial_port}")
            self.connection_attempts = 0
            return True
            
        except Exception as e:
            self.connection_attempts += 1
            logger.error(f"Connection attempt {self.connection_attempts} failed: {e}")
            return False
    
    def get_sensor_readings(self):
        """Get current sensor readings from Arduino and check for auto irrigation events"""
        try:
            if not self.arduino or not self.arduino.is_open:
                if not self.connect_arduino():
                    return None
            
            with self._lock:
                self.arduino.reset_input_buffer()
                self.arduino.write(b'GET_DATA\n')
                time.sleep(1)
                
                lines = []
                # Read multiple lines to catch any auto irrigation events
                while self.arduino.in_waiting:
                    line = self.arduino.readline().decode('utf-8').strip()
                    if line:
                        lines.append(line)
                
                # Process all lines
                for line in lines:
                    if line.startswith('AUTO_IRRIGATION_STARTED:'):
                        # Parse auto irrigation event
                        duration_str = line.split(':')[1]
                        logger.info(f"Auto irrigation started from Arduino: {duration_str}ms")
                        # You can trigger additional backend actions here
                    
                    elif line.startswith('{'):
                        # This is the regular sensor data
                        sensor_data = json.loads(line)
                        self.last_reading = sensor_data
                        logger.info(f"Received sensor data: {sensor_data}")
                        return sensor_data
                
                if lines:
                    logger.warning(f"No JSON data in Arduino response. Lines: {lines}")
                else:
                    logger.warning("No data received from Arduino")
                        
        except Exception as e:
            logger.error(f"Error reading sensors: {e}")
        
        return None
    
    def start_manual_irrigation(self, duration_seconds):
        """Start manual irrigation via Arduino"""
        try:
            if not self.arduino or not self.arduino.is_open:
                if not self.connect_arduino():
                    return False
            
            with self._lock:
                duration_ms = duration_seconds * 1000
                command = f"START_MANUAL:{duration_ms}\n"
                self.arduino.write(command.encode())
                logger.info(f"Manual irrigation started for {duration_seconds} seconds")
                
                # Wait for response
                time.sleep(1)
                response = self.arduino.readline().decode('utf-8').strip()
                logger.info(f"Arduino response: {response}")
                
            return True
                
        except Exception as e:
            logger.error(f"Error starting irrigation: {e}")
            return False

    def trigger_dosing_pump(self, duration_ms=1500):
        """Trigger the pesticide/fertilizer dosing pump via Arduino.
        Called by VisionMonitoringService when a disease is detected with
        high confidence. Reuses this service's existing Arduino connection —
        there's only one serial port, so the vision service doesn't open
        its own connection, it calls this method instead."""
        try:
            if not self.arduino or not self.arduino.is_open:
                if not self.connect_arduino():
                    return False

            with self._lock:
                command = f"DOSE:{duration_ms}\n"
                self.arduino.write(command.encode())
                logger.info(f"Dosing pump triggered for {duration_ms}ms")

                time.sleep(1)
                response = self.arduino.readline().decode('utf-8').strip()
                logger.info(f"Arduino response: {response}")

                if "DOSE_FAILED" in response:
                    return False

            return True

        except Exception as e:
            logger.error(f"Error triggering dosing pump: {e}")
            return False

    def stop_irrigation(self):
        """Stop any ongoing irrigation"""
        try:
            if not self.arduino or not self.arduino.is_open:
                if not self.connect_arduino():
                    return False
            
            with self._lock:
                self.arduino.write(b"STOP_IRRIGATION\n")
                logger.info("Irrigation stop command sent")
                
                # Wait for response
                time.sleep(1)
                response = self.arduino.readline().decode('utf-8').strip()
                logger.info(f"Arduino response: {response}")
                
            return True
            
        except Exception as e:
            logger.error(f"Error stopping irrigation: {e}")
            return False

    def get_irrigation_status(self):
        """Get current irrigation status from Arduino"""
        return self.get_sensor_readings()

    def store_sensor_data(self, user_id=None, zone_id=None):
        """Store sensor data in database with proper user and zone validation"""
        try:
            sensor_data = self.get_sensor_readings()
            if not sensor_data:
                logger.warning("No sensor data received")
                return False
                
            current_time = datetime.now()
            
            # Validate user_id
            if not user_id:
                logger.error("No user_id provided for sensor data storage")
                return False
                
            # If zone_id not provided, get user's first active zone
            if not zone_id:
                zone = IrrigationZone.query.filter_by(user_id=user_id, is_active=True).first()
                if not zone:
                    logger.error(f"No active zones found for user {user_id}")
                    return False
                zone_id = zone.zone_id
                logger.info(f"Using default zone {zone_id} for user {user_id}")
            
            # Use app context if available
            if self.app:
                with self.app.app_context():
                    return self._store_sensor_data_in_context(sensor_data, current_time, zone_id, user_id)
            else:
                return self._store_sensor_data_in_context(sensor_data, current_time, zone_id, user_id)
                
        except Exception as e:
            logger.error(f"Error storing sensor data: {e}")
            return False

    def _store_sensor_data_in_context(self, sensor_data, current_time, zone_id, user_id):
        """Store sensor data with actual readings and proper user context"""
        try:
            # Validate zone belongs to user
            zone = IrrigationZone.query.filter_by(zone_id=zone_id, user_id=user_id).first()
            if not zone:
                logger.error(f"Zone {zone_id} not found or doesn't belong to user {user_id}")
                return False
            
            # Get or create sensor entries with proper user context
            rain_sensor = self.get_or_create_sensor('Rain Sensor', 'Outdoor', 'rain', user_id)
            soil_sensor = self.get_or_create_sensor('Soil Moisture Sensor', f'Zone {zone.zone_name}', 'moisture', user_id)
            water_sensor = self.get_or_create_sensor('Water Level Sensor', 'Tank', 'ultrasonic', user_id)
            
            # Store rain sensor reading
            if 'is_raining' in sensor_data:
                rain_value = 1 if sensor_data['is_raining'] else 0
                rain_reading = SensorReadings(
                    sensor_id=rain_sensor.sensor_id,
                    value=rain_value,
                    reading_type='rain',
                    timestamp=current_time,
                    quality_score=1.0
                )
                database.session.add(rain_reading)
            
            # Store ACTUAL soil moisture readings
            soil_moisture_percentage = None
            
            if 'soil_moisture_percentage' in sensor_data:
                # Use actual percentage from Arduino
                soil_moisture_percentage = sensor_data['soil_moisture_percentage']
            elif 'soil_moisture_analog' in sensor_data:
                # Convert analog value to percentage
                soil_moisture_percentage = self.convert_analog_to_percentage(sensor_data['soil_moisture_analog'])
            elif 'soil_is_dry' in sensor_data:
                # Fallback to digital (TEMPORARY - until you get analog sensor)
                soil_moisture_percentage = 20 if sensor_data['soil_is_dry'] else 80
            
            if soil_moisture_percentage is not None:
                # Store in SensorReadings table
                soil_reading = SensorReadings(
                    sensor_id=soil_sensor.sensor_id,
                    value=soil_moisture_percentage,
                    reading_type='moisture_percentage',
                    timestamp=current_time,
                    quality_score=1.0
                )
                database.session.add(soil_reading)
                
                # Store in MoistureReading table for zone-based analysis
                moisture_reading = MoistureReading(
                    zone_id=zone_id,
                    sensor_id=soil_sensor.sensor_id,
                    moisture_level=soil_moisture_percentage,
                    timestamp=current_time
                )
                database.session.add(moisture_reading)
                
                # AUTO MODE: Check if irrigation needed
                self.check_auto_irrigation(zone_id, soil_moisture_percentage, current_time, user_id)
            
            # Store water level reading
            if 'water_level' in sensor_data and sensor_data['water_level'] > 0:
                water_reading = SensorReadings(
                    sensor_id=water_sensor.sensor_id,
                    value=sensor_data['water_level'],
                    reading_type='water_level',
                    timestamp=current_time,
                    quality_score=1.0
                )
                database.session.add(water_reading)
            
            # Update sensor timestamps
            rain_sensor.last_updated = current_time
            soil_sensor.last_updated = current_time
            water_sensor.last_updated = current_time
            
            database.session.commit()
            logger.info(f"Sensor data stored successfully for user {user_id}, zone {zone.zone_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error in store sensor data context: {e}")
            database.session.rollback()
            return False

    def get_or_create_sensor(self, sensor_name, location, sensor_type, user_id):
        """Get existing sensor or create new one with user context"""
        # Create unique sensor name per user to avoid conflicts
        user_sensor_name = f"{sensor_name} - User {user_id}"
        
        sensor = Sensors.query.filter_by(sensor_name=user_sensor_name).first()
        if not sensor:
            sensor = Sensors(
                sensor_name=user_sensor_name,
                location=location,
                type=sensor_type,
                status='active',
                last_updated=datetime.now()
            )
            database.session.add(sensor)
            database.session.commit()
            logger.info(f"Created new sensor: {user_sensor_name} for user {user_id}")
        return sensor

    def convert_analog_to_percentage(self, analog_value):
        """Convert analog soil moisture reading to percentage"""
        # Calibrate these values based on your specific sensor
        DRY_VALUE = 620   # Value in completely dry soil (air)
        WET_VALUE = 280   # Value in completely wet soil (water)
        
        # Ensure value is within range
        analog_value = max(WET_VALUE, min(DRY_VALUE, analog_value))
        
        # Convert to percentage (inverted because higher analog = drier)
        moisture_percentage = 100 - ((analog_value - WET_VALUE) / (DRY_VALUE - WET_VALUE)) * 100
        
        return max(0, min(100, round(moisture_percentage, 1)))

    def check_auto_irrigation(self, zone_id, moisture_percentage, current_time, user_id):
        """Auto mode: Check if irrigation is needed based on moisture level"""
        try:
            # Get active schedule for this zone that belongs to the user
            schedule = IrrigationSchedule.query.filter_by(
                zone_id=zone_id,
                is_active=True,
                trigger_type='moisture'
            ).join(IrrigationZone).filter(
                IrrigationZone.user_id == user_id
            ).first()
            
            if not schedule:
                logger.debug(f"No active moisture schedule found for zone {zone_id}, user {user_id}")
                return False
            
            # Check if moisture is below threshold
            if moisture_percentage < schedule.moisture_threshold:
                logger.info(f"Auto mode: Zone {zone_id} needs irrigation. Moisture: {moisture_percentage}% < Threshold: {schedule.moisture_threshold}%")
                
                # Check minimum interval
                last_irrigation = IrrigationLog.query.filter_by(
                    zone_id=zone_id,
                    trigger_type='automatic'
                ).order_by(IrrigationLog.start_time.desc()).first()
                
                if last_irrigation:
                    time_since_last = current_time - last_irrigation.start_time
                    if time_since_last.total_seconds() < schedule.minimum_interval:
                        logger.info(f"Auto mode: Too soon since last irrigation. Waiting...")
                        return False
                
                # Check daily limit
                today_start = current_time.replace(hour=0, minute=0, second=0, microsecond=0)
                today_count = IrrigationLog.query.filter(
                    IrrigationLog.zone_id == zone_id,
                    IrrigationLog.trigger_type == 'automatic',
                    IrrigationLog.start_time >= today_start
                ).count()
                
                if today_count >= schedule.max_daily_irrigations:
                    logger.info(f"Auto mode: Daily irrigation limit reached ({today_count}/{schedule.max_daily_irrigations})")
                    return False
                
                # Start automatic irrigation
                return self.start_auto_irrigation(zone_id, schedule, user_id)
            
            return False
            
        except Exception as e:
            logger.error(f"Error in auto irrigation check: {e}")
            return False

    def start_auto_irrigation(self, zone_id, schedule, user_id):
        """Start automatic irrigation for a zone with proper logging"""
        try:
            zone = IrrigationZone.query.filter_by(zone_id=zone_id, user_id=user_id).first()
            if not zone:
                logger.error(f"Zone {zone_id} not found for user {user_id}")
                return False
            
            # Calculate water usage
            water_used = self.calculate_water_usage(zone.zone_name, schedule.duration)
            start_time = datetime.now()
            
            # Create comprehensive irrigation log
            irrigation_log = IrrigationLog(
                user_id=user_id,
                zone_id=zone_id,  # Make sure zone_id is set
                zone=zone.zone_name,
                duration=schedule.duration,
                water_used=water_used,
                start_time=start_time,
                status='in_progress',
                trigger_type='automatic'
            )
            
            database.session.add(irrigation_log)
            database.session.flush()  # Get log_id
            
            # Send command to Arduino
            success = self.start_manual_irrigation(schedule.duration)
            
            if success:
                irrigation_log.status = 'completed'
                irrigation_log.end_time = start_time + timedelta(seconds=schedule.duration)
            else:
                irrigation_log.status = 'failed'
                irrigation_log.end_time = datetime.now()
            
            # Update schedule last_triggered
            schedule.last_triggered = datetime.now()
            database.session.commit()
            
            if success:
                logger.info(f"Auto irrigation started for {zone.zone_name} (User {user_id}), zone_id: {zone_id}, duration: {schedule.duration}s")
            else:
                logger.error(f"Auto irrigation failed for {zone.zone_name} (User {user_id})")
            
            return success
            
        except Exception as e:
            logger.error(f"Error starting auto irrigation: {e}")
            database.session.rollback()
            return False
        
    def calculate_water_usage(self, zone_name, duration):
        """Calculate water usage based on zone area and duration"""
        try:
            zone = IrrigationZone.query.filter_by(zone_name=zone_name).first()
            if zone and zone.area_sqm:
                # Typical flow rate: 10 liters per minute per 100m²
                flow_rate_per_100m2 = 10  
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
            logger.error(f"Error calculating water usage: {e}")
            return 0

    def start_scheduled_monitoring(self):
        """Start the 10-minute scheduled monitoring with user context"""
        if self.is_monitoring:
            return
        
        self.is_monitoring = True
        logger.info("Starting sensor monitoring service")
        
        # Schedule periodic monitoring
        def monitoring_loop():
            while self.is_monitoring:
                try:
                    # store_sensor_data() reads from Arduino, saves the
                    # reading, and internally calls check_auto_irrigation()
                    # — this direct method call needs no HTTP request and
                    # no auth token, unlike the /api/sensors/store-readings
                    # route. store_sensor_data() already wraps itself in
                    # self.app.app_context() when self.app is set.
                    success = self.store_sensor_data(user_id=DEFAULT_MONITORING_USER_ID)
                    if success:
                        logger.info("Auto monitoring: sensor data stored, auto-irrigation checked")
                    else:
                        logger.warning("Auto monitoring: failed to store sensor data this cycle")

                    # Wait 10 minutes
                    for _ in range(600):
                        if not self.is_monitoring:
                            break
                        time.sleep(1)
                except Exception as e:
                    logger.error(f"Monitoring error: {e}")
                    time.sleep(60)
        
        self.monitoring_thread = threading.Thread(target=monitoring_loop)
        self.monitoring_thread.daemon = True
        self.monitoring_thread.start()

    def stop_monitoring(self):
            """Stop the scheduled monitoring"""
            self.is_monitoring = False
            if self.arduino and self.arduino.is_open:
                try:
                    self.arduino.close()
                    logger.info("Arduino connection closed")
                except Exception as e:
                    logger.error(f"Error closing Arduino connection: {e}")
            logger.info("Sensor monitoring stopped")

    def cleanup_old_data(self):
            """Clean up data older than 7 days"""
            try:
                if self.app:
                    with self.app.app_context():
                        self._cleanup_old_data_in_context()
                else:
                    self._cleanup_old_data_in_context()
                        
            except Exception as e:
                logger.error(f"Error cleaning up old data: {e}")

    def _cleanup_old_data_in_context(self):
            """Clean up data within app context"""
            cutoff_date = datetime.now() - timedelta(days=7)
            
            old_readings = SensorReadings.query.filter(
                SensorReadings.timestamp < cutoff_date
            ).delete()
            
            old_moisture = MoistureReading.query.filter(
                MoistureReading.timestamp < cutoff_date
            ).delete()
            
            database.session.commit()
            
            if old_readings > 0 or old_moisture > 0:
                logger.info(f"Cleaned up {old_readings} readings, {old_moisture} moisture records")

    def run_cleanup_task(self):
            """Run cleanup task periodically"""
            if self.is_monitoring:
                try:
                    self.cleanup_old_data()
                except Exception as e:
                    logger.error(f"Error in cleanup task: {e}")
                
                # Schedule next cleanup in 1 hour
                timer = threading.Timer(3600.0, self.run_cleanup_task)
                timer.daemon = True
                timer.start()

# Global sensor service instance
sensor_service = SensorDataService()