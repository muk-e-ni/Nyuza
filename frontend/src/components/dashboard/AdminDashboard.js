import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './AdminDashboard.css';
import {
  Lock as LockIcon,
  BarChart as BarChartIcon,
  Group as GroupIcon,
  Build as BuildIcon,
  Settings as SettingsIcon,
  ListAlt as ListAltIcon,
} from '@mui/icons-material';

const AdminDashboard = () => {
  const [dashboardData, setDashboardData] = useState({});
  const [activeTab, setActiveTab] = useState('overview');
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser?.is_admin) {
      fetchAdminData();
    }
  }, [currentUser]);

  const fetchAdminData = async () => {
    try {
      const response = await adminAPI.getDashboard();
      setDashboardData(response.data);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    }
  };

  if (!currentUser?.is_admin) {
    return (
      <div className="admin-dashboard">
        <div className="access-denied">
          <h2 style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}><LockIcon sx={{ fontSize: 24 }} /> Access Denied</h2>
          <p>You need administrator privileges to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <p>Welcome, Administrator {currentUser.username}</p>
      </div>

      <div className="admin-tabs">
        <button 
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BarChartIcon sx={{ fontSize: 16 }} /> Overview</span>
        </button>
        <button 
          className={`tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><GroupIcon sx={{ fontSize: 16 }} /> User Management</span>
        </button>
        <button 
          className={`tab ${activeTab === 'sensors' ? 'active' : ''}`}
          onClick={() => setActiveTab('sensors')}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BuildIcon sx={{ fontSize: 16 }} /> Sensor Management</span>
        </button>
        <button 
          className={`tab ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><SettingsIcon sx={{ fontSize: 16 }} /> System Settings</span>
        </button>
        <button 
          className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ListAltIcon sx={{ fontSize: 16 }} /> Activity Logs</span>
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'overview' && <OverviewTab data={dashboardData} />}
        {activeTab === 'users' && <UserManagementTab />}
        {activeTab === 'sensors' && <SensorManagementTab />}
        {activeTab === 'system' && <SystemSettingsTab />}
        {activeTab === 'logs' && <ActivityLogsTab />}
      </div>
    </div>
  );
};

// Tab components to go here...
export default AdminDashboard;