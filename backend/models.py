from config import database 
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

class User(database.Model):
    __tablename__ = 'users'

    user_id = database.Column(database.Integer, primary_key=True)
    username = database.Column(database.String(100), nullable=False, unique=True)
    email = database.Column(database.String(200), nullable=False, unique=True)
    password = database.Column(database.String(250), nullable=False)
    date_registered = database.Column(database.DateTime, default=datetime.now)
    type = database.Column(database.String(50), default='user')  # Changed from 'type' to 'role'
    is_active = database.Column(database.Boolean, default=True)
    last_login = database.Column(database.DateTime)

    phone_number = database.Column(database.String(20))

    # Relationships
    irrigation_logs = database.relationship('IrrigationLog', backref='user', lazy=True)
    recommendations = database.relationship('Recommendation', backref='user', lazy=True)
    irrigation_zones = database.relationship('IrrigationZone', backref='user', lazy=True)
    schedules = database.relationship('IrrigationSchedule', backref='user', lazy=True)

    def set_password(self, password):
        self.password = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password, password)

    def is_admin(self):
        return self.type == 'admin'

    def update_login_time(self):
        self.last_login = datetime.now()

class UserPreferences(database.Model):
    __tablename__ = 'user_preferences'
    
    id = database.Column(database.Integer, primary_key=True)
    user_id = database.Column(database.Integer, database.ForeignKey('users.user_id'), unique=True, nullable=False)
    notifications = database.Column(database.Boolean, default=True)
    language = database.Column(database.String(10), default='en')
    timezone = database.Column(database.String(50), default='Africa/Nairobi')
    created_at = database.Column(database.DateTime, default=datetime.now)
    updated_at = database.Column(database.DateTime, default=datetime.now, onupdate=datetime.now)
    notification_methods = database.Column(database.JSON) 
    
    user = database.relationship('User', backref=database.backref('preferences', uselist=False))

    def __init__(self, **kwargs):
        super(UserPreferences, self).__init__(**kwargs)
        # Set default notification methods in the constructor 
        if self.notification_methods is None:
            self.notification_methods = {
                'web': True,
                'email': False,
                'sms': False,
                'push': False
            }

class AdminLog(database.Model):
    __tablename__ = 'admin_logs'

    log_id = database.Column(database.Integer, primary_key=True)
    admin_id = database.Column(database.Integer, database.ForeignKey('users.user_id'), nullable=False)
    action = database.Column(database.String(200), nullable=False)
    details = database.Column(database.Text)
    ip_address = database.Column(database.String(50))
    timestamp = database.Column(database.DateTime, default=datetime.now)

    admin = database.relationship('User', backref='admin_actions')

class Sensors(database.Model):
    __tablename__ = 'sensors'

    sensor_id = database.Column(database.Integer, primary_key=True)
    sensor_name = database.Column(database.String(100), nullable=False, unique=True)
    location = database.Column(database.String(100), nullable=False)
    last_updated = database.Column(database.DateTime, default=datetime.now)
    type = database.Column(database.String(50), default='temperature')
    status = database.Column(database.String(20), default='active')  # active, inactive, maintenance
    calibration_data = database.Column(database.Text)  # JSON string for sensor calibration

    # Relationships
    readings = database.relationship('SensorReadings', backref='sensor', lazy=True)
    zone_sensors = database.relationship('ZoneSensor', backref='sensor', lazy=True)
    moisture_readings = database.relationship('MoistureReading', backref='sensor', lazy=True)

class SensorReadings(database.Model):
    __tablename__ = 'sensor_readings'

    reading_id = database.Column(database.Integer, primary_key=True)
    sensor_id = database.Column(database.Integer, database.ForeignKey('sensors.sensor_id'), nullable=False)
    value = database.Column(database.Float, nullable=False)
    reading_type = database.Column(database.String(50), nullable=False)  # temperature, moisture, humidity, etc.
    timestamp = database.Column(database.DateTime, default=datetime.now)
    quality_score = database.Column(database.Float, default=1.0)  # Data quality indicator (0.0 to 1.0)

    # Index for faster queries
    __table_args__ = (
        database.Index('idx_sensor_timestamp', 'sensor_id', 'timestamp'),
        database.Index('idx_reading_type', 'reading_type'),
    )

class IrrigationLog(database.Model):
    __tablename__ = 'irrigation_logs'

    log_id = database.Column(database.Integer, primary_key=True)
    user_id = database.Column(database.Integer, database.ForeignKey('users.user_id'), nullable=False)
    zone_id = database.Column(database.Integer, database.ForeignKey('irrigation_zones.zone_id'), nullable=True)  # Added zone_id foreign key
    zone = database.Column(database.String(50), nullable=False)  # zone1, zone2, etc.
    duration = database.Column(database.Integer, nullable=False)  # duration in seconds
    water_used = database.Column(database.Float)  # water used in liters
    start_time = database.Column(database.DateTime, default=datetime.now)
    end_time = database.Column(database.DateTime)
    status = database.Column(database.String(20), default='completed')  # scheduled, in_progress, completed, failed
    trigger_type = database.Column(database.String(20), default='manual')  # manual, automatic, schedule

    # Relationships
    zone_rel = database.relationship('IrrigationZone', backref='irrigation_logs')

    # Index for faster queries
    __table_args__ = (
        database.Index('idx_irrigation_user_time', 'user_id', 'start_time'),
        database.Index('idx_irrigation_zone', 'zone'),
    )

class Recommendation(database.Model):
    __tablename__ = 'recommendations'

    recommendation_id = database.Column(database.Integer, primary_key=True)
    user_id = database.Column(database.Integer, database.ForeignKey('users.user_id'), nullable=False)
    title = database.Column(database.String(200), nullable=False)
    description = database.Column(database.Text, nullable=False)
    recommendation_type = database.Column(database.String(50), nullable=False)  # irrigation, maintenance, alert, optimization
    priority = database.Column(database.String(20), default='medium')  # low, medium, high, critical
    status = database.Column(database.String(20), default='pending')  # pending, applied, dismissed, expired
    created_at = database.Column(database.DateTime, default=datetime.now)
    applied_at = database.Column(database.DateTime)
    expires_at = database.Column(database.DateTime)
    
    # AI model metadata
    ai_model_version = database.Column(database.String(50))
    confidence_score = database.Column(database.Float)  # AI confidence level (0.0 to 1.0)
    input_parameters = database.Column(database.Text)  # JSON string of input data used for recommendation
    
    # Relationships
    actions = database.relationship('RecommendationAction', backref='recommendation', lazy=True)

class RecommendationAction(database.Model):
    __tablename__ = 'recommendation_actions'

    action_id = database.Column(database.Integer, primary_key=True)
    recommendation_id = database.Column(database.Integer, database.ForeignKey('recommendations.recommendation_id'), nullable=False)
    action_type = database.Column(database.String(50), nullable=False)  # irrigate, adjust_schedule, maintenance, etc.
    parameters = database.Column(database.Text)  # JSON string with action parameters
    executed_at = database.Column(database.DateTime)
    result = database.Column(database.String(20))  # success, failed, partial
    result_details = database.Column(database.Text)  # Detailed result information

class IrrigationZone(database.Model):
    __tablename__ = 'irrigation_zones'

    zone_id = database.Column(database.Integer, primary_key=True)
    zone_name = database.Column(database.String(100), nullable=False)
    description = database.Column(database.Text)
    area_sqm = database.Column(database.Float)  # Area in square meters
    crop_type = database.Column(database.String(100))
    soil_type = database.Column(database.String(100))
    water_requirement = database.Column(database.Float)  # liters per day
    is_active = database.Column(database.Boolean, default=True)
    created_at = database.Column(database.DateTime, default=datetime.now)
    user_id = database.Column(database.Integer, database.ForeignKey('users.user_id'), nullable=False)

    # Relationships
    schedules = database.relationship('IrrigationSchedule', backref='zone', lazy=True)
    zone_sensors = database.relationship('ZoneSensor', backref='zone', lazy=True)
    moisture_readings = database.relationship('MoistureReading', backref='zone', lazy=True)
    irrigation_rules = database.relationship('IrrigationRule', backref='zone', lazy=True)

class IrrigationSchedule(database.Model):
    __tablename__ = 'irrigation_schedules'

    schedule_id = database.Column(database.Integer, primary_key=True)
    user_id = database.Column(database.Integer, database.ForeignKey('users.user_id'), nullable=False)
    zone_id = database.Column(database.Integer, database.ForeignKey('irrigation_zones.zone_id'), nullable=False)
    name = database.Column(database.String(100), nullable=False)
    
    # Moisture-based trigger settings
    trigger_type = database.Column(database.String(20), default='moisture')  # moisture, manual, timed
    moisture_threshold = database.Column(database.Float)  # Soil moisture percentage that triggers irrigation
    minimum_interval = database.Column(database.Integer, default=3600)  # Minimum seconds between irrigations (1 hour default)
    
    # Irrigation parameters
    duration = database.Column(database.Integer, nullable=False)  # Duration in seconds when triggered
    max_daily_irrigations = database.Column(database.Integer, default=3)  # Maximum times per day
    
    is_active = database.Column(database.Boolean, default=True)
    created_at = database.Column(database.DateTime, default=datetime.now)
    last_triggered = database.Column(database.DateTime)

class MoistureReading(database.Model):
    __tablename__ = 'moisture_readings'

    reading_id = database.Column(database.Integer, primary_key=True)
    zone_id = database.Column(database.Integer, database.ForeignKey('irrigation_zones.zone_id'), nullable=False)
    sensor_id = database.Column(database.Integer, database.ForeignKey('sensors.sensor_id'), nullable=False)
    moisture_level = database.Column(database.Float, nullable=False)  # Percentage 0-100%
    temperature = database.Column(database.Float)  # Soil temperature if available
    timestamp = database.Column(database.DateTime, default=datetime.now)
    
    # Index for performance
    __table_args__ = (
        database.Index('idx_moisture_zone_time', 'zone_id', 'timestamp'),
    )

class PlantHealthReading(database.Model):
    __tablename__ = 'plant_health_readings'

    reading_id = database.Column(database.Integer, primary_key=True)
    user_id = database.Column(database.Integer, database.ForeignKey('users.user_id'), nullable=False)
    zone_id = database.Column(database.Integer, database.ForeignKey('irrigation_zones.zone_id'), nullable=True)
    predicted_class = database.Column(database.String(50), nullable=False)  # e.g. common_rust, healthy
    confidence = database.Column(database.Float, nullable=False)  # 0.0 - 1.0
    is_healthy = database.Column(database.Boolean, nullable=False, default=False)
    image_path = database.Column(database.String(255))  # relative path to the saved image, if kept
    model_version = database.Column(database.String(50))  # e.g. 'disease_v1'
    timestamp = database.Column(database.DateTime, default=datetime.now)

    # Index for performance
    __table_args__ = (
        database.Index('idx_planthealth_zone_time', 'zone_id', 'timestamp'),
    )

class IrrigationRule(database.Model):
    __tablename__ = 'irrigation_rules'

    rule_id = database.Column(database.Integer, primary_key=True)
    zone_id = database.Column(database.Integer, database.ForeignKey('irrigation_zones.zone_id'), nullable=False)
    name = database.Column(database.String(100), nullable=False)
    
    # Conditions
    condition_type = database.Column(database.String(50), nullable=False)  # moisture_below, moisture_above, etc.
    threshold_value = database.Column(database.Float, nullable=False)
    
    # Actions
    action_type = database.Column(database.String(50), nullable=False)  # start_irrigation, stop_irrigation, etc.
    action_parameters = database.Column(database.Text)  # JSON with duration, intensity, etc.
    
    is_active = database.Column(database.Boolean, default=True)
    priority = database.Column(database.Integer, default=1)  # Higher number = higher priority
    created_at = database.Column(database.DateTime, default=datetime.now)

class ZoneSensor(database.Model):
    __tablename__ = 'zone_sensors'

    zone_sensor_id = database.Column(database.Integer, primary_key=True)
    zone_id = database.Column(database.Integer, database.ForeignKey('irrigation_zones.zone_id'), nullable=False)
    sensor_id = database.Column(database.Integer, database.ForeignKey('sensors.sensor_id'), nullable=False)
    assigned_at = database.Column(database.DateTime, default=datetime.now)

class SystemSettings(database.Model):
    __tablename__ = 'system_settings'

    setting_id = database.Column(database.Integer, primary_key=True)
    setting_key = database.Column(database.String(100), nullable=False, unique=True)
    setting_value = database.Column(database.Text, nullable=False)
    data_type = database.Column(database.String(20), default='string')  # string, integer, float, boolean, json
    description = database.Column(database.Text)
    last_updated = database.Column(database.DateTime, default=datetime.now)

class NotificationLog(database.Model):
    __tablename__ = 'notification_logs'
    
    notification_id = database.Column(database.Integer, primary_key=True)
    user_id = database.Column(database.Integer, database.ForeignKey('users.user_id'), nullable=False)
    title = database.Column(database.String(255), nullable=False)
    message = database.Column(database.Text, nullable=False)
    notification_type = database.Column(database.String(50), nullable=False)  # info, warning, critical
    sent_via = database.Column(database.String(100), nullable=False)  # web,email,sms,push
    status = database.Column(database.String(50), nullable=False)  # delivered, failed
    read = database.Column(database.Boolean, default=False)
    created_at = database.Column(database.DateTime, default=datetime.now)
    
    user = database.relationship('User', backref=database.backref('notifications', lazy=True))

class WeatherData(database.Model):
    __tablename__ = 'weather_data'

    weather_id = database.Column(database.Integer, primary_key=True)
    temperature = database.Column(database.Float)
    humidity = database.Column(database.Float)
    rainfall = database.Column(database.Float)  # mm
    wind_speed = database.Column(database.Float)
    solar_radiation = database.Column(database.Float)
    timestamp = database.Column(database.DateTime, default=datetime.now)
    forecast = database.Column(database.Boolean, default=False)  # True if forecast data, False if actual
    source = database.Column(database.String(50), default='api')  # api, sensor, manual
    description = database.Column(database.String(50))

    # Index for faster queries
    __table_args__ = (
        database.Index('idx_weather_timestamp', 'timestamp'),
    )