import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMediaQuery } from '@mui/material';
import { sensorAPI, irrigationAPI, recommendationAPI, systemAPI, weatherAPI } from '../../services/api';
import {
  WaterDrop as WaterDropIcon,
  Insights as InsightsIcon,
  Shield as ShieldIcon,
  BugReport as BugReportIcon,
  WarningAmber as WarningAmberIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Cloud as CloudIcon,
  Air as AirIcon,
  Bolt as BoltIcon,
} from '@mui/icons-material';
import { Box } from '@mui/material';
import {
  WeatherCard,
  HealthRing,
  QuickActionTile,
  AlertRow,
  MobileSectionTitle,
  MobileCard,
} from '../mobile/MobileUI';

const HomeSection = ({ currentUser, onSectionChange }) => {
  const isMobile = useMediaQuery('(max-width:768px)');
  const [sensorData, setSensorData] = useState({});
  const [moistureStatus, setMoistureStatus] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [irrigationHistory, setIrrigationHistory] = useState([]);
  const [systemHealth, setSystemHealth] = useState({});
  const [loading, setLoading] = useState(true);
  const [applyingRec, setApplyingRec] = useState(null);
  const [dismissingRec, setDismissingRec] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [clearedAlerts, setClearedAlerts] = useState(new Set());
  // Mobile weather card only — desktop already gets weather from WeatherPanel
  // elsewhere on the page, so this stays scoped to the mobile branch.
  const [mobileWeather, setMobileWeather] = useState(null);
  
  // Track last refresh time and data changes
  const lastRefreshRef = useRef(null);
  const lastRecommendationsCountRef = useRef(0);

  // Fetch sensor data
  const fetchSensorData = useCallback(async () => {
    try {
      const sensorResponse = await sensorAPI.getRecentReadings();
      const sensors = sensorResponse?.data || [];
      
      // Extract sensor values from the array
      const sensorValues = {};
      sensors.forEach(sensor => {
        if (sensor.sensor_name?.includes('soil_moisture') || sensor.sensor_name?.includes('Soil Moisture')) {
          sensorValues.soilMoisture = sensor.last_value;
        } else if (sensor.sensor_name?.includes('Rain') || sensor.sensor_name?.includes('rain')) {
          sensorValues.rainSensor = sensor.last_value;
        } else if (sensor.sensor_name?.includes('Water Level') || sensor.sensor_name?.includes('water_level')) {
          sensorValues.waterLevel = sensor.last_value;
        }
      });
      
      return sensorValues;
    } catch (error) {
      console.error('Error fetching sensor data:', error);
      return {};
    }
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      console.log('🔄 Fetching dashboard data...');
      
      const [recResponse, statusResponse, historyResponse, healthResponse, sensorDataResponse] = await Promise.all([
        recommendationAPI.getRecommendations('pending'),
        irrigationAPI.getCurrentStatus(),
        irrigationAPI.getHistory(),
        systemAPI.getHealth(),
        fetchSensorData()
      ]);
      
      // Update last refresh time
      lastRefreshRef.current = Date.now();
      
      // Handle recommendations with deduplication logic
      let recommendationsData = [];
      if (recResponse && recResponse.data) {
        recommendationsData = Array.isArray(recResponse.data) ? recResponse.data : [];
      }
      
      // Only update if recommendations actually changed
      if (recommendationsData.length !== lastRecommendationsCountRef.current) {
        console.log(`📊 Recommendations changed: ${lastRecommendationsCountRef.current} -> ${recommendationsData.length}`);
        setRecommendations(recommendationsData);
        lastRecommendationsCountRef.current = recommendationsData.length;
      } else {
        console.log('📊 No change in recommendations count, skipping update');
      }
      
      // Handle zone status data structure
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
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Don't clear existing data on error, just keep showing what we have
    } finally {
      setLoading(false);
    }
  }, [fetchSensorData]);

  useEffect(() => {
    fetchDashboardData();
    
    // Increased interval from 30s to 2 minutes for normal refreshes
    const interval = setInterval(() => {
      // Only refresh if it's been more than 2 minutes OR if there are critical alerts
      const timeSinceLastRefresh = lastRefreshRef.current ? 
        (Date.now() - lastRefreshRef.current) / 1000 / 60 : 10; // in minutes
      
      const hasCriticalAlerts = recommendations.some(rec => 
        rec.priority === 'critical' || rec.priority === 'high'
      );
      
      if (timeSinceLastRefresh >= 2 || hasCriticalAlerts) {
        fetchDashboardData();
      } else {
        console.log('🕒 Skipping refresh - too soon since last update');
      }
    }, 120000); // 2 minutes
    
    return () => clearInterval(interval);
  }, [fetchDashboardData, recommendations]);

  // Mobile-only weather fetch — isolated from the main dashboard refresh
  // cycle above so it can't affect desktop behavior or timing.
  useEffect(() => {
    if (!isMobile) return;
    let cancelled = false;
    weatherAPI.getCurrentWeather()
      .then((res) => {
        if (!cancelled && res?.data) setMobileWeather(res.data);
      })
      .catch((err) => console.error('Mobile weather fetch error:', err));
    return () => { cancelled = true; };
  }, [isMobile]);

  // Manual refresh 
  const manualRefresh = async () => {
    setActionMessage('Refreshing data...');
    await fetchDashboardData();
    setActionMessage('Data refreshed!');
    setTimeout(() => setActionMessage(''), 3000);
  };

  // Filter and prioritize recommendations
  const filterAndPrioritizeRecommendations = (allRecommendations) => {
    if (!Array.isArray(allRecommendations)) return [];
    
    // Filter out cleared alerts
    const filteredRecs = allRecommendations.filter(rec => 
      !clearedAlerts.has(rec.id || rec.recommendation_id)
    );
    
    // Filter by priority
    const criticalHigh = filteredRecs.filter(rec => 
      rec.priority === 'critical' || rec.priority === 'high'
    );
    
    const medium = filteredRecs.filter(rec => 
      rec.priority === 'medium'
    );
    
    const low = filteredRecs.filter(rec => 
      rec.priority === 'low'
    );
    
    // Show all critical/high, up to 3 medium, up to 2 low
    let result = [...criticalHigh];
    
    if (result.length < 5) {
      result = [...result, ...medium.slice(0, 5 - result.length)];
    }
    
    if (result.length < 5) {
      result = [...result, ...low.slice(0, 5 - result.length)];
    }
    
    return result.slice(0, 5); // Max 5 recommendations total
  };

  const getCriticalRecommendations = () => {
    const filteredRecs = filterAndPrioritizeRecommendations(recommendations);
    return filteredRecs.filter(rec => 
      rec.priority === 'critical' || rec.priority === 'high'
    );
  };

  const getDisplayRecommendations = () => {
    return filterAndPrioritizeRecommendations(recommendations);
  };

  const getLastIrrigationTime = () => {
    if (Array.isArray(irrigationHistory) && irrigationHistory.length > 0) {
      const lastIrrigation = irrigationHistory[0];
      return new Date(lastIrrigation.timestamp || lastIrrigation.start_time).toLocaleString();
    }
    return 'No irrigation recorded';
  };

  const handleApplyRecommendation = async (recId) => {
    try {
      setApplyingRec(recId);
      setActionMessage('');
      
      console.log('Applying recommendation:', recId);
      const response = await recommendationAPI.applyRecommendation(recId);
      
      console.log('Apply response:', response);
      
      // Check for success in different response formats
      const isSuccess = response?.data?.success === true || 
                       response?.data?.message?.includes('successfully') ||
                       response?.status === 200;
      
      if (isSuccess) {
        setActionMessage('Recommendation applied successfully!');
        // Refresh recommendations to remove the applied one
        setTimeout(() => fetchDashboardData(), 1000);
      } else {
        setActionMessage(response?.data?.error || 'Failed to apply recommendation');
      }
    } catch (error) {
      console.error('Error applying recommendation:', error);
      console.error('Error response:', error.response);
      setActionMessage(error.response?.data?.error || 'Error applying recommendation');
    } finally {
      setApplyingRec(null);
      setTimeout(() => setActionMessage(''), 5000);
    }
  };

  const handleDismissRecommendation = async (recId) => {
    try {
      setDismissingRec(recId);
      setActionMessage('');
      
      console.log('Dismissing recommendation:', recId);
      const response = await recommendationAPI.dismissRecommendation(recId);
      
      console.log('Dismiss response:', response);
      
      // Check for success in different response formats
      const isSuccess = response?.data?.success === true || 
                       response?.data?.message?.includes('successfully') ||
                       response?.status === 200;
      
      if (isSuccess) {
        setActionMessage('Recommendation dismissed successfully!');
        // Refresh recommendations to remove the dismissed one
        setTimeout(() => fetchDashboardData(), 1000);
      } else {
        setActionMessage(response?.data?.error || 'Failed to dismiss recommendation');
      }
    } catch (error) {
      console.error('Error dismissing recommendation:', error);
      console.error('Error response:', error.response);
      setActionMessage(error.response?.data?.error || 'Error dismissing recommendation');
    } finally {
      setDismissingRec(null);
      setTimeout(() => setActionMessage(''), 5000);
    }
  };

  // Clear critical alert
  const handleClearAlert = (recId) => {
    setClearedAlerts(prev => new Set(prev).add(recId));
    setActionMessage('Alert cleared temporarily');
    setTimeout(() => setActionMessage(''), 3000);
  };

  // Clear all critical alerts
  const handleClearAllAlerts = () => {
    const criticalIds = getCriticalRecommendations().map(rec => rec.id || rec.recommendation_id);
    setClearedAlerts(prev => new Set([...prev, ...criticalIds]));
    setActionMessage('All alerts cleared temporarily');
    setTimeout(() => setActionMessage(''), 3000);
  };

  if (loading) {
    return (
      <div className="home-section">
        <div className="loading">Loading dashboard data...</div>
      </div>
    );
  }

  // Mobile branch — uses the shared Figma-styled components. Desktop's
  // render below is completely unmodified and unreachable from here.
  if (isMobile) {
    const criticalAlerts = getCriticalRecommendations();
    const healthScore = systemHealth.database === 'online' && systemHealth.sensors === 'online' ? 92 : 70;

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, px: 2, py: 1.5, pb: 3 }}>
        <WeatherCard
          location={mobileWeather?.city || 'Farm'}
          temperature={mobileWeather?.temperature !== undefined ? Math.round(mobileWeather.temperature) : undefined}
          condition={mobileWeather?.description || 'Loading...'}
          humidity={mobileWeather?.humidity}
          windSpeed={mobileWeather?.wind_speed}
        />

        <HealthRing
          score={healthScore}
          title="Overall Farm Health"
          description={
            moistureStatus.some(z => z.needs_irrigation)
              ? 'Some zones need irrigation — check Zone Status below.'
              : 'Moisture is balanced across monitored zones.'
          }
        />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%' }}>
          <MobileSectionTitle>Quick Actions</MobileSectionTitle>
          <Box sx={{ display: 'flex', gap: 1.5, width: '100%' }}>
            <QuickActionTile
              icon={WaterDropIcon}
              label="Irrigation"
              colorIndex={0}
              onClick={() => onSectionChange('irrigation')}
            />
            <QuickActionTile
              icon={InsightsIcon}
              label="Status"
              colorIndex={1}
              onClick={() => onSectionChange('status')}
            />
            <QuickActionTile
              icon={ShieldIcon}
              label="Pest"
              colorIndex={2}
              onClick={() => onSectionChange('vision')}
            />
            <QuickActionTile
              icon={BugReportIcon}
              label="Disease"
              colorIndex={3}
              onClick={() => onSectionChange('vision')}
            />
          </Box>
        </Box>

        <MobileCard sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <MobileSectionTitle
              action={
                criticalAlerts.length > 0 ? (
                  <Box
                    component="span"
                    onClick={handleClearAllAlerts}
                    sx={{ fontSize: 12, fontWeight: 600, color: '#3c4e43', cursor: 'pointer' }}
                  >
                    Dismiss All
                  </Box>
                ) : null
              }
            >
              Recent Alerts
            </MobileSectionTitle>
          </Box>
          {criticalAlerts.length === 0 ? (
            <Box sx={{ py: 2, textAlign: 'center', color: '#8e9e94', fontSize: 13 }}>
              No active alerts — all clear.
            </Box>
          ) : (
            criticalAlerts.map((rec, idx) => (
              <AlertRow
                key={rec.id || rec.recommendation_id}
                title={rec.title}
                description={rec.description}
                severity={rec.priority === 'critical' ? 'critical' : rec.priority === 'high' ? 'warning' : 'good'}
                isLast={idx === criticalAlerts.length - 1}
              />
            ))
          )}
        </MobileCard>
      </Box>
    );
  }

  return (
    <div className="home-section">
      <div className="welcome-section">
        <h1>Welcome back, {currentUser?.username || 'User'}!</h1>
        
        <div className="activity-block">
          <h3>Activity Block</h3>
          <div className="last-irrigation">
            <strong>Last Irrigation:</strong> {getLastIrrigationTime()}
          </div>

          {/* System Health */}
          <div className="system-health">
            <h4>System Status</h4>
            <div className="health-indicators">
              <div className="health-item">
                <span className={`indicator ${systemHealth.database === 'online' ? 'online' : 'offline'}`}></span>
                <span>Database: {systemHealth.database || 'Checking...'}</span>
              </div>
              <div className="health-item">
                <span className={`indicator ${systemHealth.sensors === 'online' ? 'online' : 'offline'}`}></span>
                <span>Sensors: {systemHealth.sensors || 'Checking...'}</span>
              </div>
              <div className="health-item">
                <span className={`indicator ${systemHealth.weather_api === 'online' ? 'online' : 'offline'}`}></span>
                <span>Weather API: {systemHealth.weather_api || 'Checking...'}</span>
              </div>
            </div>
          </div>
          
          {/* Critical Alerts */}
          {Array.isArray(recommendations) && getCriticalRecommendations().length > 0 && (
            <div className="critical-alerts">
              <div className="alert-header">
                <h4 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <WarningAmberIcon sx={{ fontSize: 18, color: '#d87a00' }} /> Critical Alerts ({getCriticalRecommendations().length})
                </h4>
                <button 
                  className="clear-all-btn"
                  onClick={handleClearAllAlerts}
                >
                  Clear All
                </button>
              </div>
              {getCriticalRecommendations().map(rec => (
                <div key={rec.id} className="alert-item">
                  <div className="alert-content">
                    <strong>{rec.title}</strong> - {rec.description}
                  </div>
                  <button 
                    className="clear-alert-btn"
                    onClick={() => handleClearAlert(rec.id || rec.recommendation_id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Manual Refresh Button */}
          <div className="refresh-controls">
            <button 
              className="refresh-btn"
              onClick={manualRefresh}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <RefreshIcon sx={{ fontSize: 16 }} /> Refresh Data
                </span>
              )}
            </button>
            {actionMessage && (
              <span className="refresh-message">{actionMessage}</span>
            )}
          </div>
        </div>

        <div className="action-buttons">
          <button 
            className="action-btn primary"
            onClick={() => onSectionChange('status')}
          >
            CHECK STATUS
          </button>
          <button 
            className="action-btn secondary"
            onClick={() => onSectionChange('irrigation')}
          >
            VISIT IRRIGATION PAGE
          </button>
          <button 
            className="action-btn tertiary"
            onClick={() => onSectionChange('reports')}
          >
            CHECK REPORT
          </button>
        </div>
      </div>

      {/* Quick Status Overview */}
      <div className="quick-overview">
        <div className="overview-card">
          <h3>System Health</h3>
          <div className="health-indicators">
            <div className="health-item">
              <span className={`indicator ${systemHealth.database === 'online' ? 'online' : systemHealth.database === 'offline' ? 'offline' : 'warning'}`}></span>
              <span>Database: {systemHealth.database || 'Unknown'}</span>
            </div>
            <div className="health-item">
              <span className={`indicator ${systemHealth.sensors === 'online' ? 'online' : 'offline'}`}></span>
              <span>Sensors: {systemHealth.sensors || 'Unknown'}</span>
            </div>
            <div className="health-item">
              <span className="indicator warning"></span>
              <span>Alerts: {getCriticalRecommendations().length}</span>
            </div>
          </div>
        </div>

        <div className="overview-card">
          <h3>Zone Status</h3>
          <div className="zone-status-list">
            {Array.isArray(moistureStatus) && moistureStatus.length > 0 ? (
              moistureStatus.map(zone => (
                <div key={zone.zone_id} className="zone-status-item">
                  <span className="zone-name">{zone.zone_name}</span>
                  <span className={`moisture-level ${zone.needs_irrigation ? 'low' : 'good'}`}>
                    {zone.current_moisture || 0}%
                  </span>
                  <span className={`status ${zone.needs_irrigation ? 'needs-water' : 'adequate'}`}>
                    {zone.needs_irrigation ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><WaterDropIcon sx={{ fontSize: 14 }} /> Needs Water</span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircleIcon sx={{ fontSize: 14 }} /> Adequate</span>
                    )}
                  </span>
                </div>
              ))
            ) : (
              <div className="no-zones">No zone data available</div>
            )}
          </div>
        </div>
      </div>

      {/* Updated Sensor Cards Grid */}
      <div className="sensor-grid">
        <div className="sensor-card">
          <div className="sensor-icon"><WaterDropIcon sx={{ fontSize: 28 }} /></div>
          <h3>Soil Moisture</h3>
          <p className="sensor-value">{sensorData.soilMoisture !== undefined ? sensorData.soilMoisture + '%' : '--'}</p>
          <div className="sensor-status">
            {sensorData.soilMoisture < 30 ? 'Low' : sensorData.soilMoisture < 60 ? 'Optimal' : 'High'}
          </div>
        </div>
        
        <div className="sensor-card">
          <div className="sensor-icon"><CloudIcon sx={{ fontSize: 28 }} /></div>
          <h3>Rain Sensor</h3>
          <p className="sensor-value">{sensorData.rainSensor !== undefined ? sensorData.rainSensor : '--'}</p>
          <div className="sensor-status">
            {sensorData.rainSensor > 0 ? 'Rain Detected' : 'No Rain'}
          </div>
        </div>
        
        <div className="sensor-card">
          <div className="sensor-icon"><AirIcon sx={{ fontSize: 28 }} /></div>
          <h3>Wind Speed</h3>
          <p className="sensor-value">--</p>
          <div className="sensor-status">
            Monitoring
          </div>
        </div>
        
        <div className="sensor-card">
          <div className="sensor-icon"><BoltIcon sx={{ fontSize: 28 }} /></div>
          <h3>Water Level</h3>
          <p className="sensor-value">{sensorData.waterLevel !== undefined ? sensorData.waterLevel + '%' : '--'}</p>
          <div className="sensor-status">
            {sensorData.waterLevel < 20 ? 'Low' : sensorData.waterLevel < 50 ? 'Medium' : 'Good'}
          </div>
        </div>
      </div>

      {/* Recent Recommendations - Limited Display */}
      {Array.isArray(recommendations) && getDisplayRecommendations().length > 0 && (
        <div className="recommendations-section">
          <div className="section-header">
            <h3>AI Recommendations</h3>
            <span className="recommendation-count">
              {getDisplayRecommendations().length} of {recommendations.length}
            </span>
          </div>
          
          {/* Action Message */}
          {actionMessage && (
            <div className={`action-message ${actionMessage.includes('successfully') ? 'success' : 'error'}`}>
              {actionMessage}
            </div>
          )}
          
          <div className="recommendations-list">
            {getDisplayRecommendations().map(rec => (
              <div key={rec.id || rec.recommendation_id} className={`recommendation-card ${rec.priority}`}>
                <div className="rec-header">
                  <h4>{rec.title}</h4>
                  <div className="rec-meta">
                    <span className={`priority-badge ${rec.priority}`}>
                      {rec.priority}
                    </span>
                    {rec.status && (
                      <span className={`status-badge ${rec.status}`}>
                        {rec.status}
                      </span>
                    )}
                  </div>
                </div>
                <p>{rec.description}</p>
                
                {/* Show different content based on status */}
                {rec.status === 'applied' ? (
                  <div className="rec-status">
                    <span className="applied-badge" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CheckCircleIcon sx={{ fontSize: 14 }} /> Applied</span>
                    <small>Applied on: {rec.applied_at ? new Date(rec.applied_at).toLocaleDateString() : 'Recently'}</small>
                  </div>
                ) : rec.status === 'dismissed' ? (
                  <div className="rec-status">
                    <span className="dismissed-badge" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CancelIcon sx={{ fontSize: 14 }} /> Dismissed</span>
                  </div>
                ) : (
                  <div className="rec-actions">
                    <button 
                      className="btn-primary"
                      onClick={() => handleApplyRecommendation(rec.id || rec.recommendation_id)}
                      disabled={applyingRec === (rec.id || rec.recommendation_id)}
                    >
                      {applyingRec === (rec.id || rec.recommendation_id) ? 'Applying...' : 'Apply'}
                    </button>
                    <button 
                      className="btn-secondary"
                      onClick={() => handleDismissRecommendation(rec.id || rec.recommendation_id)}
                      disabled={dismissingRec === (rec.id || rec.recommendation_id)}
                    >
                      {dismissingRec === (rec.id || rec.recommendation_id) ? 'Dismissing...' : 'Dismiss'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* Show "more" indicator if there are hidden recommendations */}
          {recommendations.length > getDisplayRecommendations().length && (
            <div className="more-recommendations">
              <small>
                +{recommendations.length - getDisplayRecommendations().length} more recommendations available. 
                <button 
                  className="text-link"
                  onClick={() => onSectionChange('recommendations')}
                >
                  View all
                </button>
              </small>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HomeSection;