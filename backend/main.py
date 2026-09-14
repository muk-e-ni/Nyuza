from flask import Flask, jsonify, g
import os
from routes.sensor_routes import sensor_bp
from routes.auth_routes import auth_bp
from routes.irrigations_routes import irrigation_bp
from routes.system_routes import system_bp
from routes.recommendations_routes import recommendation_bp
from config import get_db_conn, database, get_database_connection
from models import User
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
        
        # Check if users table has data
        user_count = User.query.count()
        print(f"✅ Users in database: {user_count}")
        
    except Exception as e:
        print(f"❌ Error creating tables: {e}")

if __name__ == '__main__':
    # Initialize services when the app starts
    with app.app_context():
        initialize_services()
    
    try:
        app.run(debug=True, host='0.0.0.0', port=5000)
    finally:
        # Ensure services are stopped when the app exits
        stop_services()