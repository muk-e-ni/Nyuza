import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sensorAPI, irrigationAPI, recommendationAPI, systemAPI, weatherAPI } from '../../services/api';
import {
  Box,
  Typography,
  Stack,
  Button,
  CircularProgress,
  IconButton,
} from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import WaterDropRoundedIcon from '@mui/icons-material/WaterDropRounded';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import AirRoundedIcon from '@mui/icons-material/AirRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import WbCloudyRoundedIcon from '@mui/icons-material/WbCloudyRounded';
import { nyuzaColors as c } from '../../Theme';

const HomeSection = ({ currentUser, onSectionChange }) => {
  const [sensorData, setSensorData] = useState({});
  const [moistureStatus, setMoistureStatus] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [irrigationHistory, setIrrigationHistory] = useState([]);
  const [, setSystemHealth] = useState({});
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');
  const [clearedAlerts, setClearedAlerts] = useState(new Set());

  const lastRefreshRef = useRef(null);
  const lastRecommendationsCountRef = useRef(0);

  const fetchSensorData = useCallback(async () => {
    try {
      const sensorResponse = await sensorAPI.getRecentReadings();
      const sensors = sensorResponse?.data || [];
      const sensorValues = {};
      sensors.forEach(sensor => {
        if (sensor.sensor_name?.toLowerCase().includes('soil moisture')) {
          sensorValues.soilMoisture = sensor.last_value;
        } else if (sensor.sensor_name?.toLowerCase().includes('rain')) {
          sensorValues.rainSensor = sensor.last_value;
        } else if (sensor.sensor_name?.toLowerCase().includes('water level')) {
          sensorValues.waterLevel = sensor.last_value;
        }
      });
      return sensorValues;
    } catch (error) {
      console.error('Error fetching sensor data:', error);
      return {};
    }
  }, []);

  const fetchWeather = useCallback(async () => {
    try {
      const response = await weatherAPI.getWeatherDashboard();
      if (response?.data?.success) {
        return response.data.current_weather || null;
      }
    } catch (error) {
      console.error('Error fetching weather:', error);
    }
    return null;
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);

      const [recResponse, statusResponse, historyResponse, healthResponse, sensorDataResponse, weatherResponse] = await Promise.all([
        recommendationAPI.getRecommendations('pending'),
        irrigationAPI.getCurrentStatus(),
        irrigationAPI.getHistory(),
        systemAPI.getHealth(),
        fetchSensorData(),
        fetchWeather(),
      ]);

      lastRefreshRef.current = Date.now();

      let recommendationsData = [];
      if (recResponse && recResponse.data) {
        recommendationsData = Array.isArray(recResponse.data) ? recResponse.data : [];
      }
      if (recommendationsData.length !== lastRecommendationsCountRef.current) {
        setRecommendations(recommendationsData);
        lastRecommendationsCountRef.current = recommendationsData.length;
      }

      let zoneData = [];
      if (statusResponse?.data?.data && Array.isArray(statusResponse.data.data)) {
        zoneData = statusResponse.data.data;
      } else if (Array.isArray(statusResponse?.data)) {
        zoneData = statusResponse.data;
      } else if (Array.isArray(statusResponse)) {
        zoneData = statusResponse;
      }

      setMoistureStatus(zoneData);
      setSystemHealth(healthResponse?.data || healthResponse || {});
      setIrrigationHistory(historyResponse?.data || historyResponse || []);
      setSensorData(sensorDataResponse);
      setWeather(weatherResponse);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchSensorData, fetchWeather]);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => {
      const timeSinceLastRefresh = lastRefreshRef.current
        ? (Date.now() - lastRefreshRef.current) / 1000 / 60
        : 10;
      const hasCriticalAlerts = recommendations.some(
        rec => rec.priority === 'critical' || rec.priority === 'high'
      );
      if (timeSinceLastRefresh >= 2 || hasCriticalAlerts) {
        fetchDashboardData();
      }
    }, 120000);
    return () => clearInterval(interval);
  }, [fetchDashboardData, recommendations]);

  const manualRefresh = async () => {
    setActionMessage('Refreshing...');
    await fetchDashboardData();
    setActionMessage('');
  };

  const filterAndPrioritizeRecommendations = (allRecommendations) => {
    if (!Array.isArray(allRecommendations)) return [];
    const filteredRecs = allRecommendations.filter(
      rec => !clearedAlerts.has(rec.id || rec.recommendation_id)
    );
    const criticalHigh = filteredRecs.filter(rec => rec.priority === 'critical' || rec.priority === 'high');
    const medium = filteredRecs.filter(rec => rec.priority === 'medium');
    const low = filteredRecs.filter(rec => rec.priority === 'low');
    let result = [...criticalHigh];
    if (result.length < 3) result = [...result, ...medium.slice(0, 3 - result.length)];
    if (result.length < 3) result = [...result, ...low.slice(0, 3 - result.length)];
    return result.slice(0, 3);
  };

  const handleDismissAll = () => {
    const ids = recommendations.map(rec => rec.id || rec.recommendation_id);
    setClearedAlerts(prev => new Set([...prev, ...ids]));
  };

  const handleDismissAlert = async (recId) => {
    setClearedAlerts(prev => new Set(prev).add(recId));
    try {
      await recommendationAPI.dismissRecommendation(recId);
    } catch (error) {
      console.error('Error dismissing recommendation:', error);
    }
  };

  // ---- Derived stats for the summary cards ----
  const displayAlerts = filterAndPrioritizeRecommendations(recommendations);

  const zonesWithData = Array.isArray(moistureStatus) ? moistureStatus : [];
  const totalZones = zonesWithData.length;
  const activeZones = zonesWithData.filter(z => !z.needs_irrigation).length;

  const healthScore = totalZones > 0
    ? Math.round((activeZones / totalZones) * 100)
    : (sensorData.soilMoisture !== undefined ? Math.min(100, Math.round(sensorData.soilMoisture)) : null);

  const healthNote = totalZones > 0
    ? `${totalZones - activeZones} of ${totalZones} zone${totalZones === 1 ? '' : 's'} need attention.`
    : 'Zone data unavailable — check Irrigation for details.';

  const today = new Date().toDateString();
  const waterToday = Array.isArray(irrigationHistory)
    ? irrigationHistory
        .filter(log => {
          const ts = log.timestamp || log.start_time;
          return ts && new Date(ts).toDateString() === today;
        })
        .reduce((sum, log) => sum + (parseFloat(log.water_used) || 0), 0)
    : 0;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress sx={{ color: c.primaryGreen }} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Stats row */}
      <Stack direction="row" spacing={2.5} sx={{ mb: 3, flexWrap: 'wrap' }}>
        {/* Weather card */}
        <Box
          sx={{
            bgcolor: c.secondaryGreen,
            borderRadius: 4,
            p: 2.5,
            minWidth: 230,
            flex: '1 1 230px',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <Box>
            <Typography variant="caption" sx={{ color: c.textMuted, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>
              {weather?.city || 'Farm Location'}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.1, my: 0.3 }}>
              {weather ? `${Math.round(weather.temperature)}°C` : '--'}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {weather?.description || 'Weather unavailable'}
            </Typography>
          </Box>
          <Stack alignItems="flex-end" justifyContent="space-between">
            <WbCloudyRoundedIcon sx={{ fontSize: 34 }} />
            <Stack direction="row" spacing={1.5}>
              <Stack direction="row" spacing={0.4} alignItems="center">
                <WaterDropRoundedIcon sx={{ fontSize: 14 }} />
                <Typography variant="caption">{weather?.humidity ?? '--'}%</Typography>
              </Stack>
              <Stack direction="row" spacing={0.4} alignItems="center">
                <AirRoundedIcon sx={{ fontSize: 14 }} />
                <Typography variant="caption">{weather?.wind_speed ?? '--'} m/s</Typography>
              </Stack>
            </Stack>
          </Stack>
        </Box>

        {/* Health ring card */}
        <Box
          sx={{
            bgcolor: 'white',
            border: `1px solid ${c.border}`,
            borderRadius: 4,
            p: 2.5,
            minWidth: 240,
            flex: '1 1 240px',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <HealthRing value={healthScore} />
          <Box>
            <Typography variant="body1" sx={{ fontWeight: 700, color: c.textDark }}>
              Overall Farm Health
            </Typography>
            <Typography variant="body2" sx={{ color: c.textBody }}>
              {healthNote}
            </Typography>
          </Box>
        </Box>

        {/* Active zones */}
        <StatCard
          label="Active Irrigation Zones"
          value={totalZones > 0 ? activeZones : '--'}
          suffix={totalZones > 0 ? `of ${totalZones} zones active` : 'no zone data'}
          icon={<WaterDropRoundedIcon sx={{ color: c.primaryGreen }} />}
        />

        {/* Water used today */}
        <StatCard
          label="Water Consumed Today"
          value={waterToday > 0 ? waterToday.toLocaleString() : '--'}
          suffix="Liters"
          icon={<BarChartRoundedIcon sx={{ color: c.primaryGreen }} />}
        />
      </Stack>

      {/* Split: alerts + quick actions */}
      <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap' }}>
        <Box
          sx={{
            flex: '2 1 480px',
            bgcolor: 'white',
            border: `1px solid ${c.border}`,
            borderRadius: 4,
            p: 3,
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: c.textDark }}>
              Recent Alerts & Activities
            </Typography>
            {displayAlerts.length > 0 && (
              <Typography
                variant="body2"
                onClick={handleDismissAll}
                sx={{ color: c.secondaryGreen, fontWeight: 600, cursor: 'pointer' }}
              >
                Dismiss All
              </Typography>
            )}
          </Stack>

          {displayAlerts.length === 0 ? (
            <Typography variant="body2" sx={{ color: c.textMuted, py: 2 }}>
              No active alerts — everything looks steady.
            </Typography>
          ) : (
            <Stack>
              {displayAlerts.map((rec, i) => {
                const accent = rec.priority === 'critical' || rec.priority === 'high'
                  ? c.danger
                  : rec.priority === 'medium'
                  ? c.warning
                  : c.primaryGreen;
                return (
                  <Stack
                    key={rec.id || rec.recommendation_id}
                    direction="row"
                    spacing={1.5}
                    sx={{
                      py: 1.5,
                      borderBottom: i < displayAlerts.length - 1 ? `1px solid ${c.border}` : 'none',
                    }}
                  >
                    <Box sx={{ width: 4, borderRadius: 1, bgcolor: accent, alignSelf: 'stretch', minHeight: 36 }} />
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" sx={{ fontWeight: 700, color: c.textDark }}>
                          {rec.title}
                        </Typography>
                        <Typography variant="caption" sx={{ color: c.textMuted }}>
                          {rec.created_at ? new Date(rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ color: c.textBody }}>
                        {rec.description}
                      </Typography>
                    </Box>
                    <IconButton size="small" onClick={() => handleDismissAlert(rec.id || rec.recommendation_id)}>
                      <Typography sx={{ color: c.textMuted, fontSize: 16, lineHeight: 1 }}>×</Typography>
                    </IconButton>
                  </Stack>
                );
              })}
            </Stack>
          )}
        </Box>

        <Box
          sx={{
            flex: '1 1 320px',
            bgcolor: 'white',
            border: `1px solid ${c.border}`,
            borderRadius: 4,
            p: 3,
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: c.textDark }}>
              Quick Operations
            </Typography>
            <IconButton size="small" onClick={manualRefresh} title="Refresh data">
              <RefreshRoundedIcon fontSize="small" sx={{ color: c.textBody }} />
            </IconButton>
          </Stack>
          <Stack spacing={1.5}>
            <QuickAction
              variant="dark"
              icon={<PlayArrowRoundedIcon />}
              title="Go to Irrigation"
              subtitle="Review zones & trigger a cycle"
              onClick={() => onSectionChange?.('irrigation')}
            />
            <QuickAction
              variant="muted"
              icon={<MemoryRoundedIcon />}
              title="Check System Status"
              subtitle="Sensor & node diagnostics"
              onClick={() => onSectionChange?.('status')}
            />
            <QuickAction
              variant="outline"
              icon={<DescriptionRoundedIcon />}
              title="View Reports"
              subtitle="Water & resource summaries"
              onClick={() => onSectionChange?.('reports')}
            />
          </Stack>
          {actionMessage && (
            <Typography variant="caption" sx={{ color: c.textMuted, mt: 1, display: 'block' }}>
              {actionMessage}
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );
};

const HealthRing = ({ value }) => {
  const pct = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : 0;
  const size = 72;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (pct / 100) * circumference;

  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={c.border} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.primaryGreen}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ fontWeight: 800, color: c.textDark, fontSize: 18 }}>
          {typeof value === 'number' ? `${value}%` : '--'}
        </Typography>
      </Box>
    </Box>
  );
};

const StatCard = ({ label, value, suffix, icon }) => (
  <Box
    sx={{
      bgcolor: 'white',
      border: `1px solid ${c.border}`,
      borderRadius: 4,
      p: 2.5,
      minWidth: 200,
      flex: '1 1 200px',
    }}
  >
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, color: c.textBody }}>
        {label}
      </Typography>
      {icon}
    </Stack>
    <Stack direction="row" spacing={1} alignItems="baseline">
      <Typography variant="h4" sx={{ fontWeight: 800, color: c.textDark }}>
        {value}
      </Typography>
      <Typography variant="body2" sx={{ color: c.textBody }}>
        {suffix}
      </Typography>
    </Stack>
  </Box>
);

const QuickAction = ({ variant, icon, title, subtitle, onClick }) => {
  const styles = {
    dark: { bgcolor: c.sidebarActive, color: 'white', subColor: c.textMuted, border: 'none' },
    muted: { bgcolor: c.chipGreenBg, color: c.textDark, subColor: c.textBody, border: 'none' },
    outline: { bgcolor: 'white', color: c.textDark, subColor: c.textBody, border: `1px solid ${c.border}` },
  }[variant];

  return (
    <Button
      onClick={onClick}
      sx={{
        bgcolor: styles.bgcolor,
        border: styles.border,
        borderRadius: 3,
        p: 2,
        justifyContent: 'flex-start',
        textAlign: 'left',
        gap: 2,
        '&:hover': { bgcolor: styles.bgcolor, opacity: 0.9 },
      }}
      fullWidth
    >
      <Box sx={{ color: styles.color, display: 'flex' }}>{icon}</Box>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, color: styles.color }}>
          {title}
        </Typography>
        <Typography variant="caption" sx={{ color: styles.subColor }}>
          {subtitle}
        </Typography>
      </Box>
    </Button>
  );
};

export default HomeSection;
