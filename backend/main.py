from flask import Flask, jsonify, g
import os
from routes.sensor_routes import sensor_bp
from routes.auth_routes import auth_bp
from routes.irrigations_routes import irrigation_bp
from routes.system_routes import system_bp
from routes.recommendations_routes import recommendation_bp
from config import get_db_conn, database, get_database_connection
from models import User, Farm, FarmMembership, Device, IrrigationZone, Sensors
import jwt 
from datetime import datetime
from functools import wraps
from flask_cors import CORS
from routes.weather_routes import weather_bp
from routes.ai_routes import ai_bp
from routes.vision_routes import vision_bp
from routes.profile_update_routes import profile_bp
from services.sensor_service import sensor_service
from services.vision_monitoring_service import vision_monitoring_service
import logging
import traceback
import atexit
from routes.notification_routes import notification_bp
from routes.preferences_routes import preferences_bp

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Initialize database connection
try:
    database = get_db_conn(app)
    print("✅ Database configuration loaded")
except Exception as e:
    print(f"❌ Database configuration error: {e}")

CORS(app)

# Initialize sensor service with app
sensor_service.init_app(app)
vision_monitoring_service.init_app(app)

# Register routes with correct URL prefixes
app.register_blueprint(auth_bp, url_prefix='/auth')
app.register_blueprint(profile_bp, url_prefix = '/profile')
app.register_blueprint(sensor_bp, url_prefix='/sensors')
app.register_blueprint(irrigation_bp, url_prefix='/irrigation')
app.register_blueprint(system_bp, url_prefix='/system')
app.register_blueprint(recommendation_bp, url_prefix='/recommendations')
app.register_blueprint(weather_bp, url_prefix='/weather')
app.register_blueprint(ai_bp, url_prefix = '/ai')
app.register_blueprint(vision_bp, url_prefix='/vision')
app.register_blueprint(notification_bp, url_prefix='/notifications')
app.register_blueprint(preferences_bp, url_prefix='/profile')

# Track if services are running
services_started = False

@app.route('/')
def home():    
    return jsonify({
        'message': 'Smart Irrigation System API',
        'version': '1.0',
        'endpoints': {
            'auth': '/auth/*',
            'sensors': '/sensors/*',
            'irrigation': '/irrigation/*',
            'system': '/system/*',
            'recommendations': '/recommendations/*'
        }
    })

def initialize_services():
    """Initialize all background services"""
    global services_started
    if services_started:
        return
        
    try:
        # Initialize sensor service
        sensor_service.start_scheduled_monitoring()
        logger.info("✅ Sensor service started successfully")

        # Initialize vision monitoring (camera -> disease + pest detection, automatic)
        vision_monitoring_service.start_monitoring()
        logger.info("✅ Vision monitoring service started successfully")
        
        # Start cleanup task
        sensor_service.run_cleanup_task()
        logger.info("✅ Cleanup task started")
        
        services_started = True
        
    except Exception as e:
        logger.error(f"❌ Service initialization failed: {e}")

def stop_services():
    """Stop all background services"""
    global services_started
    if services_started:
        try:
            sensor_service.stop_monitoring()
            vision_monitoring_service.stop_monitoring()
            logger.info("🛑 Services stopped gracefully")
            services_started = False
        except Exception as e:
            logger.error(f"Error during shutdown: {e}")

# Register cleanup function to run when application exits
atexit.register(stop_services)

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        # Test database connection
        database.session.execute('SELECT 1')
        db_status = 'connected'
        
        # Test direct MySQL connection
        direct_conn = get_database_connection()
        if direct_conn:
            direct_conn.close()
            direct_status = 'connected'
        else:
            direct_status = 'failed'
            
    except Exception as e:
        db_status = f'error: {str(e)}'
        direct_status = 'failed'
    
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'sqlalchemy_database': db_status,
        'direct_mysql': direct_status,
        'sensor_service': {
            'running': sensor_service.is_monitoring,
            'services_started': services_started,
            'arduino_connected': sensor_service.arduino.is_open if sensor_service.arduino else False
        },
        'database_uri': app.config['SQLALCHEMY_DATABASE_URI'].replace(os.getenv("password"), '***') if 'SQLALCHEMY_DATABASE_URI' in app.config else 'not set'
    })

# Create tables
with app.app_context():
    try:
        database.create_all()
        print("✅ Database tables created successfully!")

        # create_all() only creates missing TABLES, never adds columns to
        # tables that already exist. This project has no Alembic/migrations
        # setup, so newly-added model columns need a manual patch-up here.
        try:
            from sqlalchemy import text, inspect
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
                'irrigation_zones': [
                    ('farm_id', 'INT NULL'),
                ],
                'sensors': [
                    ('farm_id', 'INT NULL'),
                ],
            }
            for table, columns in columns_to_ensure.items():
                if table not in existing_tables:
                    continue
                existing_columns = {c['name'] for c in inspector.get_columns(table)}
                for column_name, ddl_type in columns:
                    if column_name not in existing_columns:
                        database.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {column_name} {ddl_type}"))
                        database.session.commit()
                        print(f"✅ Added column {table}.{column_name}")
        except Exception as migration_error:
            database.session.rollback()
            print(f"⚠️ Column migration check failed (non-fatal): {migration_error}")


        try:
            existing_farm = Farm.query.first()
            if not existing_farm:

                seed_zone = IrrigationZone.query.first()
                owner_user_id = seed_zone.user_id if seed_zone else None
                if not owner_user_id:
                    first_user = User.query.order_by(User.user_id).first()
                    owner_user_id = first_user.user_id if first_user else None

                if owner_user_id:
                    farm = Farm(name="Primary Farm", owner_user_id=owner_user_id)
                    database.session.add(farm)
                    database.session.flush()  # get farm.farm_id before using it below

                    database.session.add(FarmMembership(
                        farm_id=farm.farm_id, user_id=owner_user_id, role='owner'
                    ))

                    # Represents whatever hardware this backend instance is
                    # currently configured to talk to (see sensor_service.py's
                    # transport setup) — one row today, matching the one
                    # physical Arduino/ESP8266 bridge in this prototype.
                    device_identifier = os.getenv('ARDUINO_WIFI_HOST') or os.getenv('MONITORING_DEVICE_ID') or 'primary-controller'
                    transport_type = os.getenv('ARDUINO_TRANSPORT', 'serial').strip().lower()
                    database.session.add(Device(
                        farm_id=farm.farm_id,
                        device_identifier=device_identifier,
                        device_type='controller',
                        transport_type=transport_type,
                    ))

                    # Backfill farm_id onto anything created before Farm existed.
                    IrrigationZone.query.filter(
                        IrrigationZone.user_id == owner_user_id,
                        IrrigationZone.farm_id.is_(None)
                    ).update({'farm_id': farm.farm_id}, synchronize_session=False)
                    # Sensors have no user_id to match against (that was the
                    # actual gap) — with only one farm, every un-owned sensor
                    # unambiguously belongs to it. Once a second farm can
                    # exist, this line stops being correct and needs the
                    # real per-device ownership path instead.
                    Sensors.query.filter(Sensors.farm_id.is_(None)).update(
                        {'farm_id': farm.farm_id}, synchronize_session=False
                    )

                    # get_or_create_sensor (sensor_service.py) now looks
                    # sensors up by a "<name> - Farm <farm_id>" suffix
                    # instead of the old "<name> - User <user_id>" one.
                    # Without renaming existing rows to match, the next
                    # monitoring cycle would think they're new sensors and
                    # create fresh duplicates — silently orphaning all
                    # existing reading history under the old row instead of
                    # continuing it.
                    old_suffix = f" - User {owner_user_id}"
                    new_suffix = f" - Farm {farm.farm_id}"
                    for sensor in Sensors.query.filter(Sensors.sensor_name.like(f"%{old_suffix}")).all():
                        sensor.sensor_name = sensor.sensor_name[:-len(old_suffix)] + new_suffix

                    database.session.commit()
                    print(f"✅ Created initial Farm (farm_id={farm.farm_id}) for user_id={owner_user_id}, backfilled zones/sensors")
                else:
                    print("ℹ️ No users yet — skipping Farm backfill (nothing to attach it to)")
        except Exception as farm_error:
            database.session.rollback()
            print(f"⚠️ Farm backfill failed (non-fatal): {farm_error}")
        
        # Check if users table has data
        user_count = User.query.count()
        print(f"✅ Users in database: {user_count}")
        
    except Exception as e:
        print(f"❌ Error creating tables: {e}")

if __name__ == '__main__':

    with app.app_context():
        initialize_services()
    
    try:
     
        app.run(debug=True, use_reloader=False, host='0.0.0.0', port=5000)
    finally:
        # Ensure services are stopped when the app exits
        stop_services()