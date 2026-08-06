import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './AdminDashboard.css';

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
          <h2>🔒 Access Denied</h2>
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
          📊 Overview
        </button>
        <button 
          className={`tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          👥 User Management
        </button>
        <button 
          className={`tab ${activeTab === 'sensors' ? 'active' : ''}`}
          onClick={() => setActiveTab('sensors')}
        >
          🔧 Sensor Management
        </button>
        <button 
          className={`tab ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          ⚙️ System Settings
        </button>
        <button 
          className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          📋 Activity Logs
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