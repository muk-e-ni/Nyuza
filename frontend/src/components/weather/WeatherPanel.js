import React, { useState, useEffect } from 'react';
import { weatherAPI } from '../../services/api';
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Box,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Button,
  Divider
} from '@mui/material';
import {
  WbSunny,
  Opacity,
  Air,
  WaterDrop,
  Thermostat,
  Refresh,
  TrendingUp,
  TrendingDown
} from '@mui/icons-material';

const WeatherPanel = () => {
  const [weatherData, setWeatherData] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [weatherTrends, setWeatherTrends] = useState(null);
  const [irrigationImpact, setIrrigationImpact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchWeatherData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await weatherAPI.getWeatherDashboard();
      console.log('Weather Dashboard Response:', response);

      if (response.data.success) {
        setWeatherData(response.data.current_weather);
        setForecastData(response.data.forecast);
        setWeatherTrends(response.data.weather_trends);
        setIrrigationImpact(response.data.irrigation_impact);
      } else {
        setError(response.data.error || 'Failed to load weather data');
      }
    } catch (err) {
      console.error('Weather fetch error:', err);
      setError('Failed to fetch weather data');
      
      // Fallback: try basic weather endpoint
      try {
        const basicResponse = await weatherAPI.getCurrentWeather();
        if (basicResponse.data.success) {
          setWeatherData(basicResponse.data);
        }
      } catch (fallbackError) {
        console.error('Fallback weather also failed:', fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeatherData();
    // Refresh weather every 30 minutes
    const interval = setInterval(fetchWeatherData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getWeatherIcon = (description) => {
    const desc = description?.toLowerCase() || '';
    if (desc.includes('rain') || desc.includes('drizzle')) return '🌧️';
    if (desc.includes('cloud')) return '☁️';
    if (desc.includes('clear') || desc.includes('sunny')) return '☀️';
    if (desc.includes('snow')) return '❄️';
    if (desc.includes('storm')) return '⛈️';
    if (desc.includes('fog') || desc.includes('mist')) return '🌫️';
    return '🌈';
  };

  const getWeatherColor = (description) => {
    const desc = description?.toLowerCase() || '';
    if (desc.includes('rain')) return '#4FC3F7'; // Blue for rain
    if (desc.includes('clear') || desc.includes('sunny')) return '#FFD54F'; // Yellow for sunny
    if (desc.includes('cloud')) return '#90A4AE'; // Gray for cloudy
    return '#78909C'; // Default
  };

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'warming':
      case 'increasing':
        return <TrendingUp color="error" />;
      case 'cooling':
      case 'decreasing':
        return <TrendingDown color="primary" />;
      default:
        return null;
    }
  };

  const getTrendColor = (trend) => {
    switch (trend) {
      case 'warming':
      case 'increasing':
        return 'error';
      case 'cooling':
      case 'decreasing':
        return 'primary';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 3 }}>
            <CircularProgress size={24} />
            <Typography variant="body2" sx={{ ml: 2 }}>
              Loading weather data...
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert 
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={fetchWeatherData}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!weatherData) {
    return (
      <Card>
        <CardContent>
          <Alert severity="info">
            Weather data not available
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WbSunny />
            <Typography variant="h6">Current Weather</Typography>
            {weatherData.city && (
              <Chip 
                label={weatherData.city} 
                size="small" 
                variant="outlined"
              />
            )}
          </Box>
        }
        action={
          <Button 
            startIcon={<Refresh />} 
            onClick={fetchWeatherData}
            size="small"
            variant="outlined"
          >
            Refresh
          </Button>
        }
      />
      
      <CardContent>
        {/* Current Weather Overview */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Typography variant="h3" sx={{ mb: 1 }}>
            {getWeatherIcon(weatherData.description)}{' '}
            {Math.round(weatherData.temperature)}°C
          </Typography>
          <Typography 
            variant="h6" 
            sx={{ 
              color: getWeatherColor(weatherData.description),
              textTransform: 'capitalize',
              mb: 2
            }}
          >
            {weatherData.description}
          </Typography>
        </Box>

        {/* Weather Trends */}
        {weatherTrends && weatherTrends.temperature_trend !== 'insufficient_data' && (
          <Box sx={{ mb: 2, p: 1, bgcolor: 'background.default', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Weather Trends
            </Typography>
            <Grid container spacing={1}>
              {weatherTrends.temperature_trend && (
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {getTrendIcon(weatherTrends.temperature_trend)}
                    <Typography variant="body2">
                      Temp: {weatherTrends.temperature_trend}
                    </Typography>
                  </Box>
                </Grid>
              )}
              {weatherTrends.humidity_trend && weatherTrends.humidity_trend !== 'unknown' && (
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {getTrendIcon(weatherTrends.humidity_trend)}
                    <Typography variant="body2">
                      Humidity: {weatherTrends.humidity_trend}
                    </Typography>
                  </Box>
                </Grid>
              )}
            </Grid>
          </Box>
        )}

        {/* Weather Details Grid */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Thermostat color="primary" />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Temperature
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {Math.round(weatherData.temperature)}°C
                </Typography>
              </Box>
            </Box>
          </Grid>
          
          <Grid item xs={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Opacity color="primary" />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Humidity
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {weatherData.humidity}%
                </Typography>
              </Box>
            </Box>
          </Grid>
          
          <Grid item xs={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <WaterDrop color="primary" />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Rainfall
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {weatherData.rainfall || 0}mm
                </Typography>
              </Box>
            </Box>
          </Grid>
          
          <Grid item xs={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Air color="primary" />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Wind Speed
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {weatherData.wind_speed} m/s
                </Typography>
              </Box>
            </Box>
          </Grid>
        </Grid>

        {/* Weather Impact on Irrigation */}
        <Box sx={{ 
          p: 2, 
          bgcolor: 'background.default', 
          borderRadius: 1,
          border: 1,
          borderColor: 'divider'
        }}>
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            🌱 Irrigation Impact
          </Typography>
          {getWeatherImpact(weatherData, irrigationImpact)}
        </Box>

        {/* Forecast Section */}
        {forecastData && forecastData.forecasts && forecastData.forecasts.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" gutterBottom>
              24-Hour Forecast
            </Typography>
            <Grid container spacing={1}>
              {forecastData.forecasts.slice(0, 4).map((forecast, index) => (
                <Grid item xs={6} sm={3} key={index}>
                  <Box sx={{ textAlign: 'center', p: 1 }}>
                    <Typography variant="caption" display="block">
                      {new Date(forecast.datetime).toLocaleTimeString('en-US', { 
                        hour: 'numeric',
                        hour12: true 
                      })}
                    </Typography>
                    <Typography variant="h6">
                      {getWeatherIcon(forecast.description)}
                    </Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {Math.round(forecast.temperature)}°C
                    </Typography>
                    {forecast.rainfall > 0 && (
                      <Typography variant="caption" color="primary">
                        {forecast.rainfall}mm
                      </Typography>
                    )}
                  </Box>
                </Grid>
              ))}
            </Grid>
          </>
        )}
      </CardContent>
    </Card>
  );
};

// Helper function to generate weather impact message
const getWeatherImpact = (weather, irrigationImpact) => {
  // Use the irrigation impact from backend if available
  if (irrigationImpact) {
    switch (irrigationImpact) {
      case 'reduce_heavy':
        return "Heavy rainfall detected. Skip irrigation for 24-48 hours.";
      case 'reduce_medium':
        return "Moderate rainfall. Reduce irrigation by 50-70% today.";
      case 'reduce_light':
        return "Light rainfall. Consider reducing irrigation by 20-30%.";
      case 'increase_heavy':
        return "Hot and dry conditions. Plants may need extra water.";
      case 'increase_light':
        return "Warm and dry conditions. Consider slight increase in watering.";
      case 'pause_consider':
        return "Cool temperatures. Consider pausing irrigation.";
      case 'reduce_frequency':
        return "High humidity. Reduced evaporation allows less frequent watering.";
      case 'normal':
        return "Ideal conditions for irrigation. Continue normal schedule.";
      default:
        // Fallback to calculated impact
        break;
    }
  }

  // Fallback calculation if no irrigation impact provided
  const temp = weather.temperature;
  const rain = weather.rainfall || 0;
  const humidity = weather.humidity;

  if (rain > 10) {
    return "Heavy rainfall detected. Skip irrigation for today.";
  } else if (rain > 5) {
    return "Moderate rainfall. Consider reducing irrigation duration by 50%.";
  } else if (rain > 2) {
    return "Light rainfall. You may reduce irrigation slightly.";
  } else if (temp > 30 && humidity < 40) {
    return "Hot and dry conditions. Plants may need extra water.";
  } else if (temp > 25) {
    return "Warm weather. Normal irrigation recommended.";
  } else if (temp < 10) {
    return "Cool temperatures. Reduce irrigation to prevent overwatering.";
  } else if (humidity > 80) {
    return "High humidity. Reduced evaporation allows less frequent watering.";
  } else {
    return "Ideal conditions for irrigation. Continue normal schedule.";
  }
};

export default WeatherPanel;