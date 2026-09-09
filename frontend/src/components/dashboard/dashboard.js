import React, { useState, useEffect } from 'react';
import { useMediaQuery } from '@mui/material';
import { useAuth } from '../../context/AuthContext';
import HomeSection from './HomeSection';
import StatusSection from './StatusSection';
import IrrigationSection from './IrrigationSection';
import ReportsSection from './ReportsSection';
import SystemSettings from './SystemSettings';
import ProfileSettings from './ProfileSettings';
import MobileBottomNav from './MobileBottomNav';
import {
  Home as HomeIcon,
  Insights as InsightsIcon,
  CameraAlt as CameraIcon,
  WaterDrop as WaterDropIcon,
  BarChart as ReportsIcon,
  Settings as SettingsIcon,
  Person as ProfileIcon,
  Logout as LogoutIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Info as InfoIcon,
  Notifications as NotificationsIcon,
  SmartToy as SmartToyIcon,
  Spa as SpaIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
} from '@mui/icons-material';
import './Dashboard.css';
import './irrigation.css';
import './reports.css';
import './home.css';

import WeatherPanel from '../weather/WeatherPanel';
import AIRecommendationPanel from '../ai/AIRecommendationPanel';
import VisionMonitoringPanel from '../vision/VisionMonitoringPanel';
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
          {type === 'success' ? <CheckCircleIcon sx={{ fontSize: 18, color: '#2e7d32' }} /> : type === 'error' ? <CancelIcon sx={{ fontSize: 18, color: '#c04e37' }} /> : <InfoIcon sx={{ fontSize: 18, color: '#3c4e43' }} />}
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
          <NotificationsIcon sx={{ fontSize: 22, color: '#1e2722' }} />
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
                <div className="no-notifications-icon"><NotificationsIcon sx={{ fontSize: 32, color: '#8e9e94' }} /></div>
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
                      {notification.type === 'success' ? <CheckCircleIcon sx={{ fontSize: 18, color: '#2e7d32' }} /> : 
                       notification.type === 'error' ? <CancelIcon sx={{ fontSize: 18, color: '#c04e37' }} /> : <InfoIcon sx={{ fontSize: 18, color: '#3c4e43' }} />}
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
  const isMobile = useMediaQuery('(max-width:768px)');
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
                      gap: 1,
                      color: 'primary.main',
                      borderBottom: '2px solid',
                      borderColor: 'primary.main',
                      pb: 1
                    }}>
                      <SmartToyIcon sx={{ fontSize: 22 }} /> AI Irrigation Advisor
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

              {/* Vision Monitoring preview — full width, not zone-scoped.
                  A dedicated, focused page also exists at the 'vision'
                  section (sidebar + mobile quick-action tiles) for when
                  more room/history is needed than this home preview shows. */}
              <Box sx={{ mt: 3 }}>
                <VisionMonitoringPanel />
              </Box>
            </Box>
          );
      case 'status':
        return <StatusSection 
          zones={zones} 
          currentZoneId={currentZoneId} 
          {...sectionProps}
        />;
      case 'vision':
        return (
          <Box sx={{ px: { xs: 2, md: 0 }, py: { xs: 1.5, md: 0 } }}>
            <VisionMonitoringPanel />
          </Box>
        );
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
          <Typography variant="h6" component="h2" sx={{ fontWeight: 'bold', color: '#faf6f0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <SpaIcon sx={{ fontSize: 22 }} /> Smart Irrigation
          </Typography>
          {currentZone && (
            <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(250,246,240,0.1)', borderRadius: 1 }}>
              <Typography variant="caption" sx={{ color: '#faf6f0', fontWeight: 'bold' }}>
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
            startIcon={<HomeIcon sx={{ fontSize: 20 }} />}
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
            startIcon={<InsightsIcon sx={{ fontSize: 20 }} />}
          >
            System Status
          </Button>

          <Button 
            fullWidth
            className={`nav-item ${activeSection === 'vision' ? 'active' : ''}`}
            onClick={() => setActiveSection('vision')}
            sx={{ 
              justifyContent: 'flex-start', 
              color: 'white',
              textTransform: 'none',
              fontSize: '16px'
            }}
            startIcon={<CameraIcon sx={{ fontSize: 20 }} />}
          >
            Vision Monitoring
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
            startIcon={<WaterDropIcon sx={{ fontSize: 20 }} />}
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
            startIcon={<ReportsIcon sx={{ fontSize: 20 }} />}
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
            startIcon={<SettingsIcon sx={{ fontSize: 20 }} />}
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
            startIcon={<ProfileIcon sx={{ fontSize: 20 }} />}
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
            startIcon={<LogoutIcon sx={{ fontSize: 20 }} />}
          >
            Log Out
          </Button>
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="contact-info">
            <Typography variant="caption" display="block" sx={{ color: '#faf6f0', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PhoneIcon sx={{ fontSize: 14 }} /> Tel. +254-758861709
            </Typography>
            <Typography variant="caption" display="block" sx={{ color: '#faf6f0', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
              <EmailIcon sx={{ fontSize: 14 }} /> email: brandon.brad204@gmail.com
            </Typography>
          </div>
          <div className="copyright">
            <Typography variant="caption" display="block" sx={{ color: '#faf6f0', opacity: 0.7 }}>
              created by Brandon with bugs
            </Typography>
            <Typography variant="caption" display="block" sx={{ color: '#faf6f0', opacity: 0.7 }}>
              © 2025 All Rights Reserved
            </Typography>
          </div>
        </div>
      </div> 
    

     {/* Mobile bottom nav — separate component, only rendered on mobile.
          Desktop sidebar above is untouched; CSS hides it below 768px. */}
      {isMobile && (
        <MobileBottomNav
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onLogout={logout}
        />
      )} 

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