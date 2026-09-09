import React, { useState, useEffect } from 'react';
import { systemAPI, zoneAPI, notificationAPI } from '../../services/api';
import {
  Settings as SettingsIcon,
  WaterDrop as WaterDropIcon,
  Map as MapIcon,
  Notifications as NotificationsIcon,
  SmartToy as SmartToyIcon,
} from '@mui/icons-material';

const SystemSettings = () => {
  const [settings, setSettings] = useState({});
  const [zones, setZones] = useState([]);
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [notificationMethods, setNotificationMethods] = useState({
    email: false,
    sms: false,
    push: false,
    web: true
  });
  const [testingNotification, setTestingNotification] = useState(null);

  useEffect(() => {
    fetchSystemData();
    fetchNotificationPreferences();
  }, []);

  const fetchSystemData = async () => {
    try {
      const [settingsResponse, zonesResponse] = await Promise.all([
        systemAPI.getSettings(),
        systemAPI.getZones()
      ]);
      
      const settingsData = settingsResponse?.data || settingsResponse || {};
      const zonesData = zonesResponse?.data?.data || zonesResponse?.data || zonesResponse || [];
      
      setSettings(settingsData);
      setZones(zonesData);
    } catch (error) {
      console.error('Error fetching system data:', error);
    }
  };

  const fetchNotificationPreferences = async () => {
    try {
      const response = await notificationAPI.getNotificationPreferences();
      const preferences = response.data || {};
      
      if (preferences.notification_methods) {
        setNotificationMethods(preferences.notification_methods);
      }
    } catch (error) {
      console.error('Error fetching notification preferences:', error);
    }
  };

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleNotificationMethodChange = async (method, enabled) => {
    const updatedMethods = {
      ...notificationMethods,
      [method]: enabled
    };
    
    setNotificationMethods(updatedMethods);

    // Save preferences immediately
    try {
      await notificationAPI.updateNotificationPreferences({
        notification_methods: updatedMethods
      });
    } catch (error) {
      console.error('Error updating notification preferences:', error);
    }
  };

  const handleZoneChange = async (zoneId, field, value) => {
    try {
      setZones(prev => prev.map(zone => 
        zone.zone_id === zoneId ? { ...zone, [field]: value } : zone
      ));

      const zoneToUpdate = zones.find(zone => zone.zone_id === zoneId);
      if (zoneToUpdate) {
        const updateData = {
          ...zoneToUpdate,
          [field]: field === 'moisture_threshold' || field === 'water_requirement' 
            ? parseInt(value) 
            : field === 'is_active' 
            ? value === 'true'
            : value
        };
        
        await zoneAPI.updateZone(zoneId, updateData);
      }
    } catch (error) {
      console.error('Error updating zone:', error);
      alert('Failed to update zone settings');
      fetchSystemData();
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const settingsToSave = {
        ...settings,
        notificationMethods,
        lastUpdated: new Date().toISOString()
      };
      
      await systemAPI.updateSettings(settingsToSave);
      alert('Settings saved successfully!');
      applySettings(settingsToSave);
      
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const applySettings = (newSettings) => {
    console.log('Applying new settings:', newSettings);
    
    if (newSettings.defaultDuration) {
      console.log(`Setting default irrigation duration to ${newSettings.defaultDuration} minutes`);
    }
    
    if (newSettings.maxDailyWater) {
      console.log(`Setting maximum daily water usage to ${newSettings.maxDailyWater} liters`);
    }
    
    if (newSettings.minInterval) {
      console.log(`Setting minimum irrigation interval to ${newSettings.minInterval} hours`);
    }
    
    if (newSettings.lowWaterAlert) {
      console.log(`Setting low water alert threshold to ${newSettings.lowWaterAlert}%`);
    }
    
    if (newSettings.confidenceThreshold) {
      console.log(`Setting AI confidence threshold to ${newSettings.confidenceThreshold}%`);
    }
    
    if (newSettings.notificationMethods) {
      console.log('Notification methods updated:', newSettings.notificationMethods);
    }
  };

  const handleResetDefaults = async () => {
    if (window.confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      try {
        const defaultSettings = {
          weatherApiKey: '',
          dataRetention: 90,
          defaultDuration: 10,
          maxDailyWater: 1000,
          minInterval: 4,
          smartIrrigation: true,
          lowWaterAlert: 20,
          sensorAlert: true,
          confidenceThreshold: 75,
          learningMode: 'active',
          autoApply: false,
          notificationMethods: {
            email: false,
            sms: false,
            push: false,
            web: true
          }
        };
        
        await systemAPI.updateSettings(defaultSettings);
        setSettings(defaultSettings);
        setNotificationMethods(defaultSettings.notificationMethods);
        
        // Reset notification preferences
        await notificationAPI.updateNotificationPreferences({
          notification_methods: defaultSettings.notificationMethods
        });
        
        alert('Settings reset to defaults successfully!');
        
      } catch (error) {
        console.error('Error resetting settings:', error);
        alert('Failed to reset settings');
      }
    }
  };

  const testNotification = async (type) => {
    setTestingNotification(type);
    try {
      const response = await notificationAPI.testNotification(type);
      if (response.data.success) {
        alert(`${type.charAt(0).toUpperCase() + type.slice(1)} test notification sent successfully!`);
      } else {
        alert(`Failed to send ${type} test notification: ${response.data.error}`);
      }
    } catch (error) {
      console.error(`Error testing ${type} notification:`, error);
      alert(`Failed to test ${type} notification. Please check your configuration.`);
    } finally {
      setTestingNotification(null);
    }
  };

  const sendSystemAlert = async (alertType, details) => {
    try {
      const response = await notificationAPI.sendSystemAlert({
        alert_type: alertType,
        details: details
      });
      
      if (response.data.success) {
        alert('System alert sent successfully!');
      } else {
        alert(`Failed to send system alert: ${response.data.error}`);
      }
    } catch (error) {
      console.error('Error sending system alert:', error);
      alert('Failed to send system alert. Admin access required.');
    }
  };

  const tabs = [
    { id: 'general', name: 'General Settings', icon: <SettingsIcon sx={{ fontSize: 18 }} /> },
    { id: 'irrigation', name: 'Irrigation', icon: <WaterDropIcon sx={{ fontSize: 18 }} /> },
    { id: 'zones', name: 'Zones', icon: <MapIcon sx={{ fontSize: 18 }} /> },
    { id: 'alerts', name: 'Alerts & Notifications', icon: <NotificationsIcon sx={{ fontSize: 18 }} /> },
    { id: 'ai', name: 'AI Settings', icon: <SmartToyIcon sx={{ fontSize: 18 }} /> }
  ];
  const renderTabContent = () => {
     switch (activeTab) {
      case 'general':
        return (
          <div className="settings-tab">
            <h3>General System Settings</h3>
            <div className="settings-group">
              <div className="setting-item">
                <label>System Name</label>
                <input 
                  type="text" 
                  value="Smart Irrigation System"
                  disabled
                  className="disabled-input"
                />
                <small className="help-text">System name cannot be changed</small>
              </div>
              <div className="setting-item">
                <label>Weather API Key</label>
                <input 
                  type="password" 
                  value={settings.weatherApiKey || ''}
                  onChange={(e) => handleSettingChange('weatherApiKey', e.target.value)}
                  placeholder="Enter your weather API key"
                />
                <small className="help-text">Required for weather-based irrigation adjustments</small>
              </div>
              <div className="setting-item">
                <label>Data Retention (Days)</label>
                <input 
                  type="number" 
                  value={settings.dataRetention || 90}
                  onChange={(e) => handleSettingChange('dataRetention', parseInt(e.target.value))}
                  min="30"
                  max="365"
                />
                <small className="help-text">How long to keep historical data</small>
              </div>
            </div>
          </div>
        );

      case 'irrigation':
        return (
          <div className="settings-tab">
            <h3>Irrigation Settings</h3>
            <div className="settings-group">
              <div className="setting-item">
                <label>Default Irrigation Duration (minutes)</label>
                <input 
                  type="number" 
                  value={settings.defaultDuration || 10}
                  onChange={(e) => handleSettingChange('defaultDuration', parseInt(e.target.value))}
                  min="1"
                  max="60"
                />
                <small className="help-text">Default time for manual irrigation</small>
              </div>
              <div className="setting-item">
                <label>Maximum Daily Water Usage (liters)</label>
                <input 
                  type="number" 
                  value={settings.maxDailyWater || 1000}
                  onChange={(e) => handleSettingChange('maxDailyWater', parseInt(e.target.value))}
                  min="100"
                  max="5000"
                />
                <small className="help-text">Safety limit to prevent over-watering</small>
              </div>
              <div className="setting-item">
                <label>Minimum Interval Between Irrigations (hours)</label>
                <input 
                  type="number" 
                  value={settings.minInterval || 4}
                  onChange={(e) => handleSettingChange('minInterval', parseInt(e.target.value))}
                  min="1"
                  max="24"
                />
                <small className="help-text">Prevent too frequent watering</small>
              </div>
              <div className="setting-item">
                <label>Enable Smart Irrigation</label>
                <select 
                  value={settings.smartIrrigation !== false}
                  onChange={(e) => handleSettingChange('smartIrrigation', e.target.value === 'true')}
                >
                  <option value={true}>Enabled</option>
                  <option value={false}>Disabled</option>
                </select>
                <small className="help-text">Use AI and sensor data for automatic irrigation</small>
              </div>
            </div>
          </div>
        );

      case 'zones':
        return (
          <div className="settings-tab">
            <h3>Zone Management</h3>
            <div className="zones-list">
              {zones.length > 0 ? (
                zones.map(zone => (
                  <div key={zone.zone_id} className="zone-setting">
                    <h4>{zone.zone_name}</h4>
                    <div className="zone-settings-grid">
                      <div className="setting-item">
                        <label>Moisture Threshold (%)</label>
                        <input 
                          type="number" 
                          value={zone.moisture_threshold || 30}
                          onChange={(e) => handleZoneChange(zone.zone_id, 'moisture_threshold', e.target.value)}
                          min="10"
                          max="80"
                        />
                        <small className="help-text">Trigger irrigation below this level</small>
                      </div>
                      <div className="setting-item">
                        <label>Water Requirement (L/day)</label>
                        <input 
                          type="number" 
                          value={zone.water_requirement || 25}
                          onChange={(e) => handleZoneChange(zone.zone_id, 'water_requirement', e.target.value)}
                          min="5"
                          max="200"
                        />
                        <small className="help-text">Estimated daily water needs</small>
                      </div>
                      <div className="setting-item">
                        <label>Zone Active</label>
                        <select 
                          value={zone.is_active !== false}
                          onChange={(e) => handleZoneChange(zone.zone_id, 'is_active', e.target.value === 'true')}
                        >
                          <option value={true}>Active</option>
                          <option value={false}>Inactive</option>
                        </select>
                        <small className="help-text">Enable/disable this zone</small>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="no-zones">No zones configured</div>
              )}
            </div>
          </div>
        );
      
      case 'alerts':
        return (
          <div className="settings-tab">
            <h3>Alert & Notification Settings</h3>
            <div className="settings-group">
              <div className="setting-item">
                <label>Low Water Level Alert (%)</label>
                <input 
                  type="number" 
                  value={settings.lowWaterAlert || 20}
                  onChange={(e) => handleSettingChange('lowWaterAlert', parseInt(e.target.value))}
                  min="5"
                  max="50"
                />
                <small className="help-text">Alert when water tank level drops below this percentage</small>
              </div>
              <div className="setting-item">
                <label>Sensor Failure Alert</label>
                <select 
                  value={settings.sensorAlert !== false}
                  onChange={(e) => handleSettingChange('sensorAlert', e.target.value === 'true')}
                >
                  <option value={true}>Enabled</option>
                  <option value={false}>Disabled</option>
                </select>
                <small className="help-text">Receive alerts when sensors stop reporting</small>
              </div>
              
              <div className="notification-methods">
                <h4>Notification Methods</h4>
                <div className="notification-options">
                  <div className="notification-option">
                    <label>
                      <input 
                        type="checkbox"
                        checked={notificationMethods.web}
                        onChange={(e) => handleNotificationMethodChange('web', e.target.checked)}
                      />
                      Web Dashboard
                    </label>
                    <small>Always enabled for critical alerts</small>
                  </div>
                  <div className="notification-option">
                    <label>
                      <input 
                        type="checkbox"
                        checked={notificationMethods.email}
                        onChange={(e) => handleNotificationMethodChange('email', e.target.checked)}
                      />
                      Email Notifications
                    </label>
                    <button 
                      className="test-btn"
                      onClick={() => testNotification('email')}
                      disabled={!notificationMethods.email || testingNotification === 'email'}
                    >
                      {testingNotification === 'email' ? 'Testing...' : 'Test'}
                    </button>
                  </div>
                  <div className="notification-option">
                    <label>
                      <input 
                        type="checkbox"
                        checked={notificationMethods.sms}
                        onChange={(e) => handleNotificationMethodChange('sms', e.target.checked)}
                      />
                      SMS Notifications
                    </label>
                    <button 
                      className="test-btn"
                      onClick={() => testNotification('sms')}
                      disabled={!notificationMethods.sms || testingNotification === 'sms'}
                    >
                      {testingNotification === 'sms' ? 'Testing...' : 'Test'}
                    </button>
                  </div>
                  <div className="notification-option">
                    <label>
                      <input 
                        type="checkbox"
                        checked={notificationMethods.push}
                        onChange={(e) => handleNotificationMethodChange('push', e.target.checked)}
                      />
                      Push Notifications
                    </label>
                    <button 
                      className="test-btn"
                      onClick={() => testNotification('push')}
                      disabled={!notificationMethods.push || testingNotification === 'push'}
                    >
                      {testingNotification === 'push' ? 'Testing...' : 'Test'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Admin-only system alert testing */}
              <div className="system-alerts">
                <h4>System Alert Testing (Admin Only)</h4>
                <div className="alert-test-buttons">
                  <button 
                    className="btn-warning"
                    onClick={() => sendSystemAlert('low_water', '15%')}
                  >
                    Test Low Water Alert
                  </button>
                  <button 
                    className="btn-warning"
                    onClick={() => sendSystemAlert('sensor_failure', 'Zone 1 Moisture Sensor')}
                  >
                    Test Sensor Failure
                  </button>
                  <button 
                    className="btn-warning"
                    onClick={() => sendSystemAlert('moisture_low', '18%')}
                  >
                    Test Low Moisture
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

          case 'ai':
        return (
          <div className="settings-tab">
            <h3>AI & Machine Learning</h3>
            <div className="settings-group">
              <div className="setting-item">
                <label>AI Model Version</label>
                <input 
                  type="text" 
                  value={settings.aiModelVersion || '1.0'}
                  disabled
                  className="disabled-input"
                />
                <small className="help-text">Current AI model version</small>
              </div>
              <div className="setting-item">
                <label>Learning Mode</label>
                <select 
                  value={settings.learningMode || 'active'}
                  onChange={(e) => handleSettingChange('learningMode', e.target.value)}
                >
                  <option value="active">Active Learning</option>
                  <option value="passive">Passive Learning</option>
                  <option value="disabled">Disabled</option>
                </select>
                <small className="help-text">Active learning adapts to your patterns</small>
              </div>
              <div className="setting-item">
                <label>Recommendation Confidence Threshold (%)</label>
                <input 
                  type="number" 
                  value={settings.confidenceThreshold || 75}
                  onChange={(e) => handleSettingChange('confidenceThreshold', parseInt(e.target.value))}
                  min="50"
                  max="95"
                />
                <small className="help-text">Only show recommendations above this confidence level</small>
              </div>
              <div className="setting-item">
                <label>Auto-apply High Confidence Recommendations</label>
                <select 
                  value={settings.autoApply || false}
                  onChange={(e) => handleSettingChange('autoApply', e.target.value === 'true')}
                >
                  <option value={true}>Enabled</option>
                  <option value={false}>Disabled</option>
                </select>
                <small className="help-text">Automatically apply recommendations with 90%+ confidence</small>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="system-settings">
      <h2>System Settings</h2>
      
      <div className="settings-layout">
        <div className="settings-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-name">{tab.name}</span>
            </button>
          ))}
        </div>

        <div className="settings-content">
          {renderTabContent()}
          
          <div className="settings-actions">
            <button 
              className="btn-primary"
              onClick={handleSaveSettings}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            <button 
              className="btn-secondary"
              onClick={handleResetDefaults}
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemSettings;