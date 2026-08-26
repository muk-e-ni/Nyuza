import requests
from services.weather_service import weather_service
from services.ai_recommendation_engine import ai_recommendation_engine

from services.ml_engine import ml_engine
from models import WeatherData, SensorReadings, IrrigationZone, User
from config import database
from datetime import datetime, timedelta
import jwt
import os 
from flask import Blueprint, jsonify, request
from functools import wraps
from dotenv import load_dotenv


weather_bp = Blueprint('weather', __name__)
load_dotenv()
JWT_SECRET_KEY = os.getenv('SECRET_KEY', '')
JWT_ALGORITHM = 'HS256'

def jwt_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '): 
            token = auth_header.split(' ')[1]

        if not token:
            return jsonify({'success': False, 'error': 'Token is missing'}), 401
        
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            request.user_id = payload.get('user_id')
            request.user_role = payload.get('role')

            print(f"JWT DEBUG - User ID: {request.user_id}, Role: {request.user_role}")

        except jwt.ExpiredSignatureError:
            return jsonify({'success': False, 'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'success': False, 'error': 'Invalid token'}), 401
        except Exception as e:
            return jsonify({'success': False, 'error': 'Token verification failed'}), 401

        return f(*args, **kwargs)      
    return decorated


@weather_bp.route('/api/weather/current', methods=['GET'])
@jwt_required
def get_current_weather():
    """Get current weather data"""
    try:
        lat = request.args.get('lat', type=float)
        lng = request.args.get('lng', type=float)
        city = request.args.get('city')
        
        weather_data = weather_service.get_current_weather(lat, lng, city)
        return jsonify(weather_data)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@weather_bp.route('/api/weather/forecast', methods=['GET'])
@jwt_required
def get_weather_forecast():
    """Get weather forecast"""
    try:
        lat = request.args.get('lat', type=float)
        lng = request.args.get('lng', type=float)
        city = request.args.get('city')
        
        forecast = weather_service.get_forecast(lat, lng, city)
        return jsonify(forecast)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@weather_bp.route('/api/weather/dashboard', methods=['GET'])
@jwt_required
def get_weather_dashboard():
    """Get comprehensive weather data for dashboard"""
    try:
        user_id = request.user_id
        
        # Get current weather
        current_weather = weather_service.get_current_weather()
        
        # Get forecast
        forecast = weather_service.get_forecast()
        
        # Get recent weather history (last 24 hours)
        twenty_four_hours_ago = datetime.now() - timedelta(hours=24)
        recent_weather = WeatherData.query.filter(
            WeatherData.timestamp >= twenty_four_hours_ago,
            WeatherData.forecast == False
        ).order_by(WeatherData.timestamp.desc()).limit(12).all()
        
        # Calculate weather trends
        weather_trends = calculate_weather_trends(recent_weather)
        
        # Get AI-powered weather insights
        ai_insights = ai_recommendation_engine.generate_weather_insights(
            current_weather, 
            forecast, 
            user_id
        )
        
        return jsonify({
            'success': True,
            'current_weather': current_weather,
            'forecast': forecast,
            'weather_trends': weather_trends,
            'ai_insights': ai_insights,
            'irrigation_recommendations': ai_insights.get('recommendations', []),
            'last_updated': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@weather_bp.route('/api/weather/history', methods=['GET'])
@jwt_required
def get_weather_history():
    """Get historical weather data"""
    try:
        days = request.args.get('days', 7, type=int)
        start_date = datetime.now() - timedelta(days=days)
        
        weather_history = WeatherData.query.filter(
            WeatherData.timestamp >= start_date,
            WeatherData.forecast == False
        ).order_by(WeatherData.timestamp.asc()).all()
        
        history_data = []
        for weather in weather_history:
            history_data.append({
                'timestamp': weather.timestamp.isoformat(),
                'temperature': weather.temperature,
                'humidity': weather.humidity,
                'rainfall': weather.rainfall or 0,
                'wind_speed': weather.wind_speed,
                'description': weather.description
            })
        
        return jsonify({
            'success': True,
            'days': days,
            'data': history_data,
            'summary': calculate_weather_summary(weather_history)
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@weather_bp.route('/api/weather/irrigation-advice', methods=['GET'])
@jwt_required
def get_irrigation_advice():
    """Get AI-powered weather-based irrigation advice"""
    try:
        user_id = request.user_id
        zone_id = request.args.get('zone_id', type=int)
        
        # Use AI engine for intelligent irrigation advice
        ai_advice = ai_recommendation_engine.generate_intelligent_recommendations(
            user_id, 
            zone_id
        )
        
        # Get current weather for context
        current_weather = weather_service.get_current_weather()
        
        return jsonify({
            'success': True,
            'advice': ai_advice.get('recommendations', []),
            'ai_insights': ai_advice.get('ai_insights', ''),
            'weather_data': current_weather,
            'zone_data': ai_advice.get('zone_data', {}),
            'confidence_score': ai_advice.get('confidence_score', 0.85),
            'generated_at': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@weather_bp.route('/api/weather/ai-analysis', methods=['GET'])
@jwt_required
def get_ai_weather_analysis():
    """Get comprehensive AI analysis combining weather and irrigation data"""
    try:
        user_id = request.user_id
        days = request.args.get('days', 7, type=int)
        
        # Get AI-powered comprehensive analysis
        analysis = ai_recommendation_engine.generate_comprehensive_report(user_id, days)
        
        # Enhance with current weather data
        current_weather = weather_service.get_current_weather()
        forecast = weather_service.get_forecast()
        
        analysis['current_weather'] = current_weather
        analysis['weather_forecast'] = forecast
        
        return jsonify(analysis)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@weather_bp.route('/api/weather/predictive-schedule', methods=['GET'])
@jwt_required
def get_predictive_schedule():
    """Get AI-predicted irrigation schedule based on weather forecast"""
    try:
        user_id = request.user_id
        zone_id = request.args.get('zone_id', type=int)
        
        # Get weather forecast
        forecast = weather_service.get_forecast()
        
        # Generate predictive schedule using AI
        predictive_data = ai_recommendation_engine.generate_predictive_schedule(
            user_id, 
            zone_id, 
            forecast
        )
        
        return jsonify({
            'success': True,
            'predictive_schedule': predictive_data,
            'forecast_days': len(forecast.get('forecast', [])),
            'generated_at': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@weather_bp.route('/api/weather/test-connection', methods=['GET'])
def test_weather_connection():
    """Test weather service connection"""
    try:
        # Test current weather
        current_weather = weather_service.get_current_weather()
        
        # Test forecast
        forecast = weather_service.get_forecast()
        
        current_has_data = (
            current_weather and 
            current_weather.get('success') and 
            current_weather.get('temperature') is not None
        )
        
        forecast_has_data = (
            forecast and 
            forecast.get('success') and 
            forecast.get('forecast') is not None
        )
        
        # Consider it online if either endpoint works or if we get any valid data
        is_online = (current_has_data or 
            forecast_has_data or
            current_weather.get('temperature') is not None or
            forecast.get('forecast') is not None
        )
        
        return jsonify({
            'success': True,
            'online': is_online,
            'current_weather_status': 'success' if current_weather else 'failed',
            'forecast_status': 'success' if forecast_has_data else 'failed',
            'has_api_key': bool(weather_service.api_key),
            'current_weather_available': current_weather.get('temperature') is not None,
            'forecast_available': forecast.get('forecast') is not None,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            'success': False, 
            'online': False,
            'error': str(e)
        }), 500

def calculate_weather_trends(recent_weather):
    """Calculate weather trends from recent data"""
    if not recent_weather:
        return {'trend': 'stable', 'change': 0}
    
    temps = [w.temperature for w in recent_weather if w.temperature]
    humidities = [w.humidity for w in recent_weather if w.humidity]
    
    if len(temps) < 2:
        return {'temperature_trend': 'insufficient_data', 'humidity_trend': 'insufficient_data'}
    
    # Calculate temperature trend
    temp_change = temps[0] - temps[-1]
    
    if temp_change > 2:
        temp_trend = 'warming'
    elif temp_change < -2:
        temp_trend = 'cooling'
    else:
        temp_trend = 'stable'
    
    # Calculate humidity trend
    if len(humidities) >= 2:
        humidity_change = humidities[0] - humidities[-1]
        if humidity_change > 10:
            humidity_trend = 'increasing'
        elif humidity_change < -10:
            humidity_trend = 'decreasing'
        else:
            humidity_trend = 'stable'
    else:
        humidity_trend = 'unknown'
    
    return {
        'temperature_trend': temp_trend,
        'temperature_change': round(temp_change, 1),
        'humidity_trend': humidity_trend,
        'current_temp': round(temps[0], 1) if temps else None,
        'current_humidity': round(humidities[0], 1) if humidities else None
    }

def calculate_weather_summary(weather_history):
    """Calculate summary statistics from weather history"""
    if not weather_history:
        return {}
    
    temps = [w.temperature for w in weather_history if w.temperature is not None]
    humidities = [w.humidity for w in weather_history if w.humidity is not None]
    rainfalls = [w.rainfall or 0 for w in weather_history]
    
    return {
        'average_temperature': round(sum(temps) / len(temps), 1) if temps else None,
        'average_humidity': round(sum(humidities) / len(humidities), 1) if humidities else None,
        'total_rainfall': round(sum(rainfalls), 1),
        'max_temperature': round(max(temps), 1) if temps else None,
        'min_temperature': round(min(temps), 1) if temps else None
    }

def generate_irrigation_advice(current_weather, zone_data):
    """Generate basic irrigation advice based on weather (fallback)"""
    advice = []
    
    if current_weather.get('rainfall', 0) > 5:
        advice.append({
            'type': 'rain_delay',
            'priority': 'high',
            'message': 'Rain detected - consider delaying irrigation',
            'duration_hours': 24
        })
    
    if current_weather.get('temperature', 20) > 30:
        advice.append({
            'type': 'heat_advisory',
            'priority': 'medium',
            'message': 'High temperatures - ensure adequate moisture levels',
            'adjustment': 'Increase monitoring frequency'
        })
    
    if current_weather.get('humidity', 50) > 80:
        advice.append({
            'type': 'humidity_advisory',
            'priority': 'low',
            'message': 'High humidity - reduced evaporation expected',
            'adjustment': 'Consider reducing water amounts'
        })
    
    return advice