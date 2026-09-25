import threading
import time
import json
import os
import requests
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

from models import Sensors, SensorReadings, MoistureReading, IrrigationLog, IrrigationSchedule, IrrigationZone, Farm, ZoneSensor
from config import database
from utils.monitoring_user import resolve_monitoring_user_id, resolve_monitoring_farm_id

import serial
from serial import SerialException

class SensorDataService:
    def __init__(self, app=None):
        self.arduino = None
        self.is_monitoring = False
        self.last_reading = None
        self.serial_port = 'COM9'  # Arduino COM port
        self.baudrate = 9600
        self.monitoring_thread = None
        self.connection_attempts = 0
        self.max_connection_attempts = 6
        self.app = app
        self._lock = threading.Lock()

        # Transport: 'serial' (default, USB via pyserial) or 'wifi' (via
        # the ESP8266-01 bridge — see backend/arduino/esp8266_wifi_bridge).
        # Set ARDUINO_TRANSPORT=wifi and ARDUINO_WIFI_HOST=http://<esp-ip>
        # in .env to switch. Everything downstream (get_sensor_readings,
        # start_manual_irrigation, etc.) goes through _send_command() below,
        # which is transport-agnostic, so no other code needed to change.
        self.transport = os.getenv('ARDUINO_TRANSPORT', 'serial').strip().lower()
        self.wifi_host = os.getenv('ARDUINO_WIFI_HOST', '').rstrip('/')
        self._wifi_last_ok = False
        
    def init_app(self, app):
        """Initialize with Flask app"""
        self.app = app

    def _resolve_monitoring_identity(self):
        """Resolve which user_id to act as for this monitoring cycle.
        Farm is the real, explicit identity now (resolve_monitoring_farm_id
        reads it from this instance's registered Device) — this just looks
        up that farm's owner so store_sensor_data's existing signature and
        internals (which are written in terms of user_id, e.g. the
        IrrigationZone lookup) don't need to change everywhere at once."""
        farm_id = resolve_monitoring_farm_id()
        if farm_id:
            try:
                from models import Farm
                farm = Farm.query.get(farm_id)
                if farm:
                    return farm.owner_user_id
            except Exception as e:
                logger.error(f"Could not resolve owner for farm_id={farm_id}: {e}")
        # No Farm resolved at all — the startup backfill in main.py should
        # normally prevent this; fall back to the legacy heuristic rather
        # than fail the whole monitoring cycle.
        return resolve_monitoring_user_id()
        
    def connect_arduino(self):
        """Establish (or confirm) the link to the Arduino — over USB serial
        or the ESP8266 WiFi bridge, depending on self.transport."""
        if self.transport == 'wifi':
            if not self.wifi_host:
                logger.error("ARDUINO_TRANSPORT=wifi but ARDUINO_WIFI_HOST is not set (e.g. http://192.168.1.50)")
                return False
            try:
                resp = requests.get(f"{self.wifi_host}/ping", timeout=3)
                self._wifi_last_ok = (resp.status_code == 200)
                if self._wifi_last_ok:
                    logger.info(f"ESP8266 WiFi bridge reachable at {self.wifi_host}")
                return self._wifi_last_ok
            except Exception as e:
                logger.error(f"ESP8266 WiFi bridge unreachable at {self.wifi_host}: {e}")
                self._wifi_last_ok = False
                return False

        # --- serial transport (original behavior) ---
        if self.connection_attempts >= self.max_connection_attempts:
            logger.error("Max connection attempts reached")
            self.connection_attempts = 0
            return False

        if self.arduino and self.arduino.is_open:
            return True

        # PermissionError on Windows almost always means the OS hasn't
        # finished releasing the port from whoever held it last (a
        # previous run of this app, the Arduino IDE's Serial Monitor left
        # open, etc.) — it clears up within a second or two on its own far
        # more often than it's a real conflict, so it's worth a couple of
        # short retries before actually giving up and burning one of the
        # 6 total connection_attempts.
        last_error = None
        for permission_retry in range(3):
            try:
                logger.info(f"Connecting to Arduino on {self.serial_port}")
                self.arduino = serial.Serial(
                    port=self.serial_port,
                    baudrate=self.baudrate,
                    timeout=2,
                    write_timeout=2
                )

                # Opening the port toggles DTR, which resets most Arduino
                # boards — give it a moment to finish booting before
                # anyone tries to talk to it. (Bumped from 2s to 3s: 2
                # was sometimes too tight, showing up as "connected" but
                # then "no data received" on the very next read.)
                time.sleep(3)
                if self.arduino.in_waiting:
                    self.arduino.reset_input_buffer()

                logger.info(f"Connected to Arduino on {self.serial_port}")
                self.connection_attempts = 0
                return True

            except PermissionError as e:
                last_error = e
                if permission_retry < 2:
                    logger.warning(f"Port busy (attempt {permission_retry + 1}/3), retrying in 1.5s: {e}")
                    time.sleep(1.5)
                continue
            except Exception as e:
                last_error = e
                break

        self.connection_attempts += 1
        logger.error(f"Connection attempt {self.connection_attempts} failed: {last_error}")
        return False

    def is_connected(self):
        """Transport-agnostic connectivity check — use this instead of
        poking sensor_service.arduino.is_open directly, since that's
        meaningless when running in WiFi mode."""
        if self.transport == 'wifi':
            return bool(self.wifi_host) and self._wifi_last_ok
        return bool(self.arduino and self.arduino.is_open)

    def _send_command(self, command, read_wait=1.0):
        """Send one command to the Arduino and return its reply as a list
        of lines — the single choke point both transports go through, so
        get_sensor_readings/start_manual_irrigation/etc. don't need to know
        or care whether this is USB or WiFi underneath."""
        command = command.strip()

        if self.transport == 'wifi':
            if not self.wifi_host:
                return None
            try:
                with self._lock:
                    resp = requests.post(
                        f"{self.wifi_host}/command",
                        json={'cmd': command},
                        timeout=read_wait + 3,
                    )
                if resp.status_code != 200:
                    logger.error(f"ESP8266 bridge returned HTTP {resp.status_code} for '{command}': {resp.text}")
                    self._wifi_last_ok = False
                    return None
                self._wifi_last_ok = True
                data = resp.json()
                # The bridge passes through the Arduino's raw JSON as-is for
                # most commands; plain-text replies (e.g. CALIBRATE_SOIL)
                # arrive wrapped as {"success": true, "message": "..."}.
                if isinstance(data, dict) and 'message' in data and 'is_raining' not in data:
                    return [data['message']]
                return [json.dumps(data)]
            except Exception as e:
                logger.error(f"WiFi command '{command}' failed: {e}")
                self._wifi_last_ok = False
                return None

        # --- serial transport ---
        try:
            with self._lock:
                if not self.arduino or not self.arduino.is_open:
                    if not self.connect_arduino():
                        return None
                self.arduino.reset_input_buffer()
                self.arduino.write((command + '\n').encode())
                time.sleep(read_wait)
                lines = []
                while self.arduino.in_waiting:
                    line = self.arduino.readline().decode('utf-8').strip()
                    if line:
                        lines.append(line)

                # One quick retry if nothing came back — the Arduino's
                # loop() can occasionally be a little slow to respond
                # (e.g. mid dosing/irrigation), and immediately giving up
                # on a single empty read was showing up as "connects fine,
                # then reports no data" even with a healthy connection.
                if not lines:
                    time.sleep(0.5)
                    while self.arduino.in_waiting:
                        line = self.arduino.readline().decode('utf-8').strip()
                        if line:
                            lines.append(line)

                return lines
        except Exception as e:
            logger.error(f"Serial command '{command}' failed: {e}")
            return None
    
    def get_sensor_readings(self):
        """Get current sensor readings from Arduino and check for auto irrigation events"""
        try:
            lines = self._send_command('GET_DATA', read_wait=1.0)
            if not lines:
                logger.warning("No data received from Arduino")
                return None

            for line in lines:
                if line.startswith('AUTO_IRRIGATION_STARTED:'):
                    duration_str = line.split(':')[1]
                    logger.info(f"Auto irrigation started from Arduino: {duration_str}ms")
                    # Note: this only fires if you've manually sent AUTO_ON
                    # over serial — the app itself never enables the
                    # Arduino's on-device auto mode (see irrigation_controller.ino).

                elif line.startswith('{'):
                    sensor_data = json.loads(line)
                    self.last_reading = sensor_data
                    logger.info(f"Received sensor data: {sensor_data}")
                    return sensor_data

            logger.warning(f"No JSON data in Arduino response. Lines: {lines}")

        except Exception as e:
            logger.error(f"Error reading sensors: {e}")

        return None
    
    def start_manual_irrigation(self, duration_seconds):
        """Start manual irrigation via Arduino"""
        try:
            duration_ms = duration_seconds * 1000
            lines = self._send_command(f"START_MANUAL:{duration_ms}", read_wait=1.0)
            if lines is None:
                return False
            logger.info(f"Manual irrigation started for {duration_seconds} seconds. Arduino response: {lines}")
            return True
        except Exception as e:
            logger.error(f"Error starting irrigation: {e}")
            return False

    def trigger_dosing_pump(self, duration_ms=1500):
        """Trigger the pesticide/fertilizer dosing pump via Arduino.
        Called by VisionMonitoringService when disease or pest detection is
        high-confidence. Reuses this service's existing Arduino connection —
        there's only one link (serial or WiFi) to the physical hardware, so
        the vision service calls this method instead of opening its own."""
        try:
            lines = self._send_command(f"DOSE:{duration_ms}", read_wait=1.0)
            if lines is None:
                return False
            logger.info(f"Dosing pump triggered for {duration_ms}ms. Arduino response: {lines}")
            if any('DOSE_FAILED' in line for line in lines):
                return False
            return True
        except Exception as e:
            logger.error(f"Error triggering dosing pump: {e}")
            return False

    def stop_irrigation(self):
        """Stop any ongoing irrigation"""
        try:
            lines = self._send_command("STOP_IRRIGATION", read_wait=1.0)
            if lines is None:
                return False
            logger.info(f"Irrigation stop command sent. Arduino response: {lines}")
            return True
        except Exception as e:
            logger.error(f"Error stopping irrigation: {e}")
            return False

    def get_irrigation_status(self):
        """Get current irrigation status from Arduino"""
        return self.get_sensor_readings()

    def store_sensor_data(self, user_id=None, zone_id=None):
        """Store sensor data in database with proper user and zone validation"""
        # Reading from the Arduino doesn't touch the DB, so it's fine
        # outside any app context — do it first, unconditionally.
        sensor_data = self.get_sensor_readings()
        if not sensor_data:
            logger.warning("No sensor data received")
            return False

        if not user_id:
            logger.error("No user_id provided for sensor data storage")
            return False

        current_time = datetime.now()

        # Everything below touches the DB (IrrigationZone.query, and
        # eventually _store_sensor_data_in_context) and MUST run inside an
        # app context. Previously the zone lookup happened here, before the
        # `with self.app.app_context():` block further down — which is
        # exactly the bug behind "Working outside of application context":
        # this method is called from a background thread (the monitoring
        # loop), which has no app context of its own unless one is
        # explicitly pushed, and the zone lookup was reaching the DB before
        # that push happened.
        def _run():
            try:
                nonlocal zone_id
                if not zone_id:
                    zone = IrrigationZone.query.filter_by(user_id=user_id, is_active=True).first()
                    if not zone:
                        logger.error(f"No active zones found for user {user_id}")
                        return False
                    zone_id = zone.zone_id
                    logger.info(f"Using default zone {zone_id} for user {user_id}")

                return self._store_sensor_data_in_context(sensor_data, current_time, zone_id, user_id)
            except Exception as e:
                logger.error(f"Error storing sensor data: {e}")
                return False

        if self.app:
            with self.app.app_context():
                return _run()
        return _run()

    def _store_sensor_data_in_context(self, sensor_data, current_time, zone_id, user_id):
        """Store sensor data with actual readings and proper user context"""
        try:
            # Validate zone belongs to user
            zone = IrrigationZone.query.filter_by(zone_id=zone_id, user_id=user_id).first()
            if not zone:
                logger.error(f"Zone {zone_id} not found or doesn't belong to user {user_id}")
                return False

            # Sensors belong to the farm, not directly to the user — fall
            # back to resolving one if this zone predates the farm backfill
            # somehow (shouldn't happen after main.py's startup migration).
            farm_id = zone.farm_id
            if not farm_id:
                fallback_farm = Farm.query.filter_by(owner_user_id=user_id).first()
                farm_id = fallback_farm.farm_id if fallback_farm else None
                logger.warning(f"Zone {zone_id} has no farm_id yet — resolved farm_id={farm_id} as a fallback")

            # Get or create sensor entries, scoped to the farm
            rain_sensor = self.get_or_create_sensor('Rain Sensor', 'Outdoor', 'rain', farm_id)
            soil_sensor = self.get_or_create_sensor('Soil Moisture Sensor', f'Zone {zone.zone_name}', 'moisture', farm_id)
            water_sensor = self.get_or_create_sensor('Water Level Sensor', 'Tank', 'ultrasonic', farm_id)
            
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
                # Store the raw reading once against the physical sensor —
                # this part doesn't depend on which zone(s) it serves.
                soil_reading = SensorReadings(
                    sensor_id=soil_sensor.sensor_id,
                    value=soil_moisture_percentage,
                    reading_type='moisture_percentage',
                    timestamp=current_time,
                    quality_score=1.0
                )
                database.session.add(soil_reading)

                # Which zone(s) does THIS sensor actually report to? This is
                # the fix for "no logic checks which sensor belongs to which
                # zone" — ZoneSensor existed in the schema already (even
                # used in the mockDBdata.py seed script) but nothing live
                # ever read from it; moisture got attached to whichever
                # zone_id the caller happened to pass in, regardless of
                # what the sensor was actually assigned to.
                assignments = ZoneSensor.query.filter_by(sensor_id=soil_sensor.sensor_id).all()

                if assignments:
                    target_zone_ids = [a.zone_id for a in assignments]
                else:
                    # No assignment configured yet — fall back to the
                    # single zone passed in, so an unconfigured setup
                    # (e.g. right after this fix ships, before anyone's
                    # used the new "assign sensor to zone" UI) doesn't
                    # silently lose moisture data. This path should become
                    # rare once zones actually get sensors assigned.
                    target_zone_ids = [zone_id]
                    logger.warning(
                        f"Sensor '{soil_sensor.sensor_name}' has no zone assignment (ZoneSensor) — "
                        f"defaulting to zone {zone_id}. Assign it via POST /api/system/zones/<id>/sensors."
                    )

                for target_zone_id in target_zone_ids:
                    database.session.add(MoistureReading(
                        zone_id=target_zone_id,
                        sensor_id=soil_sensor.sensor_id,
                        moisture_level=soil_moisture_percentage,
                        timestamp=current_time
                    ))
                    # AUTO MODE: Check if irrigation needed, per zone this
                    # sensor actually covers — one shared sensor can serve
                    # several zones (e.g. today's single-sensor prototype),
                    # and each zone still gets its own schedule/threshold
                    # check rather than only ever the one zone_id guessed
                    # upstream.
                    self.check_auto_irrigation(target_zone_id, soil_moisture_percentage, current_time, user_id)
            
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

    def get_or_create_sensor(self, sensor_name, location, sensor_type, farm_id):
        """Get existing sensor or create new one, scoped to a farm.

        Previously scoped by baking user_id into the name string
        ("Soil Moisture Sensor - User 3") because Sensors had no real
        ownership column at all. It has one now (farm_id) — the name
        suffix below is kept only because sensor_name still has a global
        UNIQUE constraint from before that column existed; dropping that
        constraint (so sensor_name can just be the plain name) is a
        follow-up, not done blindly here since altering/renaming an
        existing unique index needs a real migration, not a guess."""
        farm_sensor_name = f"{sensor_name} - Farm {farm_id}"

        sensor = Sensors.query.filter_by(sensor_name=farm_sensor_name).first()
        if not sensor:
            sensor = Sensors(
                sensor_name=farm_sensor_name,
                farm_id=farm_id,
                location=location,
                type=sensor_type,
                status='active',
                last_updated=datetime.now()
            )
            database.session.add(sensor)
            database.session.commit()
            logger.info(f"Created new sensor: {farm_sensor_name} for farm {farm_id}")
        elif sensor.farm_id != farm_id:
            # Shouldn't happen (the name already encodes farm_id), but
            # cheap to self-heal if an older pre-migration row is missing it.
            sensor.farm_id = farm_id
            database.session.commit()
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

    def _auto_complete_log(self, log_id):
        """Mark an irrigation log 'completed' once its duration naturally
        elapses, unless it was already stopped manually in the meantime."""
        try:
            with self.app.app_context():
                log = IrrigationLog.query.get(log_id)
                if log and log.status == 'in_progress':
                    log.status = 'completed'
                    log.end_time = datetime.now()
                    database.session.commit()
        except Exception as e:
            logger.error(f"Error auto-completing irrigation log {log_id}: {e}")

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
                # Stays 'in_progress' — the Arduino runs the pump
                # autonomously; a background timer completes the log when
                # the duration actually elapses, matching real hardware state.
                irrigation_log.end_time = start_time + timedelta(seconds=schedule.duration)
                timer = threading.Timer(schedule.duration, self._auto_complete_log, args=[irrigation_log.log_id])
                timer.daemon = True
                timer.start()
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
                    if self.app:
                        with self.app.app_context():
                            monitoring_user_id = self._resolve_monitoring_identity()
                    else:
                        monitoring_user_id = self._resolve_monitoring_identity()

                    # Direct method call — no HTTP, no auth token needed,
                    # unlike the /api/sensors/store-readings route. This
                    # internally calls check_auto_irrigation() too.
                    success = self.store_sensor_data(user_id=monitoring_user_id)
                    if success:
                        logger.info(f"Auto monitoring: sensor data stored, auto-irrigation checked (user_id={monitoring_user_id})")
                    else:
                        logger.warning(f"Auto monitoring: failed to store sensor data this cycle (user_id={monitoring_user_id})")

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