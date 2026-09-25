import React, { useState, useEffect, useCallback } from 'react';
import { sensorAPI, irrigationAPI, systemAPI, weatherAPI } from '../../services/api';
import { Box, Typography, Stack, Chip, Button, CircularProgress } from '@mui/material';
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';
import { nyuzaColors as c } from '../../Theme';

const StatusSection = () => {
  const [systemStatus, setSystemStatus] = useState({});
  const [sensorStatus, setSensorStatus] = useState([]);
  const [zoneStatus, setZoneStatus] = useState([]);
  const [loading, setLoading] = useState(true);

  const checkSystemHealth = useCallback(async () => {
    try {
      const healthResponse = await systemAPI.getHealth();
      return healthResponse?.data || healthResponse || {};
    } catch (error) {
      return { status: 'offline', error: error.message };
    }
  }, []);

  const checkWeatherAPI = useCallback(async () => {
    try {
      const weatherResponse = await weatherAPI.testWeatherConnection();
      const weatherData = weatherResponse?.data || {};
      const isOnline = (
        weatherData.online === true ||
        weatherData.success === true ||
        weatherData.current_weather_available === true ||
        weatherData.current_weather_status === 'success'
      );
      return {
        status: isOnline ? 'online' : 'offline',
        last_checked: new Date().toISOString(),
        details: weatherData,
      };
    } catch (error) {
      return { status: 'offline', last_checked: new Date().toISOString(), error: error.message };
    }
  }, []);

  const checkDatabaseStatus = useCallback(async () => {
    try {
      const zonesResponse = await irrigationAPI.getCurrentStatus();
      let recordCount = 0;
      let hasData = false;
      if (zonesResponse?.data?.data && Array.isArray(zonesResponse.data.data)) {
        recordCount = zonesResponse.data.data.length;
        hasData = recordCount > 0;
      } else if (Array.isArray(zonesResponse?.data)) {
        recordCount = zonesResponse.data.length;
        hasData = recordCount > 0;
      }
      return { status: hasData ? 'online' : 'warning', record_count: recordCount, raw_data: zonesResponse };
    } catch (error) {
      return { status: 'offline', error: error.message };
    }
  }, []);

  const checkIrrigationSystem = useCallback(async () => {
    try {
      const statusResponse = await irrigationAPI.getCurrentStatus();
      let irrigationData = [];
      let activeZones = 0;
      let hasZones = false;
      if (statusResponse?.data?.data && Array.isArray(statusResponse.data.data)) {
        irrigationData = statusResponse.data.data;
      } else if (Array.isArray(statusResponse?.data)) {
        irrigationData = statusResponse.data;
      } else if (Array.isArray(statusResponse)) {
        irrigationData = statusResponse;
      }
      activeZones = irrigationData.length;
      hasZones = irrigationData.length > 0;
      return { status: hasZones ? 'ready' : 'warning', active_zones: activeZones, raw_data: irrigationData };
    } catch (error) {
      return { status: 'offline', error: error.message };
    }
  }, []);

  const fetchSensorData = useCallback(async () => {
    try {
      const sensorsResponse = await sensorAPI.getRecentReadings();
      if (Array.isArray(sensorsResponse?.data)) return sensorsResponse.data;
      if (Array.isArray(sensorsResponse)) return sensorsResponse;
      return [];
    } catch (error) {
      return [];
    }
  }, []);

  const fetchZoneData = useCallback(async () => {
    try {
      const zonesResponse = await irrigationAPI.getCurrentStatus();
      if (zonesResponse?.data?.data && Array.isArray(zonesResponse.data.data)) return zonesResponse.data.data;
      if (Array.isArray(zonesResponse?.data)) return zonesResponse.data;
      if (Array.isArray(zonesResponse)) return zonesResponse;
      return [];
    } catch (error) {
      return [];
    }
  }, []);

  const fetchStatusData = useCallback(async () => {
    try {
      setLoading(true);
      const [sensorsData, zonesData, systemHealth, weatherStatus, dbStatus, irrigationStatus] = await Promise.all([
        fetchSensorData(),
        fetchZoneData(),
        checkSystemHealth(),
        checkWeatherAPI(),
        checkDatabaseStatus(),
        checkIrrigationSystem(),
      ]);

      setSensorStatus(sensorsData);
      setZoneStatus(zonesData);
      setSystemStatus({
        controller: systemHealth.status === 'offline' ? 'offline' : 'online',
        database: dbStatus.status,
        weather_api: weatherStatus.status,
        irrigation_system: irrigationStatus.status,
        last_checked: new Date().toLocaleTimeString(),
        details: {
          database_records: dbStatus.record_count || 0,
          active_zones: irrigationStatus.active_zones || 0,
          weather_last_checked: weatherStatus.last_checked,
          sensor_count: Array.isArray(sensorsData) ? sensorsData.length : 0,
          zone_count: Array.isArray(zonesData) ? zonesData.length : 0,
        },
      });
    } catch (error) {
      console.error('Error fetching status data:', error);
      setSensorStatus([]);
      setZoneStatus([]);
      setSystemStatus({
        controller: 'offline',
        database: 'offline',
        weather_api: 'offline',
        irrigation_system: 'offline',
        last_checked: new Date().toLocaleTimeString(),
        error: 'Failed to fetch system status',
      });
    } finally {
      setLoading(false);
    }
  }, [fetchSensorData, fetchZoneData, checkSystemHealth, checkWeatherAPI, checkDatabaseStatus, checkIrrigationSystem]);

  useEffect(() => {
    fetchStatusData();
    const interval = setInterval(fetchStatusData, 15000);
    return () => clearInterval(interval);
  }, [fetchStatusData]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress sx={{ color: c.primaryGreen }} />
      </Box>
    );
  }

  const activeSensors = sensorStatus.filter(s => (s.status || 'active') === 'active').length;
  const inactiveSensors = sensorStatus.filter(s => (s.status || 'active') !== 'active');
  const totalSensors = sensorStatus.length;
  const sensorPct = totalSensors > 0 ? Math.round((activeSensors / totalSensors) * 100) : 0;

  const activeZones = zoneStatus.filter(z => {
    const moisture = z.current_moisture ?? z.moisture_level ?? z.moisture;
    const threshold = z.moisture_threshold ?? z.threshold ?? 40;
    const needs = z.needs_irrigation !== undefined ? z.needs_irrigation : moisture < threshold;
    return !needs;
  }).length;

  const statusMap = {
    online: { label: 'Online', bg: c.chipGreenBg, fg: c.primaryGreen },
    ready: { label: 'Ready', bg: c.chipGreenBg, fg: c.primaryGreen },
    warning: { label: 'Warning', bg: c.warningBg, fg: c.warning },
    offline: { label: 'Offline', bg: c.dangerBg, fg: c.danger },
  };

  return (
    <Box>
      {/* Summary bar */}
      <Box sx={{ bgcolor: c.secondaryGreen, borderRadius: 4, p: 2.5, mb: 3, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        <SummaryItem label="Sensor Network" value={totalSensors > 0 ? `${activeSensors} / ${totalSensors} Active` : 'No data'} />
        <SummaryItem label="Ground Zones" value={zoneStatus.length > 0 ? `${activeZones} / ${zoneStatus.length} Active` : 'No data'} />
        <SummaryItem
          label="Controller"
          value={statusMap[systemStatus.controller]?.label || 'Unknown'}
          accent={systemStatus.controller === 'online' ? undefined : c.warning}
        />
        <SummaryItem label="Last Checked" value={systemStatus.last_checked || '--'} />
      </Box>

      <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap' }}>
        {/* Left: node diagnostics */}
        <Box sx={{ flex: '2 1 480px', bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 4, p: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ShowChartRoundedIcon sx={{ color: c.textDark }} />
              <Typography variant="h6" sx={{ fontWeight: 700, color: c.textDark }}>
                Active Node Diagnostics
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ fontWeight: 700, color: c.primaryGreen }}>
              {totalSensors > 0 ? `${activeSensors} / ${totalSensors} Online` : 'No sensors reporting'}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={3} alignItems="center" sx={{ mb: 3 }}>
            <SensorRing value={sensorPct} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body1" sx={{ fontWeight: 700, color: c.textDark }}>
                {inactiveSensors.length > 0
                  ? `${inactiveSensors.length} node${inactiveSensors.length === 1 ? '' : 's'} need attention`
                  : 'All sensors reporting normally'}
              </Typography>
              <Typography variant="body2" sx={{ color: c.textBody }}>
                {systemStatus.database === 'offline'
                  ? 'Database connection is offline — readings may be stale.'
                  : 'Network signal is optimal across the sensor mesh.'}
              </Typography>
            </Box>
          </Stack>

          <Typography variant="caption" sx={{ color: c.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
            All Sensors
          </Typography>
          <Stack sx={{ mt: 1, maxHeight: 340, overflowY: 'auto' }}>
            {sensorStatus.length === 0 ? (
              <Typography variant="body2" sx={{ color: c.textMuted, py: 2 }}>
                No sensors registered yet — they're created automatically the first time data comes in from the Arduino.
              </Typography>
            ) : (
              sensorStatus.map((sensor, i) => {
                const badge = sensor.status === 'active'
                  ? { label: 'Online', bg: c.chipGreenBg, fg: c.primaryGreen, bar: c.primaryGreen }
                  : sensor.status === 'stale'
                    ? { label: 'Not Responding', bg: c.warningBg, fg: c.warning, bar: c.warning }
                    : { label: 'Never Reported', bg: c.dangerBg, fg: c.danger, bar: c.danger };
                return (
                  <Stack
                    key={sensor.sensor_id || i}
                    direction="row"
                    spacing={1.5}
                    alignItems="center"
                    sx={{ py: 1.5, borderBottom: i < sensorStatus.length - 1 ? `1px solid ${c.border}` : 'none' }}
                  >
                    <Box sx={{ width: 4, borderRadius: 1, bgcolor: badge.bar, alignSelf: 'stretch', minHeight: 32 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: c.textDark }} noWrap>
                        {sensor.sensor_name || 'Unknown Sensor'}
                      </Typography>
                      <Typography variant="body2" sx={{ color: c.textBody }} noWrap>
                        {sensor.location || 'Unknown location'} • reading: {sensor.display_value ?? '—'}
                      </Typography>
                    </Box>
                    <Chip label={badge.label} size="small" sx={{ bgcolor: badge.bg, color: badge.fg, fontWeight: 700, flexShrink: 0 }} />
                  </Stack>
                );
              })
            )}
          </Stack>
        </Box>

        {/* Right: zone status + system info */}
        <Stack sx={{ flex: '1 1 360px' }} spacing={3}>
          <Box sx={{ bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 4, p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: c.textDark }}>
                Zone Status
              </Typography>
              <Chip
                label={`${activeZones} / ${zoneStatus.length} Active`}
                size="small"
                sx={{ bgcolor: c.chipGreenBg, color: c.primaryGreen, fontWeight: 700 }}
              />
            </Stack>
            <Stack spacing={1.2}>
              {zoneStatus.length === 0 ? (
                <Typography variant="body2" sx={{ color: c.textMuted }}>
                  No zones configured yet.
                </Typography>
              ) : (
                zoneStatus.map((zone, i) => {
                  const moisture = zone.current_moisture ?? zone.moisture_level ?? zone.moisture;
                  const threshold = zone.moisture_threshold ?? zone.threshold ?? 40;
                  const needs = zone.needs_irrigation !== undefined ? zone.needs_irrigation : moisture < threshold;
                  const badge = needs
                    ? { label: 'Warning', bg: c.warningBg, fg: c.warning }
                    : { label: 'Active', bg: c.chipGreenBg, fg: c.primaryGreen };
                  return (
                    <Stack
                      key={zone.zone_id || zone.id || i}
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      sx={{ border: `1px solid ${c.border}`, borderRadius: 2.5, p: 1.5 }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700, color: c.textDark }}>
                        {zone.zone_name || zone.name || `Zone ${i + 1}`}
                      </Typography>
                      <Chip label={badge.label} size="small" sx={{ bgcolor: badge.bg, color: badge.fg, fontWeight: 700, height: 22 }} />
                    </Stack>
                  );
                })
              )}
            </Stack>
          </Box>

          <Box sx={{ bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 4, p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: c.textDark, mb: 2 }}>
              System Information
            </Typography>
            <Stack spacing={1.3} sx={{ mb: 2.5 }}>
              <InfoRow label="Last Sensor Check" value={systemStatus.last_checked || '--'} />
              <InfoRow label="Database" value={statusMap[systemStatus.database]?.label || 'Unknown'} />
              <InfoRow label="Weather API" value={statusMap[systemStatus.weather_api]?.label || 'Unknown'} />
              <InfoRow label="Irrigation System" value={statusMap[systemStatus.irrigation_system]?.label || 'Unknown'} />
              <InfoRow label="Database Records" value={systemStatus.details?.database_records ?? 0} />
            </Stack>
            <Button
              fullWidth
              variant="contained"
              onClick={fetchStatusData}
              sx={{ bgcolor: c.sidebarActive, py: 1.3, '&:hover': { bgcolor: '#152018' } }}
            >
              Refresh System Status
            </Button>
          </Box>
        </Stack>
      </Stack>

      {systemStatus.error && (
        <Box sx={{ mt: 3, bgcolor: c.dangerBg, border: `1px solid ${c.danger}`, borderRadius: 3, p: 2 }}>
          <Typography variant="body2" sx={{ color: c.danger }}>
            <strong>System Error:</strong> {systemStatus.error}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

const SummaryItem = ({ label, value, accent }) => (
  <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
    <Typography variant="caption" sx={{ color: '#8e9e94', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
      {label}
    </Typography>
    <Typography variant="h6" sx={{ color: accent || 'white', fontWeight: 800 }} noWrap>
      {value}
    </Typography>
  </Box>
);

const InfoRow = ({ label, value }) => (
  <Stack direction="row" justifyContent="space-between">
    <Typography variant="body2" sx={{ color: c.textBody }}>
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: 700, color: c.textDark }}>
      {value}
    </Typography>
  </Stack>
);

const SensorRing = ({ value }) => {
  const size = 88;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (value / 100) * circumference;
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
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ fontWeight: 800, color: c.textDark, fontSize: 18 }}>{value}%</Typography>
        <Typography sx={{ color: c.textMuted, fontSize: 9, textTransform: 'uppercase', fontWeight: 700 }}>Active</Typography>
      </Box>
    </Box>
  );
};

export default StatusSection;
