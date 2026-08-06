import React, { useState, useEffect } from 'react';
import { irrigationAPI, sensorAPI } from '../../services/api';


// Notification System Component
const Notification = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`notification notification-${type}`}>
      <div className="notification-content">
        <span className="notification-icon">
          {type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}
        </span>
        <span className="notification-message">{message}</span>
      </div>
      <button className="notification-close" onClick={onClose}>×</button>
    </div>
  );
};

// Schedule Form Component
const ScheduleForm = ({ zones, onSave, onCancel, editSchedule = null }) => {
  const [formData, setFormData] = useState({
    zone_id: editSchedule?.zone_id || '',
    name: editSchedule?.name || '',
    trigger_type: editSchedule?.trigger_type || 'moisture',
    moisture_threshold: editSchedule?.moisture_threshold || 40,
    duration: editSchedule?.duration || 300,
    minimum_interval: editSchedule?.minimum_interval || 3600,
    max_daily_irrigations: editSchedule?.max_daily_irrigations || 3,
    is_active: editSchedule?.is_active ?? true
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <div className="schedule-form-modal">
      <div className="modal-content">
        <h3>{editSchedule ? 'Edit Schedule' : 'Create New Schedule'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Zone:</label>
            <select 
              name="zone_id" 
              value={formData.zone_id} 
              onChange={handleChange}
              required
            >
              <option value="">Select a zone</option>
              {zones.map(zone => (
                <option key={zone.zone_id} value={zone.zone_id}>
                  {zone.zone_name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Schedule Name:</label>
            <input 
              type="text" 
              name="name" 
              value={formData.name} 
              onChange={handleChange}
              placeholder="e.g., Morning Irrigation"
              required
            />
          </div>

          <div className="form-group">
            <label>Trigger Type:</label>
            <select name="trigger_type" value={formData.trigger_type} onChange={handleChange}>
              <option value="moisture">Moisture Level</option>
              <option value="timed">Timed</option>
              <option value="manual">Manual Only</option>
            </select>
          </div>

          {formData.trigger_type === 'moisture' && (
            <div className="form-group">
              <label>Moisture Threshold (%):</label>
              <input 
                type="number" 
                name="moisture_threshold" 
                value={formData.moisture_threshold} 
                onChange={handleChange}
                min="0"
                max="100"
                step="5"
              />
              <small>Irrigate when moisture drops below this percentage</small>
            </div>
          )}

          <div className="form-group">
            <label>Duration (seconds):</label>
            <input 
              type="number" 
              name="duration" 
              value={formData.duration} 
              onChange={handleChange}
              min="60"
              step="60"
            />
            <small>How long to run irrigation when triggered</small>
          </div>

          <div className="form-group">
            <label>Minimum Interval (seconds):</label>
            <input 
              type="number" 
              name="minimum_interval" 
              value={formData.minimum_interval} 
              onChange={handleChange}
              min="3600"
              step="3600"
            />
            <small>Minimum time between irrigations (1 hour = 3600 seconds)</small>
          </div>

          <div className="form-group">
            <label>Max Daily Irrigations:</label>
            <input 
              type="number" 
              name="max_daily_irrigations" 
              value={formData.max_daily_irrigations} 
              onChange={handleChange}
              min="1"
              max="10"
            />
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input 
                type="checkbox" 
                name="is_active" 
                checked={formData.is_active} 
                onChange={handleChange}
              />
              Active Schedule
            </label>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {editSchedule ? 'Update Schedule' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const IrrigationSection = () => {
  const [zones, setZones] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [currentStatus, setCurrentStatus] = useState([]);
  const [isManualMode, setIsManualMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIrrigations, setActiveIrrigations] = useState({});
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [realTimeData, setRealTimeData] = useState({});
  
  // Notification states
  const [notifications, setNotifications] = useState([]);
  const [toastNotifications, setToastNotifications] = useState([]);

  useEffect(() => {
    fetchIrrigationData();
    const interval = setInterval(fetchIrrigationData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Add notification functions
  const addNotification = (message, type = 'info') => {
    const newNotification = {
      id: Date.now() + Math.random(),
      message,
      type,
      timestamp: new Date()
    };
    
    setToastNotifications(prev => [...prev, newNotification]);
    setNotifications(prev => [newNotification, ...prev]);
  };

  const removeToastNotification = (id) => {
    setToastNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  const fetchIrrigationData = async () => {
    try {
      setLoading(true);
      const [zonesResponse, schedulesResponse, statusResponse, sensorResponse] = await Promise.all([
        irrigationAPI.getUserZones(),
        irrigationAPI.getSchedules(),
        irrigationAPI.getCurrentStatus(),
        sensorAPI.getCurrentSensorData().catch(() => ({ data: {} })) // Optional real-time data
      ]);
      
      setZones(zonesResponse.data?.zones || []);
      setSchedules(schedulesResponse.data?.data || []);
      setCurrentStatus(statusResponse.data?.data || []);
      setRealTimeData(sensorResponse.data?.data || {});
      
      // Auto-select first zone if none selected
      if (zonesResponse.data?.zones?.length > 0 && !selectedZoneId) {
        setSelectedZoneId(zonesResponse.data.zones[0].zone_id);
      }
    } catch (error) {
      console.error('Error fetching irrigation data:', error);
      addNotification('Failed to fetch irrigation data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Schedule Management
  const handleCreateSchedule = async (scheduleData) => {
    try {
      const response = await irrigationAPI.createSchedule(scheduleData);
      if (response.data.success) {
        addNotification('Schedule created successfully', 'success');
        setShowScheduleForm(false);
        fetchIrrigationData();
      }
    } catch (error) {
      console.error('Error creating schedule:', error);
      addNotification('Failed to create schedule', 'error');
    }
  };

  const handleEditSchedule = async (scheduleData) => {
    try {
      const response = await irrigationAPI.updateIrrigationSchedule(editingSchedule.id, scheduleData);
      if (response.data.success) {
        addNotification('Schedule updated successfully', 'success');
        setShowScheduleForm(false);
        setEditingSchedule(null);
        fetchIrrigationData();
      }
    } catch (error) {
      console.error('Error updating schedule:', error);
      addNotification('Failed to update schedule', 'error');
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (window.confirm('Are you sure you want to delete this schedule?')) {
      try {
        const response = await irrigationAPI.deleteIrrigationSchedule(scheduleId);
        if (response.data.success) {
          addNotification('Schedule deleted successfully', 'success');
          fetchIrrigationData();
        }
      } catch (error) {
        console.error('Error deleting schedule:', error);
        addNotification('Failed to delete schedule', 'error');
      }
    }
  };

  const toggleScheduleActive = async (schedule) => {
    try {
      const response = await irrigationAPI.updateIrrigationSchedule(schedule.id, {
        is_active: !schedule.is_active
      });
      if (response.data.success) {
        addNotification(`Schedule ${!schedule.is_active ? 'activated' : 'deactivated'}`, 'success');
        fetchIrrigationData();
      }
    } catch (error) {
      console.error('Error toggling schedule:', error);
      addNotification('Failed to update schedule', 'error');
    }
  };

  // Auto Mode Functions
  const triggerAutoModeCheck = async () => {
    try {
      if (!selectedZoneId) {
        addNotification('Please select a zone first', 'warning');
        return;
      }
      
      const response = await sensorAPI.storeSensorReadings(selectedZoneId);
      if (response.data.success) {
        addNotification('Auto mode checked - sensor data updated', 'success');
        setTimeout(fetchIrrigationData, 2000);
      }
    } catch (error) {
      console.error('Error triggering auto mode:', error);
      addNotification('Failed to check auto mode', 'error');
    }
  };

  const triggerAutoModeCheckForZone = async (zoneId) => {
    try {
      const response = await sensorAPI.storeSensorReadings(zoneId);
      if (response.data.success) {
        addNotification(`Auto mode tested for zone`, 'success');
        setTimeout(fetchIrrigationData, 2000);
      }
    } catch (error) {
      console.error('Error testing auto mode for zone:', error);
      addNotification('Failed to test auto mode', 'error');
    }
  };

  // Manual Irrigation Functions
  const handleManualIrrigation = async (zoneName, duration) => {
    try {
      setLoading(true);
      await irrigationAPI.manualControl({ zone: zoneName, duration });
      addNotification(`Irrigation started for ${zoneName} for ${duration} seconds`, 'success');
      setActiveIrrigations(prev => ({ ...prev, [zoneName]: { duration, startTime: Date.now() } }));
      setTimeout(fetchIrrigationData, 2000);
    } catch (error) {
      console.error('Error starting irrigation:', error);
      addNotification(`Failed to start irrigation for ${zoneName}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStopIrrigation = async (zoneName) => {
    try {
      setLoading(true);
      await irrigationAPI.stopZoneIrrigation(zoneName);
      addNotification(`Irrigation stopped for ${zoneName}`, 'success');
      setActiveIrrigations(prev => {
        const newState = { ...prev };
        delete newState[zoneName];
        return newState;
      });
      setTimeout(fetchIrrigationData, 2000);
    } catch (error) {
      console.error('Error stopping irrigation:', error);
      addNotification(`Failed to stop irrigation for ${zoneName}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStopAllIrrigation = async () => {
    try {
      setLoading(true);
      const stopPromises = Object.keys(activeIrrigations).map(zoneName => 
        irrigationAPI.stopZoneIrrigation(zoneName)
      );
      
      await Promise.all(stopPromises);
      addNotification('All irrigation stopped successfully', 'success');
      
      setActiveIrrigations({});
      setTimeout(fetchIrrigationData, 2000);
    } catch (error) {
      console.error('Error stopping all irrigation:', error);
      addNotification('Failed to stop all irrigation', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getZoneStatus = (zoneName) => {
    return Array.isArray(currentStatus) ? currentStatus.find(status => status.zone_name === zoneName) : null;
  };

  const getActiveAutoIrrigations = () => {
    return schedules.filter(schedule => 
      realTimeData.auto_irrigation_in_progress && 
      getZoneStatus(schedule.zone_name)?.zone_name === schedule.zone_name
    );
  };

  // Calculate remaining time for active irrigations
  const getRemainingTime = (zoneName) => {
    const irrigation = activeIrrigations[zoneName];
    if (!irrigation) return null;
    
    const elapsed = Date.now() - irrigation.startTime;
    const remaining = Math.max(0, irrigation.duration * 1000 - elapsed);
    return Math.ceil(remaining / 1000); // Return seconds
  };

  if (loading && zones.length === 0) {
    return <div className="irrigation-section"><div className="loading">Loading irrigation data...</div></div>;
  }

  return (
    <div className="irrigation-section">
      {/* Toast Notifications */}
      <div className="notification-container">
        {toastNotifications.map(notification => (
          <Notification
            key={notification.id}
            message={notification.message}
            type={notification.type}
            onClose={() => removeToastNotification(notification.id)}
          />
        ))}
      </div>

      {/* Schedule Form Modal */}
      {showScheduleForm && (
        <ScheduleForm
          zones={zones}
          onSave={editingSchedule ? handleEditSchedule : handleCreateSchedule}
          onCancel={() => {
            setShowScheduleForm(false);
            setEditingSchedule(null);
          }}
          editSchedule={editingSchedule}
        />
      )}

      {/* Header */}
      <div className="section-header">
        <div className="header-main">
          <h2>Irrigation Control</h2>
          {zones.length > 0 && (
            <div className="zone-selector">
              <label htmlFor="zone-select">Select Zone: </label>
              <select 
                id="zone-select"
                value={selectedZoneId || ''}
                onChange={(e) => setSelectedZoneId(Number(e.target.value))}
                disabled={loading}
              >
                {zones.map(zone => (
                  <option key={zone.zone_id} value={zone.zone_id}>
                    {zone.zone_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        
        <div className="control-mode">
          <button className={`mode-btn ${!isManualMode ? 'active' : ''}`} onClick={() => setIsManualMode(false)}>
            Auto Mode
          </button>
          <button className={`mode-btn ${isManualMode ? 'active' : ''}`} onClick={() => setIsManualMode(true)}>
            Manual Mode
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <button className="action-btn primary" onClick={() => setShowScheduleForm(true)} disabled={loading}>
          ➕ Create Schedule
        </button>
        <button className="action-btn primary" onClick={triggerAutoModeCheck} disabled={loading || !selectedZoneId}>
          🔄 Check Auto Mode
        </button>
        <button className="action-btn secondary" onClick={fetchIrrigationData} disabled={loading}>
          🔄 Refresh Status
        </button>

        {Object.keys(activeIrrigations).length > 0 && (
          <button className="action-btn stop-all" onClick={handleStopAllIrrigation} disabled={loading}>
            🛑 Stop All Irrigation
          </button>
        )}
        
        {loading && <span className="loading-text">Updating...</span>}
      </div>

      {/* Active Auto Irrigations */}
      {!isManualMode && getActiveAutoIrrigations().length > 0 && (
        <div className="active-auto-irrigations">
          <h3>🚀 Active Auto Irrigations</h3>
          <div className="active-irrigations-grid">
            {getActiveAutoIrrigations().map(schedule => (
              <div key={schedule.id} className="active-irrigation-card">
                <div className="irrigation-header">
                  <h4>{schedule.zone_name}</h4>
                  <span className="auto-badge">AUTO</span>
                </div>
                <div className="irrigation-details">
                  <p><strong>Duration:</strong> {schedule.duration} seconds</p>
                  <p><strong>Time Remaining:</strong> {realTimeData.auto_remaining_time ? Math.ceil(realTimeData.auto_remaining_time / 1000) : 'Calculating...'}s</p>
                  <p><strong>Trigger:</strong> Low moisture ({getZoneStatus(schedule.zone_name)?.current_moisture}%)</p>
                </div>
                <button 
                  className="btn-stop"
                  onClick={() => handleStopIrrigation(schedule.zone_name)}
                  disabled={loading}
                >
                  🛑 Stop Irrigation
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Irrigation Controls */}
      {isManualMode && (
        <div className="manual-controls">
          <h3>Manual Irrigation Control</h3>
          {zones.length === 0 ? (
            <div className="no-data"><p>No irrigation zones configured.</p></div>
          ) : (
            <div className="zone-controls-grid">
              {zones.map(zone => {
                const zoneStatus = getZoneStatus(zone.zone_name);
                const remainingTime = getRemainingTime(zone.zone_name);
                
                return (
                  <div key={zone.zone_id} className="zone-control-card">
                    <div className="zone-header">
                      <h4>{zone.zone_name}</h4>
                      <span className="zone-area">{zone.area_sqm}m²</span>
                      {activeIrrigations[zone.zone_name] && (
                        <span className="irrigation-active-badge">
                          ● ACTIVE {remainingTime && `(${remainingTime}s)`}
                        </span>
                      )}
                    </div>
                    
                    <div className="zone-info">
                      <p><strong>Crop:</strong> {zone.crop_type || 'Not specified'}</p>
                      <p><strong>Soil:</strong> {zone.soil_type || 'Not specified'}</p>
                      <p><strong>Water Need:</strong> {zone.water_requirement}L/day</p>
                    </div>

                    <div className="current-status">
                      {zoneStatus ? (
                        <>
                          <p>Moisture: <strong>{zoneStatus.current_moisture}%</strong></p>
                          <p className={zoneStatus.needs_irrigation ? 'status-warning' : 'status-ok'}>
                            {zoneStatus.needs_irrigation ? '💧 Needs Water' : '✅ Adequate'}
                          </p>
                        </>
                      ) : (
                        <p className="status-unknown">No sensor data</p>
                      )}
                    </div>

                    <div className="irrigation-buttons">
                      {activeIrrigations[zone.zone_name] ? (
                        <button 
                          onClick={() => handleStopIrrigation(zone.zone_name)}
                          className="btn-stop"
                          disabled={loading}
                        >
                          🛑 Stop Irrigation
                        </button>
                      ) : (
                        <>
                          <button onClick={() => handleManualIrrigation(zone.zone_name, 300)} className="btn-primary" disabled={loading}>
                            Water 5 mins
                          </button>
                          <button onClick={() => handleManualIrrigation(zone.zone_name, 600)} className="btn-secondary" disabled={loading}>
                            Water 10 mins
                          </button>
                          <button onClick={() => handleManualIrrigation(zone.zone_name, 900)} className="btn-tertiary" disabled={loading}>
                            Water 15 mins
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Automatic Schedules */}
      {!isManualMode && (
        <div className="auto-schedules">
          <h3>Automatic Irrigation Schedules</h3>
          {schedules.length === 0 ? (
            <div className="no-schedules">
              <p>No irrigation schedules configured.</p>
              <button className="btn-primary" onClick={() => setShowScheduleForm(true)}>
                Create First Schedule
              </button>
            </div>
          ) : (
            <div className="schedules-list">
              {schedules.map(schedule => {
                const zoneStatus = getZoneStatus(schedule.zone_name);
                const isAutoMode = schedule.trigger_type === 'moisture';
                
                return (
                  <div key={schedule.id} className="schedule-card">
                    <div className="schedule-header">
                      <h4>{schedule.zone_name} - {schedule.name}</h4>
                      <div className="schedule-status">
                        <span className={`status-badge ${schedule.is_active ? 'active' : 'inactive'}`}>
                          {schedule.is_active ? 'Active' : 'Inactive'}
                        </span>
                        {isAutoMode && <span className="auto-mode-badge">🤖 AUTO</span>}
                      </div>
                    </div>
                    
                    <div className="schedule-details">
                      <div className="detail-row">
                        <label>Trigger Type:</label>
                        <span>{schedule.trigger_type}</span>
                      </div>
                      {isAutoMode && (
                        <div className="detail-row">
                          <label>Moisture Threshold:</label>
                          <span>{schedule.moisture_threshold}%</span>
                        </div>
                      )}
                      <div className="detail-row">
                        <label>Current Moisture:</label>
                        <span className={zoneStatus?.current_moisture < schedule.moisture_threshold ? 'warning' : 'ok'}>
                          {zoneStatus ? `${zoneStatus.current_moisture}%` : 'No data'}
                        </span>
                      </div>
                      <div className="detail-row">
                        <label>Duration:</label>
                        <span>{schedule.duration} seconds</span>
                      </div>
                      <div className="detail-row">
                        <label>Last Triggered:</label>
                        <span>
                          {schedule.last_triggered ? 
                            new Date(schedule.last_triggered).toLocaleString() : 
                            'Never'
                          }
                        </span>
                      </div>
                      <div className="detail-row">
                        <label>Auto Mode Status:</label>
                        <span className={zoneStatus?.needs_irrigation ? 'status-warning' : 'status-ok'}>
                          {zoneStatus?.needs_irrigation ? '🚰 Ready to irrigate' : '✅ Conditions met'}
                        </span>
                      </div>
                    </div>

                    <div className="schedule-actions">
                      <button className="btn-primary" onClick={() => {
                        setEditingSchedule(schedule);
                        setShowScheduleForm(true);
                      }}>
                        Edit
                      </button>
                      <button className="btn-secondary" onClick={() => toggleScheduleActive(schedule)}>
                        {schedule.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="btn-danger" onClick={() => handleDeleteSchedule(schedule.id)}>
                        Delete
                      </button>
                      {isAutoMode && (
                        <button className="btn-tertiary" onClick={() => triggerAutoModeCheckForZone(schedule.zone_id)}>
                          Test
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Current System Status */}
      <div className="system-status-overview">
        <h3>Current System Status</h3>
        {currentStatus.length === 0 ? (
          <div className="no-data"><p>No current status data available.</p></div>
        ) : (
          <div className="status-overview-grid">
            {currentStatus.map(status => (
              <div key={status.zone_id} className="status-overview-item">
                <h4>{status.zone_name}</h4>
                <div className="moisture-gauge">
                  <div className="gauge-fill" style={{ width: `${Math.min(status.current_moisture, 100)}%` }}></div>
                  <span className="gauge-text">{status.current_moisture}%</span>
                </div>
                <div className="threshold-info">Threshold: {status.moisture_threshold}%</div>
                <div className={`action-needed ${status.needs_irrigation ? 'yes' : 'no'}`}>
                  {status.needs_irrigation ? '🚰 Irrigation Needed' : '✅ OK'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default IrrigationSection;