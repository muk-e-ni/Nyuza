# mockDBdata.py
import random
import math
from datetime import datetime, timedelta
from config import database
from models import (
    User, Sensors, SensorReadings, IrrigationLog, Recommendation, 
    IrrigationZone, IrrigationSchedule, MoistureReading, IrrigationRule,
    ZoneSensor, SystemSettings, WeatherData, AdminLog
)
from werkzeug.security import generate_password_hash

def clear_existing_data():
    """Clear existing data from all tables"""
    print("Clearing existing data...")
    try:
        # Delete data in correct order to handle foreign key constraints
        database.session.query(AdminLog).delete()
        database.session.query(Recommendation).delete()
        database.session.query(IrrigationLog).delete()
        database.session.query(MoistureReading).delete()
        database.session.query(ZoneSensor).delete()
        database.session.query(IrrigationRule).delete()
        database.session.query(IrrigationSchedule).delete()
        database.session.query(SensorReadings).delete()
        database.session.query(WeatherData).delete()
        database.session.query(SystemSettings).delete()
        database.session.query(IrrigationZone).delete()
        database.session.query(Sensors).delete()
        database.session.query(User).delete()
        
        database.session.commit()
        print("✅ Existing data cleared successfully!")
    except Exception as e:
        database.session.rollback()
        print(f"❌ Error clearing data: {e}")
        raise

def insert_mock_data():
    """Insert comprehensive mock data for testing the irrigation system"""
    
    print("Starting mock data insertion...")
    
    try:
        # Clear existing data first
        clear_existing_data()
        
        # 1. Create Users
        print("Creating users...")
        users = [
            User(
                username="admin",
                email="admin@irrigation.com",
                password=generate_password_hash("admin123"),
                type="admin",
                last_login=datetime.now()
            ),
            User(
                username="farmer_john",
                email="john@farm.com", 
                password=generate_password_hash("password123"),
                type="user",
                last_login=datetime.now() - timedelta(hours=2)
            ),
            User(
                username="test_user",
                email="test@user.com",
                password=generate_password_hash("test123"),
                type="user",
                last_login=datetime.now() - timedelta(days=1)
            )
        ]
        
        for user in users:
            database.session.add(user)
        database.session.commit()
        print("✅ Users created successfully!")
        
        # Get user IDs after commit
        admin_user = User.query.filter_by(username="admin").first()
        farmer_user = User.query.filter_by(username="farmer_john").first()
        test_user = User.query.filter_by(username="test_user").first()
        
        # 2. Create Irrigation Zones
        print("Creating irrigation zones...")
        zones = [
            IrrigationZone(
                zone_name="Front Lawn",
                description="Main front lawn with grass",
                area_sqm=150.0,
                crop_type="Grass",
                soil_type="Loam",
                water_requirement=75.0,
                is_active=True
            ),
            IrrigationZone(
                zone_name="Vegetable Garden",
                description="Backyard vegetable garden",
                area_sqm=80.0,
                crop_type="Mixed Vegetables",
                soil_type="Sandy Loam", 
                water_requirement=120.0,
                is_active=True
            ),
            IrrigationZone(
                zone_name="Flower Beds",
                description="Decorative flower beds around house",
                area_sqm=45.0,
                crop_type="Mixed Flowers",
                soil_type="Clay Loam",
                water_requirement=60.0,
                is_active=True
            )
        ]
        
        for zone in zones:
            database.session.add(zone)
        database.session.commit()
        print("✅ Irrigation zones created successfully!")
        
        # Get zone IDs after commit
        front_lawn = IrrigationZone.query.filter_by(zone_name="Front Lawn").first()
        vegetable_garden = IrrigationZone.query.filter_by(zone_name="Vegetable Garden").first()
        flower_beds = IrrigationZone.query.filter_by(zone_name="Flower Beds").first()
        
        # 3. Create Sensors
        print("Creating sensors...")
        sensors = [
            Sensors(
                sensor_name="soil_moisture_1",
                location="Front Lawn - Center",
                type="moisture",
                status="active",
                calibration_data='{"calibration_factor": 1.02, "offset": -2.5}'
            ),
            Sensors(
                sensor_name="soil_moisture_2", 
                location="Vegetable Garden - North",
                type="moisture",
                status="active",
                calibration_data='{"calibration_factor": 0.98, "offset": 1.2}'
            ),
            Sensors(
                sensor_name="soil_moisture_3",
                location="Flower Beds - East",
                type="moisture", 
                status="active",
                calibration_data='{"calibration_factor": 1.05, "offset": -1.8}'
            ),
            Sensors(
                sensor_name="temperature_1",
                location="Greenhouse",
                type="temperature",
                status="active",
                calibration_data='{"calibration_factor": 1.0, "offset": 0.5}'
            ),
            Sensors(
                sensor_name="humidity_1",
                location="Weather Station",
                type="humidity", 
                status="active",
                calibration_data='{"calibration_factor": 0.95, "offset": 3.0}'
            )
        ]
        
        for sensor in sensors:
            database.session.add(sensor)
        database.session.commit()
        print("✅ Sensors created successfully!")
        
        # Get sensor IDs after commit
        moisture_sensor_1 = Sensors.query.filter_by(sensor_name="soil_moisture_1").first()
        moisture_sensor_2 = Sensors.query.filter_by(sensor_name="soil_moisture_2").first()
        moisture_sensor_3 = Sensors.query.filter_by(sensor_name="soil_moisture_3").first()
        temp_sensor = Sensors.query.filter_by(sensor_name="temperature_1").first()
        humidity_sensor = Sensors.query.filter_by(sensor_name="humidity_1").first()
        
        # 4. Link sensors to zones
        print("Linking sensors to zones...")
        zone_sensors = [
            ZoneSensor(zone_id=front_lawn.zone_id, sensor_id=moisture_sensor_1.sensor_id),
            ZoneSensor(zone_id=vegetable_garden.zone_id, sensor_id=moisture_sensor_2.sensor_id),
            ZoneSensor(zone_id=flower_beds.zone_id, sensor_id=moisture_sensor_3.sensor_id),
        ]
        
        for zone_sensor in zone_sensors:
            database.session.add(zone_sensor)
        database.session.commit()
        print("✅ Zone sensors linked successfully!")
        
        # 5. Create Irrigation Schedules
        print("Creating irrigation schedules...")
        schedules = [
            IrrigationSchedule(
                zone_id=front_lawn.zone_id,
                name="Morning Lawn Watering",
                trigger_type="timed",
                moisture_threshold=30.0,
                minimum_interval=7200,  # 2 hours
                duration=900,  # 15 minutes
                max_daily_irrigations=2,
                is_active=True
            ),
            IrrigationSchedule(
                zone_id=vegetable_garden.zone_id,
                name="Vegetable Garden Auto",
                trigger_type="moisture",
                moisture_threshold=40.0,
                minimum_interval=3600,  # 1 hour
                duration=1200,  # 20 minutes
                max_daily_irrigations=3,
                is_active=True
            ),
            IrrigationSchedule(
                zone_id=flower_beds.zone_id,
                name="Flower Beds Schedule",
                trigger_type="timed", 
                moisture_threshold=35.0,
                minimum_interval=10800,  # 3 hours
                duration=600,  # 10 minutes
                max_daily_irrigations=2,
                is_active=True
            )
        ]
        
        for schedule in schedules:
            database.session.add(schedule)
        database.session.commit()
        print("✅ Irrigation schedules created successfully!")
        
        # 6. Create Sensor Readings (last 3 days - smaller dataset for testing)
        print("Creating sensor readings...")
        sensor_readings = []
        moisture_readings = []
        
        # Generate data for the last 3 days (reduced for testing)
        for days_ago in range(3, -1, -1):
            base_time = datetime.now() - timedelta(days=days_ago)
            
            # Create readings every 4 hours for each day (reduced frequency)
            for hour in range(0, 24, 4):
                reading_time = base_time + timedelta(hours=hour)
                
                # Moisture readings (follow daily pattern)
                moisture_base = 50 + 20 * math.sin(hour * math.pi / 12)  # Daily cycle
                
                # Front Lawn moisture
                moisture_1 = max(20, min(80, moisture_base + random.uniform(-5, 5)))
                sensor_readings.append(SensorReadings(
                    sensor_id=moisture_sensor_1.sensor_id,
                    value=moisture_1,
                    reading_type="moisture",
                    timestamp=reading_time,
                    quality_score=random.uniform(0.9, 1.0)
                ))
                moisture_readings.append(MoistureReading(
                    zone_id=front_lawn.zone_id,
                    sensor_id=moisture_sensor_1.sensor_id,
                    moisture_level=moisture_1,
                    temperature=20 + random.uniform(-2, 5),
                    timestamp=reading_time
                ))
                
                # Vegetable Garden moisture (dries faster)
                moisture_2 = max(25, min(75, moisture_base - 10 + random.uniform(-5, 5)))
                sensor_readings.append(SensorReadings(
                    sensor_id=moisture_sensor_2.sensor_id,
                    value=moisture_2,
                    reading_type="moisture", 
                    timestamp=reading_time,
                    quality_score=random.uniform(0.9, 1.0)
                ))
                moisture_readings.append(MoistureReading(
                    zone_id=vegetable_garden.zone_id,
                    sensor_id=moisture_sensor_2.sensor_id,
                    moisture_level=moisture_2,
                    temperature=22 + random.uniform(-1, 4),
                    timestamp=reading_time
                ))
                
                # Flower Beds moisture
                moisture_3 = max(30, min(70, moisture_base - 5 + random.uniform(-5, 5)))
                sensor_readings.append(SensorReadings(
                    sensor_id=moisture_sensor_3.sensor_id,
                    value=moisture_3,
                    reading_type="moisture",
                    timestamp=reading_time, 
                    quality_score=random.uniform(0.9, 1.0)
                ))
                moisture_readings.append(MoistureReading(
                    zone_id=flower_beds.zone_id,
                    sensor_id=moisture_sensor_3.sensor_id,
                    moisture_level=moisture_3,
                    temperature=21 + random.uniform(-2, 3),
                    timestamp=reading_time
                ))
        
        # Add sensor readings in batches
        batch_size = 50
        for i in range(0, len(sensor_readings), batch_size):
            database.session.add_all(sensor_readings[i:i+batch_size])
            database.session.commit()
        
        for i in range(0, len(moisture_readings), batch_size):
            database.session.add_all(moisture_readings[i:i+batch_size])
            database.session.commit()
            
        print("✅ Sensor readings created successfully!")
        
        # 7. Create Irrigation Logs (last 2 days)
        print("Creating irrigation logs...")
        irrigation_logs = []
        
        for days_ago in range(2, -1, -1):
            zones_list = [front_lawn, vegetable_garden, flower_beds]
            for zone in zones_list:
                # 1-2 irrigation events per day per zone
                for event in range(random.randint(1, 2)):
                    start_time = datetime.now() - timedelta(
                        days=days_ago, 
                        hours=random.randint(6, 18),
                        minutes=random.randint(0, 59)
                    )
                    duration = random.randint(300, 1200)  # 5-20 minutes
                    end_time = start_time + timedelta(seconds=duration)
                    water_used = round(duration * 0.5, 2)  # Assume 0.5 L/sec flow rate
                    
                    irrigation_logs.append(IrrigationLog(
                        user_id=farmer_user.user_id,
                        zone=zone.zone_name,
                        duration=duration,
                        water_used=water_used,
                        start_time=start_time,
                        end_time=end_time,
                        status="completed",
                        trigger_type=random.choice(["manual", "automatic"])
                    ))
        
        for log in irrigation_logs:
            database.session.add(log)
        database.session.commit()
        print("✅ Irrigation logs created successfully!")
        
        # 8. Create Weather Data (last 3 days)
        print("Creating weather data...")
        weather_data = []
        
        for days_ago in range(3, -1, -1):
            for hour in range(0, 24, 6):  # Every 6 hours
                timestamp = datetime.now() - timedelta(days=days_ago, hours=hour)
                
                # Temperature follows daily pattern
                base_temp = 20 + 8 * math.sin(hour * math.pi / 12)
                
                weather_data.append(WeatherData(
                    temperature=round(base_temp + random.uniform(-3, 3), 1),
                    humidity=round(50 + 30 * (1 - math.sin(hour * math.pi / 12)) + random.uniform(-10, 10), 1),
                    rainfall=random.choice([0, 0, 0, 0.5]),  # Mostly no rain
                    wind_speed=round(random.uniform(0, 15), 1),
                    solar_radiation=max(0, round(800 * math.sin(hour * math.pi / 12) + random.uniform(-100, 100), 1)),
                    timestamp=timestamp,
                    forecast=False,
                    source="api"
                ))
        
        for weather in weather_data:
            database.session.add(weather)
        database.session.commit()
        print("✅ Weather data created successfully!")
        
        # 9. Create AI Recommendations
        print("Creating AI recommendations...")
        recommendations = [
            Recommendation(
                user_id=farmer_user.user_id,
                title="Optimize Front Lawn Irrigation",
                description="Soil moisture data shows the front lawn is being over-watered. Consider reducing irrigation duration by 20%.",
                recommendation_type="optimization",
                priority="medium",
                status="pending",
                created_at=datetime.now() - timedelta(hours=2),
                expires_at=datetime.now() + timedelta(days=7),
                ai_model_version="v2.1",
                confidence_score=0.87,
                input_parameters='{"current_moisture": 65, "average_moisture": 68, "water_usage": 125}'
            ),
            Recommendation(
                user_id=farmer_user.user_id,
                title="Increase Vegetable Garden Watering",
                description="Vegetable garden moisture levels are consistently low. Increase irrigation frequency during hot periods.",
                recommendation_type="irrigation",
                priority="high", 
                status="applied",
                created_at=datetime.now() - timedelta(days=1),
                applied_at=datetime.now() - timedelta(hours=12),
                expires_at=datetime.now() + timedelta(days=5),
                ai_model_version="v2.1",
                confidence_score=0.92,
                input_parameters='{"current_moisture": 28, "temperature": 32, "forecast_rain": 0}'
            )
        ]
        
        for recommendation in recommendations:
            database.session.add(recommendation)
        database.session.commit()
        print("✅ AI recommendations created successfully!")
        
        # 10. Create System Settings
        print("Creating system settings...")
        system_settings = [
            SystemSettings(
                setting_key="system_name",
                setting_value="Smart Irrigation System",
                data_type="string",
                description="Name of the irrigation system"
            ),
            SystemSettings(
                setting_key="auto_irrigation_enabled",
                setting_value="true",
                data_type="boolean", 
                description="Enable automatic irrigation based on sensor data"
            ),
            SystemSettings(
                setting_key="default_irrigation_duration",
                setting_value="900",
                data_type="integer",
                description="Default irrigation duration in seconds"
            )
        ]
        
        for setting in system_settings:
            database.session.add(setting)
        database.session.commit()
        print("✅ System settings created successfully!")
        
        # 11. Create Admin Logs
        print("Creating admin logs...")
        admin_logs = [
            AdminLog(
                admin_id=admin_user.user_id,
                action="SYSTEM_INITIALIZED",
                details="Mock data inserted successfully",
                ip_address="127.0.0.1",
                timestamp=datetime.now()
            )
        ]
        
        for log in admin_logs:
            database.session.add(log)
        database.session.commit()
        print("✅ Admin logs created successfully!")
        
        print("\n🎉 Mock data insertion completed successfully!")
        print(f"📊 Created: {len(users)} users, {len(zones)} zones, {len(sensors)} sensors")
        print(f"📊 Created: {len(sensor_readings)} sensor readings, {len(irrigation_logs)} irrigation logs")
        print(f"📊 Created: {len(recommendations)} recommendations, {len(weather_data)} weather records")
        
        # Print login credentials for testing
        print("\n🔐 Test Login Credentials:")
        print("Admin: username='admin', password='admin123'")
        print("Farmer: username='farmer_john', password='password123'")
        print("Test User: username='test_user', password='test123'")
        print("\n📍 Zones available: Front Lawn, Vegetable Garden, Flower Beds")
        
    except Exception as e:
        database.session.rollback()
        print(f"❌ Error inserting mock data: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    insert_mock_data()