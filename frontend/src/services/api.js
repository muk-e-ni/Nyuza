import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (credentials) => api.post('/auth/api/login', credentials),
  register: (userData) => api.post('/auth/api/register', userData),
  logout: () => api.post('/auth/api/logout'),
  checkAuth: () => api.get('/auth/api/check-auth'),
  getCurrentUser: () => api.get('/auth/api/current-user'),

  updateProfile: (data) => api.put('/profile/api/profile', data),
  deleteAccount: (password) => api.post('/profile/api/delete-account', { password }),
};

export const userAPI = {
  exportUserData: () => api.get('/profile/api/export-data'),
  getUserPreferences: () => api.get('/profile/api/preferences'),
  updateUserPreferences: (data) => api.put('/profile/api/preferences', data),

  getUserStats: () => api.get('/profile/api/stats'),
  getIrrigationHistory: (days = 30) => api.get(`/profile/api/irrigation-history?days=${days}`),
};

export const irrigationAPI = {
  getCurrentStatus: () => api.get('/irrigation/api/irrigation/current-status'),
  getSchedules: () => api.get('/irrigation/api/irrigation/schedules'),
  manualControl: (data) => api.post('/irrigation/api/irrigation/manual', data),
  checkMoisture: () => api.post('/irrigation/api/irrigation/check-moisture'),
  getStatus: () => api.get('/irrigation/api/irrigation/status'),
  getHistory: (days = 7) => api.get(`/irrigation/api/irrigation/history?days=${days}`),
  getUserZones: () => api.get('/irrigation/api/irrigation/zones'), 
  getAnalytics: (days = 30) => api.get(`/irrigation/api/irrigation/analytics?days=${days}`),

  createSchedule: (data) => api.post('/irrigation/api/irrigation/schedules', data),
  updateIrrigationSchedule: (scheduleId, data) => api.put(`/irrigation/api/irrigation/schedules/${scheduleId}`, data),
  deleteIrrigationSchedule: (scheduleId) => api.delete(`/irrigation/api/irrigation/schedules/${scheduleId}`),
  stopZoneIrrigation: (zoneName) => api.post('/irrigation/api/irrigation/stop-zone', { zone: zoneName }),
  
  // Add these for debugging
  debugLogs: () => api.get('/irrigation/api/irrigation/debug-logs'),
};

export const sensorAPI = {
  getReadings: () => api.get('/sensors/api/sensors/readings'),
  getMoistureData: (zoneId) => api.get(`/sensors/api/sensors/moisture/${zoneId}`),
  getRecentReadings: () => api.get('/sensors/api/sensors/recent'),
  getHistory: (days = 7) => api.get(`/sensors/api/sensors/history?days=${days}`),

  storeSensorReadings: (zoneId = null) => {
    const data = zoneId ? { zone_id: zoneId } : {};
    return api.post('/irrigation/api/sensors/store-readings', data);
  },
  startAutoMonitoring: () => api.post('/irrigation/api/sensors/start-monitoring'),
  getCurrentSensorData: () => api.get('/irrigation/api/sensors/current'),
};

export const recommendationAPI = {
  getRecommendations: (status = 'pending') => api.get(`/recommendations/api/recommendations?status=${status}`),
  getActivityFeed: (limit = 20) => api.get(`/recommendations/api/activity-feed?limit=${limit}`),
  applyRecommendation: (recId) => api.post(`/recommendations/api/recommendations/${recId}/apply`),
  dismissRecommendation: (recId) => api.post(`/recommendations/api/recommendations/${recId}/dismiss`),

 getPersonalizedReport: (days = 7, forceRefresh = false) => {
    const params = forceRefresh ? { refresh: true } : {};
    return api.get(`/recommendations/api/personalized-report/${days}`, { params });
  }, 
  getComprehensiveReport: (days = 30, forceRefresh = false) => {
    const params = forceRefresh ? { refresh: true } : {};
    return api.get(`/recommendations/api/comprehensive-report/${days}`, { params });
  },
  getSmartRecommendation: (zoneId = null) => {
    const params = zoneId ? { zone_id: zoneId } : {};
    return api.get('/recommendations/api/smart-recommendation', { params });
  },
  getPersonalizedRecommendations: (zoneId = null) => {
    const params = zoneId ? { zone_id: zoneId } : {};
    return api.get('/recommendations/api/personalized-recommendations', { params });
  }

};

export const adminAPI = {
  getDashboard: () => api.get('/admin/api/dashboard'),
  getUsers: () => api.get('/admin/api/users'),
  updateUserRole: (userId, role) => api.put(`/admin/api/users/${userId}/role`, { role }),
  updateUserStatus: (userId, isActive) => api.put(`/admin/api/users/${userId}/status`, { is_active: isActive }),
  calibrateSensor: (data) => api.post('/admin/api/sensors/calibrate', data),
  addSensor: (data) => api.post('/admin/api/sensors', data),
  getAdvancedSettings: () => api.get('/admin/api/system/advanced-settings'),
  updateAdvancedSettings: (data) => api.put('/admin/api/system/advanced-settings', data),
  getAdminLogs: (days = 7) => api.get(`/admin/api/admin/logs?days=${days}`),
};

export const systemAPI = {
  getSettings: () => api.get('/system/api/system/settings'),
  updateSettings: (data) => api.put('/system/api/system/settings', data),
  getZones: () => api.get('/system/api/system/zones'), // Back to the system endpoint now that it's properly scoped (was redirected to the irrigation one when this was unscoped/buggy) - this one also returns description, water_requirement, and assigned_sensors that Settings needs
  getHealth: () => api.get('/system/api/system/health'),
};

export const weatherAPI = {
  getCurrentWeather: (params = {}) => api.get('/weather/api/weather/current', { params }),
  getForecast: (params = {}) => api.get('/weather/api/weather/forecast', { params }),
  getWeatherDashboard: (forceRefresh = false) =>
    api.get('/weather/api/weather/dashboard', { params: forceRefresh ? { refresh: true } : {} }),
  getWeatherHistory: (days = 7) => api.get(`/weather/api/weather/history?days=${days}`),
  getIrrigationAdvice: (zoneId = null) => {
    const params = zoneId ? { zone_id: zoneId } : {};
    return api.get('/weather/api/weather/irrigation-advice', { params });
  },
  testWeatherConnection: () => api.get('/weather/api/weather/test-connection'),
};

export const zoneAPI = {
  getUserZones: () => api.get('/irrigation/api/irrigation/zones'), 
  getZoneDetails: (zoneId) => api.get(`/irrigation/api/irrigation/zones/${zoneId}/status`),
  createZone: (data) => api.post('/system/api/system/zones', data),
  updateZone: (zoneId, data) => api.put(`/system/api/system/zones/${zoneId}`, data),
  deleteZone: (zoneId) => api.delete(`/system/api/system/zones/${zoneId}`),
  getFarmSensors: () => api.get('/system/api/system/sensors'),
  assignSensor: (zoneId, sensorId) => api.post(`/system/api/system/zones/${zoneId}/sensors`, { sensor_id: sensorId }),
  unassignSensor: (zoneId, sensorId) => api.delete(`/system/api/system/zones/${zoneId}/sensors/${sensorId}`),
};

export const aiAPI = {
  getSmartRecommendation: (zoneId = null, forceRefresh = false) => {
    const params = zoneId ? { zone_id: zoneId } : {};
    if (forceRefresh) params.refresh = true;
    return api.get('/ai/smart-recommendation', { params });
  },
  getPersonalizedRecommendations: (zoneId = null, forceRefresh = false) => {
    const params = zoneId ? { zone_id: zoneId } : {};
    if (forceRefresh) params.refresh = true;
    return api.get('/ai/personalized-recommendations', { params });
  },
  getComprehensiveReport: (days = 30) => {
    return api.get(`/ai/comprehensive-report/${days}`);
  },
  getPersonalizedReport: (days = 7) => {
    return api.get(`/ai/personalized-report/${days}`);
  }, 
  getOllamaStatus: () => {
    return api.get('/recommendations/api/ollama-status');
  },
  testPrompt: (prompt) => {
    return api.post('/ai/test-prompt', { prompt });
  },
  getUserProfile: () => {
    return api.get('/ai/user-profile');
  },
    testAIService: () => {
    return api.get('/recommendations/api/debug/recommendations');
  },
};


export const visionAPI = {
  // Runs every ready model (disease + pest) against one image — replaces
  // choosing between detectDisease/detectPest, which is what caused the
  // frontend to guess wrong about which check applied.
  analyze: (imageFile, zoneId = null) => {
    const formData = new FormData();
    formData.append('image', imageFile);
    if (zoneId) formData.append('zone_id', zoneId);
    return api.post('/vision/analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  // Kept for direct/manual testing of a single model — most UI should use analyze() instead.
  detectDisease: (imageFile, zoneId = null) => {
    const formData = new FormData();
    formData.append('image', imageFile);
    if (zoneId) formData.append('zone_id', zoneId);
    return api.post('/vision/detect-disease', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  detectPest: (imageFile, zoneId = null) => {
    const formData = new FormData();
    formData.append('image', imageFile);
    if (zoneId) formData.append('zone_id', zoneId);
    return api.post('/vision/detect-pest', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getHistory: (zoneId = null, limit = 20) => {
    const params = { limit };
    if (zoneId) params.zone_id = zoneId;
    return api.get('/vision/history', { params });
  },
  getStatus: () => api.get('/vision/status'),
  submitReadingFeedback: (readingId, data) => api.post(`/vision/readings/${readingId}/feedback`, data),
  // Authenticated snapshot fetch — use this (not snapshotUrl) anywhere the
  // request needs the Authorization header, e.g. "capture from live feed".
  getSnapshotBlob: () => api.get('/vision/snapshot', { responseType: 'blob' }),
  // Not axios calls — these are plain URLs for <img> tags.
  // /snapshot below is unauthenticated-URL form and will 401; kept only as
  // a reference. /stream deliberately has no auth so a plain <img src> can
  // consume it (see backend docstring for the tradeoff).
  streamUrl: () => `${API_BASE_URL}/vision/stream`,
};

export const notificationAPI = {
  getNotifications: (days = 7) => api.get(`/notifications/api/notifications?days=${days}`),
  
  markAsRead: (notificationId) => api.put(`/notifications/api/notifications/${notificationId}/read`),
  
  markAllAsRead: () => api.put('/notifications/api/notifications/read-all'),
  
  testNotification: (method) => api.post('/notifications/api/notifications/test', { method }),
  
  // Send system alert (admin only)
  sendSystemAlert: (alertData) => api.post('/notifications/api/notifications/system-alert', alertData),
  
  getNotificationPreferences: () => api.get('/profile/api/preferences'),
  
  updateNotificationPreferences: (preferences) => api.put('/profile/api/preferences', preferences),
  
  getUnreadCount: async () => {
    try {
      const response = await api.get('/notifications/api/notifications?days=30');
      return response.data?.unread_count || 0;
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }
};
// Health check
export const healthCheck = () => api.get('/api/health');

export default api;