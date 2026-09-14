import requests 
import os
from datetime import datetime, timedelta
from models import WeatherData, database
import json
from dotenv import load_dotenv
load_dotenv()  # Load environment variables from .env file

# How long a cached weather/forecast response is served before a fresh call
# is made automatically. Manual refresh (force_refresh=True) always bypasses this.
CURRENT_WEATHER_TTL_SECONDS = 600   # 10 minutes — plenty for a farm dashboard
FORECAST_TTL_SECONDS = 1800         # 30 minutes — forecasts change slowly


class WeatherService:
    def __init__(self):
        self.api_key = os.getenv('OPENWEATHER_API_KEY', '')
        self.base_url = "http://api.openweathermap.org/data/2.5"
        print(f"🌤️ Weather Service initialized with API key: {self.api_key}")
        # One farm, one location today — a single cache slot is enough. If
        # multi-location support is added later, key these by (lat, lng, city).
        self._current_cache = None
        self._current_cache_time = None
        self._forecast_cache = None
        self._forecast_cache_time = None

    def _cache_fresh(self, cache_time, ttl_seconds):
        return cache_time is not None and (datetime.now() - cache_time) < timedelta(seconds=ttl_seconds)

    def get_current_weather(self, lat=None, lng=None, city=None, force_refresh=False):
        """Get current weather data with better error handling.
        Cached for CURRENT_WEATHER_TTL_SECONDS — pass force_refresh=True to
        bypass the cache (e.g. a user-triggered refresh button)."""
        if not force_refresh and self._cache_fresh(self._current_cache_time, CURRENT_WEATHER_TTL_SECONDS):
            return self._current_cache

        try:
            print("🌤️ Fetching weather data...")
            
            # Use Nairobi as default
            lat = lat or -1.286389
            lng = lng or 36.817223
            
            url = f"{self.base_url}/weather?lat={lat}&lon={lng}&appid={self.api_key}&units=metric"
            print(f"🌤️ Weather API URL: {url}")
            
            response = requests.get(url, timeout=10)
            print(f"🌤️ Weather API response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"🌤️ Weather data received: {data.get('name', 'Unknown')}")
                
                # Extract weather data
                weather_info = {
                    'success': True,
                    'temperature': data['main']['temp'],
                    'humidity': data['main']['humidity'],
                    'rainfall': data.get('rain', {}).get('1h', 0),
                    'wind_speed': data['wind']['speed'],
                    'description': data['weather'][0]['description'],
                    'city': data['name'],
                    'source': 'openweather'
                }
                
                # Save to database
                try:
                    weather_data = WeatherData(
                        temperature=weather_info['temperature'],
                        humidity=weather_info['humidity'],
                        rainfall=weather_info['rainfall'],
                        wind_speed=weather_info['wind_speed'],
                        description=weather_info['description'],
                        timestamp=datetime.now(),
                        forecast=False,
                        source='openweather'
                    )
                    database.session.add(weather_data)
                    database.session.commit()
                    print("✅ Weather data saved to database")
                except Exception as db_error:
                    print(f"❌ Error saving weather data: {db_error}")
                    database.session.rollback()
                
                self._current_cache = weather_info
                self._current_cache_time = datetime.now()
                return weather_info
            else:
                error_msg = f"Weather API error: {response.status_code}"
                print(f"❌ {error_msg}")
                return {'success': False, 'error': error_msg, 'source': 'api_error'}
                
        except Exception as e:
            error_msg = f"Weather service error: {str(e)}"
            print(f"❌ {error_msg}")
            return {'success': False, 'error': error_msg, 'source': 'exception'}
    
    def should_irrigate_based_on_weather(self, zone_data, weather_data):
        """AI decision: Should we irrigate based on weather?"""
        print(f"🌦️ Weather decision - Data: {weather_data.get('success', False)}")
        
        if not weather_data.get('success', False):
            print("🌦️ No weather data, defaulting to True")
            return True  # Default to irrigation if weather data unavailable
        
        try:
            # Factors to consider
            recent_rain = weather_data.get('rainfall', 0) > 2  # More than 2mm rain recently
            high_humidity = weather_data.get('humidity', 0) > 80
            cool_temperature = weather_data.get('temperature', 25) < 15
            rain_forecast = self.check_rain_forecast()
            
            print(f"🌦️ Weather factors - Rain: {recent_rain}, Humidity: {high_humidity}, Cool: {cool_temperature}, Forecast: {rain_forecast}")
            
            # If it recently rained or will rain soon, skip irrigation
            if recent_rain or rain_forecast:
                print("🌦️ Recent rain or forecast - skipping irrigation")
                return False
            
            # If high humidity and cool, reduce irrigation need
            if high_humidity and cool_temperature:
                threshold = zone_data.get('moisture_threshold', 35) - 10
                decision = zone_data.get('current_moisture', 50) < threshold
                print(f"🌦️ High humidity & cool - decision: {decision}")
                return decision
            
            # Hot and dry conditions - irrigate more aggressively
            if weather_data.get('temperature', 25) > 30 and weather_data.get('humidity', 60) < 40:
                threshold = zone_data.get('moisture_threshold', 35) + 10
                decision = zone_data.get('current_moisture', 50) < threshold
                print(f"🌦️ Hot & dry - decision: {decision}")
                return decision
            
            # Normal conditions
            threshold = zone_data.get('moisture_threshold', 35)
            decision = zone_data.get('current_moisture', 50) < threshold
            print(f"🌦️ Normal conditions - decision: {decision}")
            return decision
            
        except Exception as e:
            print(f"❌ Weather decision error: {e}")
            return True
    
    def check_rain_forecast(self):
        """Check if rain is forecasted in the next 24 hours"""
        try:
            forecast = self.get_forecast()
            if forecast.get('success', False):
                for day in forecast.get('forecasts', []):
                    if 'rain' in day.get('description', '').lower() or day.get('rainfall', 0) > 1:
                        return True
            return False
        except:
            return False

    def get_forecast(self, force_refresh=False):
        """Get weather forecast - simplified version.
        Cached for FORECAST_TTL_SECONDS; pass force_refresh=True to bypass."""
        if not force_refresh and self._cache_fresh(self._forecast_cache_time, FORECAST_TTL_SECONDS):
            return self._forecast_cache
        try:
            lat = -1.286389
            lng = 36.817223
            url = f"{self.base_url}/forecast?lat={lat}&lon={lng}&appid={self.api_key}&units=metric"
            
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                forecasts = []
                for item in data['list'][:8]:  # Next 24 hours
                    forecasts.append({
                        'datetime': datetime.fromtimestamp(item['dt']).isoformat(),
                        'temperature': item['main']['temp'],
                        'humidity': item['main']['humidity'],
                        'rainfall': item.get('rain', {}).get('3h', 0),
                        'description': item['weather'][0]['description']
                    })
                result = {'success': True, 'forecasts': forecasts}
                self._forecast_cache = result
                self._forecast_cache_time = datetime.now()
                return result
            return {'success': False, 'error': 'Forecast unavailable'}
        except Exception as e:
            return {'success': False, 'error': str(e)}

# Global instance
weather_service = WeatherService()