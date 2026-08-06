import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import HomeSection from './HomeSection';
import StatusSection from './StatusSection';
import IrrigationSection from './IrrigationSection';
import ReportsSection from './ReportsSection';
import SystemSettings from './SystemSettings';
import ProfileSettings from './ProfileSettings';
import './dashboard.css';
import './irrigation.css';
import './reports.css';
import './home.css';

import WeatherPanel from '../weather/WeatherPanel';
import AIRecommendationPanel from '../ai/AIRecommendationPanel';
import { zoneAPI, aiAPI } from '../../services/api';
import {
  Grid,
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Paper,
  CircularProgress,
  Alert,
  Snackbar,
  Badge
} from '@mui/material';

// Notification System Components
const Notification = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);

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

const NotificationCenter = ({ notifications, onClearAll, onRemoveNotification, onMarkAllAsRead, onMarkAsRead }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedNotification, setExpandedNotification] = useState(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
    }
    
    // Toggle expanded view for the notification
    if (expandedNotification === notification.id) {
      setExpandedNotification(null);
    } else {
      setExpandedNotification(notification.id);
    }
  };

  const handleCloseNotification = (e, notificationId) => {
    e.stopPropagation(); // Prevent triggering the click event
    onRemoveNotification(notificationId);
    if (expandedNotification === notificationId) {
      setExpandedNotification(null);
    }
  };

  const closeNotificationPanel = () => {
    setIsOpen(false);
    setExpandedNotification(null);
  };

  return (
    <div className="notification-center">
      <Badge 
        badgeContent={unreadCount} 
        color="error" 
        overlap="circular"
        sx={{ 
          '& .MuiBadge-badge': {
            fontSize: '12px',
            height: '20px',
            minWidth: '20px',
          }
        }}
      >
        <button 
          className="notification-center-toggle"
          onClick={() => setIsOpen(!isOpen)}
        >
          🔔
        </button>
      </Badge>

      {isOpen && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <div className="notification-panel-title">
              <h3>Notifications</h3>
              {unreadCount > 0 && (
                <span className="unread-badge">{unreadCount} unread</span>
              )}
            </div>
            <div className="notification-panel-actions">
              <button 
                className="close-panel-btn"
                onClick={closeNotificationPanel}
                title="Close notifications"
              >
                ×
              </button>
            </div>
          </div>
          
          <div className="notification-panel-controls">
            {unreadCount > 0 && (
              <button className="mark-read-btn" onClick={onMarkAllAsRead}>
                Mark all as read
              </button>
            )}
            {notifications.length > 0 && (
              <button className="clear-all-btn" onClick={onClearAll}>
                Clear All
              </button>
            )}
          </div>
          
          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="no-notifications">
                <div className="no-notifications-icon">🔔</div>
                <p>No notifications yet</p>
                <small>System notifications will appear here</small>
              </div>
            ) : (
              notifications.map(notification => (
                <div 
                  key={notification.id} 
                  className={`notification-item notification-${notification.type} ${!notification.read ? 'unread' : ''} ${expandedNotification === notification.id ? 'expanded' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-item-content">
                    <span className="notification-icon">
                      {notification.type === 'success' ? '✅' : 
                       notification.type === 'error' ? '❌' : 'ℹ️'}
                    </span>
                    <div className="notification-text">
                      <p className="notification-message">
                        {expandedNotification === notification.id 
                          ? notification.message 
                          : notification.message.length > 100 
                            ? `${notification.message.substring(0, 100)}...` 
                            : notification.message
                        }
                      </p>
                      <small className="notification-time">
                        {new Date(notification.timestamp).toLocaleTimeString()}
                      </small>
                    </div>
                  </div>
                  <button 
                    className="notification-remove"
                    onClick={(e) => handleCloseNotification(e, notification.id)}
                    title="Close notification"
                  >
                    ×
                  </button>
                  {!notification.read && <div className="unread-dot"></div>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
const Dashboard = () => {
  const [activeSection, setActiveSection] = useState('home');
  const [zones, setZones] = useState([]);
  const [currentZoneId, setCurrentZoneId] = useState(null);
  const [loadingZones, setLoadingZones] = useState(true);
  const [zoneError, setZoneError] = useState(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const { currentUser, logout } = useAuth();

  // Notification states
  const [notifications, setNotifications] = useState([]);
  const [toastNotifications, setToastNotifications] = useState([]);

  // Add notification functions
  const addNotification = (message, type = 'info') => {
    const newNotification = {
      id: Date.now() + Math.random(),
      message,
      type,
      timestamp: new Date(),
      read: false
    };
    
    // Add to toast (popup) notifications
    setToastNotifications(prev => [...prev, newNotification]);
    
    // Add to notification center (persistent)
    setNotifications(prev => [newNotification, ...prev]);
  };

  const removeToastNotification = (id) => {
    setToastNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  const markAsRead = (id) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === id ? { ...notification, read: true } : notification
      )
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => 
      prev.map(notification => ({ ...notification, read: true }))
    );
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  // Fetch user's zones on component mount
  useEffect(() => {
    const fetchUserZones = async () => {
      try {
        setLoadingZones(true);
        setZoneError(null);
        const response = await zoneAPI.getUserZones();
        console.log('Zones API response:', response);
        
        if (response.data.success) {
          const zonesData = response.data.zones || response.data;
          setZones(zonesData);
          
          if (zonesData && zonesData.length > 0) {
            setCurrentZoneId(zonesData[0].zone_id || zonesData[0].id);
            addNotification('Zones loaded successfully', 'success');
          } else {
            setZoneError('No irrigation zones configured');
            addNotification('No irrigation zones found. Please configure zones in System Settings.', 'info');
          }
        } else {
          setZoneError(response.data.error || 'Failed to load zones');
          addNotification('Failed to load irrigation zones', 'error');
        }
      } catch (error) {
        console.error('Error fetching zones:', error);
        setZoneError('Failed to connect to server. Using demo zones.');
        setZones([
          { zone_id: 1, zone_name: 'Front Lawn', location: 'Front Yard' },
          { zone_id: 2, zone_name: 'Vegetable Garden', location: 'Back Yard' },
          { zone_id: 3, zone_name: 'Flower Beds', location: 'Side Yard' }
        ]);
        setCurrentZoneId(1);
        addNotification('Using demo data - connection to server failed', 'warning');
      } finally {
        setLoadingZones(false);
      }
    };

    if (currentUser) {
      fetchUserZones();
      addNotification(`Welcome back, ${currentUser.username || 'User'}!`, 'success');
    }
  }, [currentUser]);

  // Add global notification handler for child components
  useEffect(() => {
    // Make addNotification available globally for child components
    window.dashboardNotifications = {
      addNotification,
      removeNotification,
      markAsRead
    };

    return () => {
      delete window.dashboardNotifications;
    };
  }, []);

  const renderActiveSection = () => {
    const sectionProps = {
      // Pass notification functions to all sections
      onNotification: addNotification,
      notifications: {
        add: addNotification,
        remove: removeNotification,
        markAsRead: markAsRead
      }
    };

    switch (activeSection) {
      case 'home':
         return (
            <Box>
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

              <Grid container spacing={3}>
                {/* Main Content - 8 columns */}
                <Grid item xs={12} md={8}>
                  <HomeSection 
                    currentUser={currentUser} 
                    onSectionChange={setActiveSection} 
                    {...sectionProps}
                  />
                  
                  {/* AI Recommendation Panel Section */}
                  <Paper elevation={3} sx={{ p: 3, mt: 3 }}>
                    <Typography variant="h5" gutterBottom sx={{ 
                      display: 'flex', 
                      alignItems: 'center',
                      color: 'primary.main',
                      borderBottom: '2px solid',
                      borderColor: 'primary.main',
                      pb: 1
                    }}>
                      🤖 AI Irrigation Advisor
                    </Typography>
                    
                    {loadingZones ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
                        <CircularProgress size={24} />
                        <Typography variant="body1" sx={{ ml: 2 }}>
                          Loading irrigation zones...
                        </Typography>
                      </Box>
                    ) : zoneError ? (
                      <Alert severity="warning" sx={{ mb: 2 }}>
                        {zoneError}
                      </Alert>
                    ) : zones.length > 0 ? (
                      <Box sx={{ mb: 3 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel id="zone-select-label">Select Irrigation Zone</InputLabel>
                          <Select
                            labelId="zone-select-label"
                            value={currentZoneId || ''}
                            label="Select Irrigation Zone"
                            onChange={(e) => setCurrentZoneId(e.target.value)}
                          >
                            {zones.map(zone => (
                              <MenuItem key={zone.zone_id} value={zone.zone_id}>
                                {zone.zone_name} 
                                {zone.current_moisture && ` (${zone.current_moisture}% moisture)`}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>
                    ) : (
                      <Box sx={{ textAlign: 'center', py: 3 }}>
                        <Typography variant="body1" color="text.secondary" gutterBottom>
                          No irrigation zones configured.
                        </Typography>
                        <Button 
                          variant="contained" 
                          onClick={() => setActiveSection('system-settings')}
                          sx={{ mt: 1 }}
                        >
                          Configure Zones in System Settings
                        </Button>
                      </Box>
                    )}
                    
                    {/* AI Recommendation Panel */}
                    {currentZoneId && zones.length > 0 && (
                      <AIRecommendationPanel 
                        zoneId={currentZoneId} 
                        zoneName={zones.find(z => z.zone_id === currentZoneId)?.zone_name}
                        onNotification={addNotification}
                      />
                    )}
                  </Paper>
                </Grid>

                {/* Weather Panel - 4 columns */}
                <Grid item xs={12} md={4}>
                  <WeatherPanel onNotification={addNotification} />
                </Grid>
              </Grid>
            </Box>
          );
      case 'status':
        return <StatusSection 
          zones={zones} 
          currentZoneId={currentZoneId} 
          {...sectionProps}
        />;
      case 'irrigation':
        return <IrrigationSection 
          zones={zones} 
          currentZoneId={currentZoneId} 
          onZoneChange={setCurrentZoneId}
          {...sectionProps}
        />;
      case 'reports':
        return <ReportsSection 
          zones={zones} 
          currentZoneId={currentZoneId} 
          {...sectionProps}
        />;
      case 'system-settings':
        return <SystemSettings 
          zones={zones} 
          onZonesUpdate={setZones} 
          {...sectionProps}
        />;
      case 'profile-settings':
        return <ProfileSettings 
          currentUser={currentUser} 
          {...sectionProps}
        />;
      default:
        return <HomeSection 
          currentUser={currentUser} 
          onSectionChange={setActiveSection} 
          {...sectionProps}
        />;
    }
  };

  // Get current zone name for display
  const currentZone = zones.find(z => (z.zone_id || z.id) === currentZoneId);

  return (
    <div className="dashboard-container">
      {/* Toast Notifications Container */}
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

      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <Typography variant="h6" component="h2" sx={{ fontWeight: 'bold', color: 'black' }}>
            🌱 Smart Irrigation
          </Typography>
          {currentZone && (
            <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 1 }}>
              <Typography variant="caption" sx={{ color: 'black', fontWeight: 'bold' }}>
                Currently Irrigated Zone: {currentZone.zone_name || currentZone.name}
              </Typography>
            </Box>
          )}
        </div>
        
        <nav className="sidebar-nav">
          <Button 
            fullWidth
            className={`nav-item ${activeSection === 'home' ? 'active' : ''}`}
            onClick={() => setActiveSection('home')}
            sx={{ 
              justifyContent: 'flex-start', 
              color: 'white',
              textTransform: 'none',
              fontSize: '16px'
            }}
            startIcon={<span>🏠</span>}
          >
            Home
          </Button>
          
          <Button 
            fullWidth
            className={`nav-item ${activeSection === 'status' ? 'active' : ''}`}
            onClick={() => setActiveSection('status')}
            sx={{ 
              justifyContent: 'flex-start', 
              color: 'white',
              textTransform: 'none',
              fontSize: '16px'
            }}
            startIcon={<span>📊</span>}
          >
            System Status
          </Button>
          
          <Button 
            fullWidth
            className={`nav-item ${activeSection === 'irrigation' ? 'active' : ''}`}
            onClick={() => setActiveSection('irrigation')}
            sx={{ 
              justifyContent: 'flex-start', 
              color: 'white',
              textTransform: 'none',
              fontSize: '16px'
            }}
            startIcon={<span>💧</span>}
          >
            Irrigation Control
          </Button>
          
          <Button 
            fullWidth
            className={`nav-item ${activeSection === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveSection('reports')}
            sx={{ 
              justifyContent: 'flex-start', 
              color: 'white',
              textTransform: 'none',
              fontSize: '16px'
            }}
            startIcon={<span>📈</span>}
          >
            Reports & Analytics
          </Button>
          
          <Button 
            fullWidth
            className={`nav-item ${activeSection === 'system-settings' ? 'active' : ''}`}
            onClick={() => setActiveSection('system-settings')}
            sx={{ 
              justifyContent: 'flex-start', 
              color: 'white',
              textTransform: 'none',
              fontSize: '16px'
            }}
            startIcon={<span>⚙️</span>}
          >
            System Settings
          </Button>
          
          <Button 
            fullWidth
            className={`nav-item ${activeSection === 'profile-settings' ? 'active' : ''}`}
            onClick={() => setActiveSection('profile-settings')}
            sx={{ 
              justifyContent: 'flex-start', 
              color: 'white',
              textTransform: 'none',
              fontSize: '16px'
            }}
            startIcon={<span>👤</span>}
          >
            Profile Settings
          </Button>
          
          <Button 
            fullWidth
            className="nav-item logout"
            onClick={logout}
            sx={{ 
              justifyContent: 'flex-start', 
              color: 'white',
              textTransform: 'none',
              fontSize: '16px',
              mt: 2
            }}
            startIcon={<span>🚪</span>}
          >
            Log Out
          </Button>
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="contact-info">
            <Typography variant="caption" display="block" sx={{ color: 'black' }}>
              📞 Tel. +254-758861709
            </Typography>
            <Typography variant="caption" display="block" sx={{ color: 'black' }}>
              📧 email: brandon.brad204@gmail.com
            </Typography>
          </div>
          <div className="copyright">
            <Typography variant="caption" display="block" sx={{ color: 'black', opacity: 0.8 }}>
              created by Brandon with bugs
            </Typography>
            <Typography variant="caption" display="block" sx={{ color: 'black', opacity: 0.8 }}>
              © 2025 All Rights Reserved
            </Typography>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-panel">
        <header className="main-header">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="h6">
              {currentUser?.username || 'User'}
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                bgcolor: 'primary.main', 
                color: 'white', 
                px: 1, 
                py: 0.5, 
                borderRadius: 1 
              }}
            >
              {currentUser?.role || 'user'}
            </Typography>
            
            {/* Notification Center in Header */}
            <NotificationCenter
              notifications={notifications}
              onClearAll={clearAllNotifications}
              onRemoveNotification={removeNotification}
              onMarkAllAsRead={markAllAsRead}
              onMarkAsRead={markAsRead}
            />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
          </Typography>
        </header>

        <div className="main-content">
          {renderActiveSection()}
        </div>
      </div>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        message="Zone data loaded successfully"
      />
    </div>
  );
};

export default Dashboard;