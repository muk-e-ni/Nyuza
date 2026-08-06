# irrigation_controller.py
from models import database, IrrigationSchedule, MoistureReading, IrrigationLog, IrrigationZone, Sensors
from datetime import datetime, timedelta
import json

class SmartIrrigationController:
    def __init__(self):
        self.check_interval = 300  # Check every 5 minutes
    
    def check_moisture_and_irrigate(self):
        """Main function to check moisture levels and trigger irrigation"""
        active_schedules = IrrigationSchedule.query.filter_by(
            is_active=True, 
            trigger_type='moisture'
        ).all()
        
        for schedule in active_schedules:
            self.check_zone_moisture(schedule)
    
    def check_zone_moisture(self, schedule):
        """Check moisture for a specific zone and trigger irrigation if needed"""
        zone = schedule.zone_id
        
        # Get the latest moisture reading for this zone
        latest_reading = MoistureReading.query.filter_by(
            zone_id=zone
        ).order_by(MoistureReading.timestamp.desc()).first()
        
        if not latest_reading:
            print(f"No moisture readings found for zone {zone}")
            return
        
        # Check if we need to irrigate
        if self.should_irrigate(schedule, latest_reading):
            self.trigger_irrigation(schedule, latest_reading.moisture_level)
    
    def should_irrigate(self, schedule, moisture_reading):
        """Determine if irrigation should be triggered"""
        current_time = datetime.now()
        
        # Check moisture threshold
        if moisture_reading.moisture_level > schedule.moisture_threshold:
            return False
        
        # Check minimum interval
        if schedule.last_triggered:
            time_since_last = (current_time - schedule.last_triggered).total_seconds()
            if time_since_last < schedule.minimum_interval:
                return False
        
        # Check daily irrigation limit
        today_start = current_time.replace(hour=0, minute=0, second=0, microsecond=0)
        today_irrigations = IrrigationLog.query.filter(
            IrrigationLog.zone == schedule.zone.zone_name,
            IrrigationLog.start_time >= today_start,
            IrrigationLog.status == 'completed'
        ).count()
        
        if today_irrigations >= schedule.max_daily_irrigations:
            print(f"Daily irrigation limit reached for zone {schedule.zone.zone_name}")
            return False
        
        # Check if it's daytime (optional - don't irrigate at night)
        if not self.is_daytime(current_time):
            print("Skipping irrigation - currently nighttime")
            return False
        
        return True
    
    def is_daytime(self, current_time):
        """Check if it's daytime (6 AM to 8 PM)"""
        hour = current_time.hour
        return 6 <= hour < 20
    
    def trigger_irrigation(self, schedule, current_moisture):
        """Trigger irrigation for a zone"""
        try:
            print(f"Triggering irrigation for zone {schedule.zone.zone_name}")
            print(f"Current moisture: {current_moisture}%, Threshold: {schedule.moisture_threshold}%")
            
            # Create irrigation log
            irrigation_log = IrrigationLog(
                user_id=1,  # System user
                zone=schedule.zone.zone_name,
                duration=schedule.duration,
                water_used=self.calculate_water_usage(schedule),
                start_time=datetime.now(),
                status='in_progress',
                trigger_type='automatic'
            )
            
            database.session.add(irrigation_log)
            schedule.last_triggered = datetime.now()
            database.session.commit()
            
            # Send command to Arduino to start irrigation
            self.send_to_arduino(schedule.zone.zone_name, schedule.duration)
            
            # Update log after completion
            irrigation_log.status = 'completed'
            irrigation_log.end_time = datetime.now()
            database.session.commit()
            
            print(f"Irrigation completed for zone {schedule.zone.zone_name}")
            
        except Exception as e:
            print(f"Error triggering irrigation: {e}")
            database.session.rollback()
    
    def calculate_water_usage(self, schedule):
        """Calculate water usage based on zone area and duration"""
        # This would depend on your pump flow rate
        # Example: 10 liters per minute * duration in minutes
        flow_rate = 10  # liters per minute
        duration_minutes = schedule.duration / 60
        return flow_rate * duration_minutes
    
    def send_to_arduino(self, zone, duration):
        """Send irrigation command to Arduino"""
        # Implement your Arduino communication here
        command = {
            'type': 'start_irrigation',
            'zone': zone,
            'duration': duration
        }
        print(f"Sending to Arduino: {command}")
        
        # Example using serial communication:
        # arduino_controller.send_command(command)