import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import HomeSection from './HomeSection';
import StatusSection from './StatusSection';
import IrrigationSection from './IrrigationSection';
import ReportsSection from './ReportsSection';
import SystemSettings from './SystemSettings';
import ProfileSettings from './ProfileSettings';
import VisionMonitoringSection from './VisionMonitoringSection';
import './dashboard.css';
import './irrigation.css';
import './reports.css';
import './home.css';

import AIRecommendationPanel from '../ai/AIRecommendationPanel';
import { zoneAPI } from '../../services/api';
import { nyuzaColors as c } from '../../Theme';
import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  CircularProgress,
  Alert,
  Snackbar,
  Badge,
  IconButton,
  Stack,
} from '@mui/material';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import WaterDropRoundedIcon from '@mui/icons-material/WaterDropRounded';
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import EnergySavingsLeafRoundedIcon from '@mui/icons-material/EnergySavingsLeafRounded';

import DoneRoundedIcon from '@mui/icons-material/DoneRounded';
import ClearRoundedIcon from '@mui/icons-material/ClearRounded';
import DeleteSweepRoundedIcon from '@mui/icons-material/DeleteSweepRounded';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import {
  Popover,
  List,
  ListItemButton,
  Divider,
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
    <Alert
      severity={type === 'success' || type === 'error' ? type : 'info'}
      onClose={onClose}
      variant="filled"
      sx={{ boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 280, alignItems: 'center' }}
    >
      {message}
    </Alert>
  );
};

const NotificationCenter = ({ notifications, onClearAll, onRemoveNotification, onMarkAllAsRead, onMarkAsRead }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const unreadCount = notifications.filter(n => !n.read).length;
  const isOpen = Boolean(anchorEl);

  const handleNotificationClick = (notification) => {
    if (!notification.read) onMarkAsRead(notification.id);
    setExpandedId(expandedId === notification.id ? null : notification.id);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setExpandedId(null);
  };

  const typeColor = (type) => (type === 'success' ? c.primaryGreen : type === 'error' ? c.danger : c.textMuted);

  return (
    <>
      <Badge
        badgeContent={unreadCount}
        color="error"
        overlap="circular"
        sx={{ '& .MuiBadge-badge': { fontSize: '11px', height: '18px', minWidth: '18px' } }}
      >
        <IconButton
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ bgcolor: 'white', border: `1px solid ${c.border}`, width: 36, height: 36 }}
        >
          <NotificationsRoundedIcon sx={{ fontSize: 18, color: c.textDark }} />
        </IconButton>
      </Badge>

      <Popover
        open={isOpen}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { width: 360, maxHeight: 460, borderRadius: 3, mt: 1, border: `1px solid ${c.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' } }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography sx={{ fontWeight: 700, color: c.textDark }}>Notifications</Typography>
            {unreadCount > 0 && (
              <Box sx={{ bgcolor: c.chipGreenBg, color: c.primaryGreen, fontSize: 11, fontWeight: 700, px: 1, py: 0.2, borderRadius: 5 }}>
                {unreadCount} unread
              </Box>
            )}
          </Stack>
        </Stack>
        {notifications.length > 0 && (
          <>
            <Stack direction="row" spacing={2} sx={{ px: 2, pb: 1 }}>
              {unreadCount > 0 && (
                <Button size="small" startIcon={<DoneRoundedIcon sx={{ fontSize: 15 }} />} onClick={onMarkAllAsRead} sx={{ color: c.primaryGreen, minWidth: 0, fontSize: 12.5 }}>
                  Mark all read
                </Button>
              )}
              <Button size="small" startIcon={<DeleteSweepRoundedIcon sx={{ fontSize: 15 }} />} onClick={onClearAll} sx={{ color: c.textMuted, minWidth: 0, fontSize: 12.5 }}>
                Clear all
              </Button>
            </Stack>
            <Divider />
          </>
        )}
        <List sx={{ p: 0, overflowY: 'auto', maxHeight: 360 }}>
          {notifications.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 5, px: 3 }}>
              <NotificationsNoneRoundedIcon sx={{ fontSize: 32, color: c.border, mb: 1 }} />
              <Typography variant="body2" sx={{ color: c.textBody, fontWeight: 600 }}>No notifications yet</Typography>
              <Typography variant="caption" sx={{ color: c.textMuted }}>System notifications will appear here</Typography>
            </Box>
          ) : (
            notifications.map((notification, i) => (
              <React.Fragment key={notification.id}>
                <ListItemButton
                  onClick={() => handleNotificationClick(notification)}
                  sx={{ alignItems: 'flex-start', gap: 1.2, py: 1.3, px: 2, bgcolor: notification.read ? 'transparent' : c.background }}
                >
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: typeColor(notification.type), mt: 0.7, flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ color: c.textDark, fontWeight: notification.read ? 500 : 700 }}>
                      {expandedId === notification.id || notification.message.length <= 100
                        ? notification.message
                        : `${notification.message.substring(0, 100)}...`}
                    </Typography>
                    <Typography variant="caption" sx={{ color: c.textMuted }}>
                      {new Date(notification.timestamp).toLocaleTimeString()}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onRemoveNotification(notification.id); if (expandedId === notification.id) setExpandedId(null); }}
                  >
                    <ClearRoundedIcon sx={{ fontSize: 15, color: c.textMuted }} />
                  </IconButton>
                </ListItemButton>
                {i < notifications.length - 1 && <Divider />}
              </React.Fragment>
            ))
          )}
        </List>
      </Popover>
    </>
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
              <HomeSection
                currentUser={currentUser}
                onSectionChange={setActiveSection}
                {...sectionProps}
              />

              {/* AI Advisor */}
              <Box sx={{ mt: 4 }}>
                <Typography variant="h5" sx={{ fontWeight: 800, color: c.textDark, textAlign: 'center', mb: 2.5 }}>
                  AI Advisor
                </Typography>
                <Box sx={{ bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 4, p: 3, maxWidth: 800, mx: 'auto' }}>
                  {loadingZones ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 3 }}>
                      <CircularProgress size={22} sx={{ color: c.primaryGreen }} />
                      <Typography variant="body2" sx={{ ml: 2, color: c.textBody }}>
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
                      <Typography variant="body2" sx={{ color: c.textBody, mb: 1.5 }}>
                        No irrigation zones configured.
                      </Typography>
                      <Button
                        variant="contained"
                        onClick={() => setActiveSection('system-settings')}
                        sx={{ bgcolor: c.sidebarActive, '&:hover': { bgcolor: '#152018' } }}
                      >
                        Configure Zones in System Settings
                      </Button>
                    </Box>
                  )}

                  {currentZoneId && zones.length > 0 && (
                    <AIRecommendationPanel
                      zoneId={currentZoneId}
                      zoneName={zones.find(z => z.zone_id === currentZoneId)?.zone_name}
                      onNotification={addNotification}
                    />
                  )}
                </Box>
              </Box>
            </Box>
          );
      case 'vision':
        return <VisionMonitoringSection {...sectionProps} />;
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

  const navItems = [
    { key: 'home', label: 'Dashboard', icon: DashboardRoundedIcon },
    { key: 'irrigation', label: 'Irrigation', icon: WaterDropRoundedIcon },
    { key: 'status', label: 'System Status', icon: ShowChartRoundedIcon },
    { key: 'reports', label: 'Reports & Analytics', icon: AssessmentRoundedIcon },
    { key: 'vision', label: 'Vision Monitoring', icon: VisibilityRoundedIcon },
    { key: 'system-settings', label: 'System Settings', icon: SettingsRoundedIcon },
    { key: 'profile-settings', label: 'Profile Settings', icon: PersonRoundedIcon },
  ];

  const sectionTitles = {
    home: `Welcome, ${currentUser?.username || 'User'}`,
    irrigation: 'Irrigation',
    status: 'System Status',
    reports: 'Reports & Analytics',
    vision: 'Vision Monitoring',
    'system-settings': 'System Settings',
    'profile-settings': 'Profile Settings',
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: c.background }}>
      {/* Toast Notifications Container */}
      <Stack spacing={1.5} sx={{ position: 'fixed', top: 20, right: 20, zIndex: 2000, alignItems: 'flex-end' }}>
        {toastNotifications.map(notification => (
          <Notification
            key={notification.id}
            message={notification.message}
            type={notification.type}
            onClose={() => removeToastNotification(notification.id)}
          />
        ))}
      </Stack>

      {/* Sidebar */}
      <Box
        sx={{
          width: 280,
          flexShrink: 0,
          bgcolor: 'white',
          borderRight: `1px solid ${c.border}`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: 3,
          minHeight: '100vh',
        }}
      >
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 4 }}>
            <Box sx={{ bgcolor: c.sidebarActive, borderRadius: 2, p: 1, display: 'flex' }}>
              <EnergySavingsLeafRoundedIcon sx={{ color: 'white', fontSize: 20 }} />
            </Box>
            <Typography sx={{ fontFamily: '"Roboto", sans-serif', fontWeight: 800, fontSize: 24, color: c.sidebarActive }}>
              Nyuza
            </Typography>
          </Stack>

          {currentZone && (
            <Box sx={{ mb: 2, p: 1.2, bgcolor: c.chipGreenBg, borderRadius: 2 }}>
              <Typography variant="caption" sx={{ color: c.textDark, fontWeight: 700 }}>
                Irrigating: {currentZone.zone_name || currentZone.name}
              </Typography>
            </Box>
          )}

          <Stack spacing={0.5}>
            {navItems.map(({ key, label, icon: Icon }) => {
              const active = activeSection === key;
              return (
                <Button
                  key={key}
                  fullWidth
                  onClick={() => setActiveSection(key)}
                  startIcon={<Icon sx={{ fontSize: 18 }} />}
                  sx={{
                    justifyContent: 'flex-start',
                    px: 2,
                    py: 1.3,
                    borderRadius: 2,
                    bgcolor: active ? c.sidebarActive : 'transparent',
                    color: active ? 'white' : c.textBody,
                    fontWeight: active ? 600 : 500,
                    fontSize: 14,
                    '&:hover': { bgcolor: active ? c.sidebarActive : c.chipGreenBg },
                  }}
                >
                  {label}
                </Button>
              );
            })}
          </Stack>
        </Box>

        <Box>
          <Button
            fullWidth
            onClick={logout}
            startIcon={<LogoutRoundedIcon sx={{ fontSize: 18 }} />}
            sx={{ justifyContent: 'flex-start', color: c.textBody, mb: 2, px: 2 }}
          >
            Log Out
          </Button>
          <Box
            onClick={() => setActiveSection('profile-settings')}
            sx={{
              bgcolor: c.background,
              border: `1px solid ${c.border}`,
              borderRadius: 3,
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              cursor: 'pointer',
              transition: 'background-color 0.15s',
              '&:hover': { bgcolor: c.chipGreenBg },
            }}
          >
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                bgcolor: c.chipGreenBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              {currentUser?.profile_picture ? (
                <Box component="img" src={currentUser.profile_picture} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <PersonRoundedIcon sx={{ fontSize: 18, color: c.primaryGreen }} />
              )}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 700, color: c.textDark }}>
                {currentUser?.username || 'Operator'}
              </Typography>
              <Typography variant="caption" noWrap sx={{ color: c.textMuted, display: 'block' }}>
                {currentUser?.role || 'System Admin'}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Main Content */}
      <Box sx={{ flex: 1, minWidth: 0, p: 5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4, flexWrap: 'wrap', gap: 2 }}>
          <Typography sx={{ fontFamily: '"Roboto", sans-serif', fontWeight: 700, fontSize: 32, color: c.textDark }}>
            {sectionTitles[activeSection] || 'Nyuza'}
          </Typography>

          <Stack direction="row" spacing={2} alignItems="center">
            <NotificationCenter
              notifications={notifications}
              onClearAll={clearAllNotifications}
              onRemoveNotification={removeNotification}
              onMarkAllAsRead={markAllAsRead}
              onMarkAsRead={markAsRead}
            />
            <Box
              onClick={() => setActiveSection('profile-settings')}
              title="Profile Settings"
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                bgcolor: c.chipGreenBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'transform 0.15s',
                '&:hover': { transform: 'scale(1.08)' },
              }}
            >
              {currentUser?.profile_picture ? (
                <Box component="img" src={currentUser.profile_picture} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <PersonRoundedIcon sx={{ fontSize: 18, color: c.textDark }} />
              )}
            </Box>
          </Stack>
        </Stack>

        {renderActiveSection()}
      </Box>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        message="Zone data loaded successfully"
      />
    </Box>
  );
};

export default Dashboard;