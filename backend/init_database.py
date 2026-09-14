# init_database.py
from config import database
from models import *
from datetime import datetime
from main import app
from sqlalchemy import text, inspect

def ensure_columns():
    """create_all() only creates tables that don't exist yet — it never
    alters existing tables. Since this project has no Alembic/migrations
    setup, new columns added to models.py need to be patched onto an
    already-existing database by hand. This does that safely (checks
    information_schema first, so it's a no-op on a fresh database)."""
    inspector = inspect(database.engine)
    existing_tables = inspector.get_table_names()

    columns_to_ensure = {
        'users': [
            ('profile_picture', 'LONGTEXT'),
        ],
        'plant_health_readings': [
            ('dosed', 'BOOLEAN NOT NULL DEFAULT FALSE'),
            ('farmer_reviewed', 'BOOLEAN NOT NULL DEFAULT FALSE'),
            ('farmer_agrees', 'BOOLEAN NULL'),
            ('farmer_corrected_class', 'VARCHAR(50) NULL'),
            ('reviewed_at', 'DATETIME NULL'),
        ],
    }

    for table, columns in columns_to_ensure.items():
        if table not in existing_tables:
            continue  # create_all() will have made it fresh, already correct
        existing_columns = {c['name'] for c in inspector.get_columns(table)}
        for column_name, ddl_type in columns:
            if column_name not in existing_columns:
                try:
                    database.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {column_name} {ddl_type}"))
                    database.session.commit()
                    print(f"✓ Added column {table}.{column_name}")
                except Exception as e:
                    database.session.rollback()
                    print(f"✗ Could not add column {table}.{column_name}: {e}")

def init_database():
    """Initialize database tables and default data"""
    
    with app.app_context():
        try:
            # Create only tables that don't exist
            database.create_all()
            print("✓ Tables created/verified")

            ensure_columns()
            
            # Add default system settings (if they don't exist)
            default_settings = [
                {
                    'key': 'auto_irrigation_threshold',
                    'value': '30',
                    'type': 'integer',
                    'description': 'Soil moisture percentage threshold for automatic irrigation'
                },
                {
                    'key': 'max_daily_water',
                    'value': '1000',
                    'type': 'integer', 
                    'description': 'Maximum daily water usage in liters'
                }
            ]
            
            for setting_data in default_settings:
                existing = SystemSettings.query.filter_by(
                    setting_key=setting_data['key']
                ).first()
                
                if not existing:
                    new_setting = SystemSettings(
                        setting_key=setting_data['key'],
                        setting_value=setting_data['value'],
                        data_type=setting_data['type'],
                        description=setting_data['description']
                    )
                    database.session.add(new_setting)
                    print(f"✓ Added setting: {setting_data['key']}")
            
            # Add default irrigation zones
            default_zones = [
                {
                    'zone_name': 'Front Lawn',
                    'description': 'Main front lawn area',
                    'area_sqm': 50.0,
                    'crop_type': 'Grass',
                    'soil_type': 'Loam',
                    'water_requirement': 25.0
                },
                {
                    'zone_name': 'Back Garden', 
                    'description': 'Vegetable garden in backyard',
                    'area_sqm': 30.0,
                    'crop_type': 'Mixed Vegetables',
                    'soil_type': 'Clay', 
                    'water_requirement': 40.0
                }
            ]
            
            for zone_data in default_zones:
                existing = IrrigationZone.query.filter_by(
                    zone_name=zone_data['zone_name']
                ).first()
                
                if not existing:
                    new_zone = IrrigationZone(**zone_data)
                    database.session.add(new_zone)
                    print(f"✓ Added zone: {zone_data['zone_name']}")
            
            # Add default sensors
            default_sensors = [
                {
                    'sensor_name': 'soil_moisture_1',
                    'location': 'Front Lawn - Center', 
                    'type': 'soil_moisture'
                },
                {
                    'sensor_name': 'temperature_1',
                    'location': 'Back Garden',
                    'type': 'temperature'
                }
            ]
            
            for sensor_data in default_sensors:
                existing = Sensors.query.filter_by(
                    sensor_name=sensor_data['sensor_name']
                ).first()
                
                if not existing:
                    new_sensor = Sensors(**sensor_data)
                    database.session.add(new_sensor)
                    print(f"✓ Added sensor: {sensor_data['sensor_name']}")
            
            database.session.commit()
            print("✓ Database initialized successfully!")
            
        except Exception as e:
            database.session.rollback()
            print(f"✗ Error initializing database: {e}")

if __name__ == '__main__':
    init_database()