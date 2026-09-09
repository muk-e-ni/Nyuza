import React, { useState } from 'react';
import { Box, Typography, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import {
  Home as HomeIcon,
  Insights as InsightsIcon,
  CameraAlt as CameraIcon,
  WaterDrop as WaterDropIcon,
  MoreHoriz as MoreIcon,
  BarChart as ReportsIcon,
  Settings as SettingsIcon,
  Person as ProfileIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';

/**
 * Mobile-only bottom tab bar, matching the Figma dashboard frame's nav
 * pattern (4 icon+label tabs, active tab in dark green with bold label).
 *
 * Structurally separate from the desktop <nav className="sidebar-nav">
 * markup in dashboard.js — this isn't the same DOM reflowed via CSS, so
 * there's no risk of one layout's changes leaking into the other.
 *
 * Only the 4 most time-sensitive sections get a direct tab (Home, Status,
 * Vision, Irrigation) — Reports/Settings/Profile/Logout live behind "More"
 * to avoid cramming 7 tabs into a phone-width bar, which the Figma design
 * deliberately avoids by only showing 4.
 */

const PRIMARY_TABS = [
  { key: 'home', label: 'Dashboard', icon: HomeIcon },
  { key: 'status', label: 'Sensors', icon: InsightsIcon },
  { key: 'irrigation', label: 'Irrigation', icon: WaterDropIcon },
  { key: 'vision', label: 'Pest Shield', icon: CameraIcon },
];

const MORE_ITEMS = [
  { key: 'reports', label: 'Reports & Analytics', icon: ReportsIcon },
  { key: 'system-settings', label: 'System Settings', icon: SettingsIcon },
  { key: 'profile-settings', label: 'Profile Settings', icon: ProfileIcon },
];

const MobileBottomNav = ({ activeSection, onSectionChange, onLogout }) => {
  const [moreAnchor, setMoreAnchor] = useState(null);
  const isMoreActive = MORE_ITEMS.some((item) => item.key === activeSection);

  const handleMoreSelect = (key) => {
    setMoreAnchor(null);
    onSectionChange(key);
  };

  return (
    <Box
      component="nav"
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        bgcolor: 'white',
        borderTop: '1px solid #ede9e1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        height: 64,
        pb: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 1200,
      }}
    >
      {PRIMARY_TABS.map(({ key, label, icon: Icon }) => {
        const active = activeSection === key;
        return (
          <Box
            key={key}
            onClick={() => onSectionChange(key)}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.3,
              flex: 1,
              py: 0.5,
              cursor: 'pointer',
            }}
          >
            <Icon sx={{ fontSize: 22, color: active ? '#3c4e43' : '#8e9e94' }} />
            <Typography
              sx={{
                fontSize: 10,
                color: active ? '#3c4e43' : '#8e9e94',
                fontWeight: active ? 700 : 500,
              }}
            >
              {label}
            </Typography>
          </Box>
        );
      })}

      <Box
        onClick={(e) => setMoreAnchor(e.currentTarget)}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.3,
          flex: 1,
          py: 0.5,
          cursor: 'pointer',
        }}
      >
        <MoreIcon sx={{ fontSize: 22, color: isMoreActive ? '#3c4e43' : '#8e9e94' }} />
        <Typography
          sx={{
            fontSize: 10,
            color: isMoreActive ? '#3c4e43' : '#8e9e94',
            fontWeight: isMoreActive ? 700 : 500,
          }}
        >
          More
        </Typography>
      </Box>

      <Menu
        anchorEl={moreAnchor}
        open={Boolean(moreAnchor)}
        onClose={() => setMoreAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {MORE_ITEMS.map(({ key, label, icon: Icon }) => (
          <MenuItem key={key} selected={activeSection === key} onClick={() => handleMoreSelect(key)}>
            <ListItemIcon>
              <Icon fontSize="small" sx={{ color: '#3c4e43' }} />
            </ListItemIcon>
            <ListItemText>{label}</ListItemText>
          </MenuItem>
        ))}
        <MenuItem
          onClick={() => {
            setMoreAnchor(null);
            onLogout();
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" sx={{ color: '#c04e37' }} />
          </ListItemIcon>
          <ListItemText sx={{ color: '#c04e37' }}>Logout</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default MobileBottomNav;