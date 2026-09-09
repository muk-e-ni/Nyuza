import React, { useState, useEffect, useCallback } from 'react';
import { sensorAPI, irrigationAPI, systemAPI, weatherAPI } from '../../services/api';
import RefreshIcon from '@mui/icons-material/Refresh';

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
        details: weatherData
      };
    } catch (error) {
      return { 
        status: 'offline', 
        last_checked: new Date().toISOString(),
        error: error.message
      };
    }
  }, []);

 const checkDatabaseStatus = useCallback(async () => {
  try {
    const zonesResponse = await irrigationAPI.getCurrentStatus();
    
    let recordCount = 0;
    let hasData = false;
    
    if (zonesResponse?.data?.data && Array.isArray(zonesResponse.data.data)) {
      recordCount = zonesResponse.data.data.length;
      hasData = zonesResponse.data.data.length > 0;
    } else if (Array.isArray(zonesResponse?.data)) {
      recordCount = zonesResponse.data.length;
      hasData = zonesResponse.data.length > 0;
    }
    
    console.log('🗄️ Database zones count:', recordCount);
    
    return {
      status: hasData ? 'online' : 'warning',
      record_count: recordCount,
      raw_data: zonesResponse
    };
  } catch (error) {
    return { 
      status: 'offline', 
      error: error.message
    };
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
        activeZones = irrigationData.length;
        hasZones = irrigationData.length > 0;
      } else if (Array.isArray(statusResponse?.data)) {
        irrigationData = statusResponse.data;
        activeZones = irrigationData.length;
        hasZones = irrigationData.length > 0;
      } else if (Array.isArray(statusResponse)) {
        irrigationData = statusResponse;
        activeZones = irrigationData.length;
        hasZones = irrigationData.length > 0;
      }
      
      return {
        status: hasZones ? 'ready' : 'warning',
        active_zones: activeZones,
        raw_data: irrigationData
      };
    } catch (error) {
      return { 
        status: 'offline', 
        error: error.message
      };
    }
  }, []);

  const fetchSensorData = useCallback(async () => {
    try {
      const sensorsResponse = await sensorAPI.getRecentReadings();
      
      let sensorData = [];
      
      if (Array.isArray(sensorsResponse?.data)) {
        sensorData = sensorsResponse.data;
      } else if (Array.isArray(sensorsResponse)) {
        sensorData = sensorsResponse;
      }
      
      return sensorData;
    } catch (error) {
      return [];
    }
  }, []);

  const fetchZoneData = useCallback(async () => {
    try {
      const zonesResponse = await irrigationAPI.getCurrentStatus();
      
      let zoneData = [];
      
      if (zonesResponse?.data?.data && Array.isArray(zonesResponse.data.data)) {
        zoneData = zonesResponse.data.data;
      } else if (Array.isArray(zonesResponse?.data)) {
        zoneData = zonesResponse.data;
      } else if (Array.isArray(zonesResponse)) {
        zoneData = zonesResponse;
      }
      
      return zoneData;
    } catch (error) {
      return [];
    }
  }, []);

  const fetchStatusData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [sensorsData, zonesData, systemHealth, weatherStatus, dbStatus, irrigationStatus] = 
        await Promise.all([
          fetchSensorData(),
          fetchZoneData(),
          checkSystemHealth(),
          checkWeatherAPI(),
          checkDatabaseStatus(),
          checkIrrigationSystem()
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
          zone_count: Array.isArray(zonesData) ? zonesData.length : 0
        }
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
        error: 'Failed to fetch system status'
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'online':
      case 'ready':
        return '#27ae60';
      case 'offline':
        return '#e74c3c';
      case 'warning':
        return '#f39c12';
      default:
        return '#95a5a6';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'ready':
        return 'Ready';
      case 'offline':
        return 'Offline';
      case 'warning':
        return 'Warning';
      default:
        return 'Unknown';
    }
  };

  const renderZoneItem = (zone, index) => {
    const zoneId = zone.zone_id || zone.id || index;
    const zoneName = zone.zone_name || zone.name || `Zone ${index + 1}`;
    const moisture = zone.current_moisture || zone.moisture_level || zone.moisture || 50;
    const threshold = zone.moisture_threshold || zone.threshold || 40;
    const needsIrrigation = zone.needs_irrigation !== undefined 
      ? zone.needs_irrigation 
      : moisture < threshold;
    const cropType = zone.crop_type || zone.cropType || 'Unknown';
    const lastIrrigation = zone.last_irrigation || zone.lastIrrigation;

    return (
      <div key={zoneId} className="zone-status-item detailed">
        <div className="zone-header">
          <h4>{zoneName}</h4>
          <div className={`moisture-indicator ${needsIrrigation ? 'low' : 'good'}`}>
            {moisture}%
          </div>
        </div>
        <div className="zone-details">
          <div className="detail-item">
            <label>Threshold:</label>
            <span>{threshold}%</span>
          </div>
          <div className="detail-item">
            <label>Status:</label>
            <span className={needsIrrigation ? 'status-warning' : 'status-ok'}>
              {needsIrrigation ? 'Needs Irrigation' : 'Adequate Moisture'}
            </span>
          </div>
          <div className="detail-item">
            <label>Last Irrigation:</label>
            <span>{lastIrrigation ? new Date(lastIrrigation).toLocaleDateString() : 'Never'}</span>
          </div>
          <div className="detail-item">
            <label>Crop Type:</label>
            <span>{cropType}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="status-section">
        <div className="loading">Loading system status...</div>
      </div>
    );
  }

  return (
    <div className="status-section">
      <h2>System Status Overview</h2>
      
      <div className="status-grid">
        <div className="status-card" style={{borderLeftColor: getStatusColor(systemStatus.controller)}}>
          <h3>Main Controller</h3>
          <p className="status-value">{getStatusText(systemStatus.controller)}</p>
          <p className="status-detail">Flask Backend Server</p>
          {systemStatus.controller === 'online' && (
            <div className="status-detail-small">API endpoints responsive</div>
          )}
        </div>
        
        <div className="status-card" style={{borderLeftColor: getStatusColor(systemStatus.database)}}>
          <h3>Database</h3>
          <p className="status-value">{getStatusText(systemStatus.database)}</p>
          <p className="status-detail">MySQL Database</p>
          {systemStatus.details?.database_records !== undefined && (
            <div className="status-detail-small">
              {systemStatus.details.database_records} zones configured
            </div>
          )}
        </div>
        
        <div className="status-card" style={{borderLeftColor: getStatusColor(systemStatus.weather_api)}}>
          <h3>Weather API</h3>
          <p className="status-value">{getStatusText(systemStatus.weather_api)}</p>
          <p className="status-detail">External Service</p>
          {systemStatus.details?.weather_last_checked && (
            <div className="status-detail-small">
              Last checked: {new Date(systemStatus.details.weather_last_checked).toLocaleTimeString()}
            </div>
          )}
        </div>
        
        <div className="status-card" style={{borderLeftColor: getStatusColor(systemStatus.irrigation_system)}}>
          <h3>Irrigation System</h3>
          <p className="status-value">{getStatusText(systemStatus.irrigation_system)}</p>
          <p className="status-detail">Pump & Valves</p>
          {systemStatus.details?.active_zones !== undefined && (
            <div className="status-detail-small">
              {systemStatus.details.active_zones} active zones
            </div>
          )}
        </div>
      </div>

      <div className="detailed-status">
        <div className="sensor-status">
          <h3>Sensor Status ({systemStatus.details?.sensor_count || 0} sensors)</h3>
          <div className="sensor-list">
            {Array.isArray(sensorStatus) && sensorStatus.length > 0 ? (
              sensorStatus.map(sensor => (
                <div key={sensor.sensor_id || sensor.id} className="sensor-status-item">
                  <div className="sensor-info">
                    <span className="sensor-name">{sensor.sensor_name || sensor.name || 'Unknown Sensor'}</span>
                    <span className="sensor-location">{sensor.location || 'Unknown Location'}</span>
                  </div>
                  <div className="sensor-data">
                    <span className="sensor-value">{sensor.last_value || sensor.value || '--'}</span>
                    <span className="sensor-type">{sensor.type || 'Unknown Type'}</span>
                  </div>
                  <div className={`sensor-status ${sensor.status || 'active'}`}>
                    {sensor.status || 'Active'}
                  </div>
                </div>
              ))
            ) : (
              <div className="no-data">No sensor data available</div>
            )}
          </div>
        </div>

        <div className="zone-status">
          <h3>Zone Moisture Status ({systemStatus.details?.zone_count || 0} zones)</h3>
          <div className="zone-list">
            {Array.isArray(zoneStatus) && zoneStatus.length > 0 ? (
              zoneStatus.map(renderZoneItem)
            ) : (
              <div className="no-data">
                No zone data available
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="system-info">
        <h3>System Information</h3>
        <div className="info-grid">
          <div className="info-item">
            <label>Last System Check:</label>
            <span>{systemStatus.last_checked || 'Never'}</span>
          </div>
          <div className="info-item">
            <label>Active Sensors:</label>
            <span>{systemStatus.details?.sensor_count || 0}</span>
          </div>
          <div className="info-item">
            <label>Irrigation Zones:</label>
            <span>{systemStatus.details?.zone_count || 0}</span>
          </div>
          <div className="info-item">
            <label>Database Records:</label>
            <span>{systemStatus.details?.database_records || 0}</span>
          </div>
        </div>
        
        <div className="status-actions">
          <button onClick={fetchStatusData} className="refresh-btn">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <RefreshIcon sx={{ fontSize: 18 }} /> Refresh Status
            </span>
          </button>
        </div>
      </div>

      {systemStatus.error && (
        <div className="error-banner">
          <strong>System Error:</strong> {systemStatus.error}
        </div>
      )}
    </div>
  );
};

export default StatusSection;