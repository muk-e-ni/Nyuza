import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authAPI, userAPI } from '../../services/api';
import jsPDF from 'jspdf';

const ProfileSettings = ({ currentUser }) => {
  const { logout, updateUser } = useAuth();
  const [profileData, setProfileData] = useState({
    username: currentUser?.username || '',
    email: currentUser?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    notifications: true,
    language: 'en',
    timezone: 'Africa/Nairobi'
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleChange = (field, value) => {
    setProfileData(prev => ({
      ...prev,
      [field]: value
    }));
  };

 const handleSaveProfile = async (e) => {
  e.preventDefault();
  setSaving(true);
  setMessage('');

  // Validation (keep your existing validation)
  if (!profileData.username.trim()) {
    setMessage('Username is required');
    setSaving(false);
    return;
  }

  if (profileData.username.trim().length < 3) {
    setMessage('Username must be at least 3 characters long');
    setSaving(false);
    return;
  }

  if (!/^[a-zA-Z0-9_]+$/.test(profileData.username.trim())) {
    setMessage('Username can only contain letters, numbers, and underscores');
    setSaving(false);
    return;
  }

  if (profileData.newPassword) {
    if (!profileData.currentPassword) {
      setMessage('Current password is required to set a new password');
      setSaving(false);
      return;
    }

    if (profileData.newPassword.length < 6) {
      setMessage('Password must be at least 6 characters long');
      setSaving(false);
      return;
    }

    if (profileData.newPassword !== profileData.confirmPassword) {
      setMessage('New passwords do not match');
      setSaving(false);
      return;
    }
  }

  try {
    console.log('🔍 [FRONTEND DEBUG] Sending profile update...');

    // Prepare update data
    const updateData = {
      username: profileData.username.trim(),
      notifications: profileData.notifications,
      language: profileData.language,
      timezone: profileData.timezone
    };

    // Include password data only if changing password
    if (profileData.newPassword) {
      updateData.current_password = profileData.currentPassword;
      updateData.new_password = profileData.newPassword;
    }

    // API call to update profile
    const response = await authAPI.updateProfile(updateData);
    
    if (response.data && response.data.success) {
      setMessage('Profile updated successfully!');
      
      // Update user context with new data
      updateUser({
        ...currentUser,
        username: profileData.username.trim()
      });
      
      setProfileData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));
    } else {
      const errorMsg = response.data?.message || 'Error updating profile';
      console.log('🔍 [FRONTEND DEBUG] API returned error:', errorMsg);
      setMessage(errorMsg);
    }
  } catch (error) {
    console.error('🔍 [FRONTEND DEBUG] Profile update error:', error);
    console.error('🔍 [FRONTEND DEBUG] Error details:', {
      message: error.message,
      response: error.response,
      status: error.response?.status,
      data: error.response?.data
    });
    
    if (error.response?.data?.message) {
      setMessage(error.response.data.message);
    } else if (error.response?.status === 400) {
      setMessage('Invalid input data');
    } else if (error.response?.status === 401) {
      setMessage('Authentication failed. Please log in again.');
    } else if (error.message === 'Network Error') {
      setMessage('Network error. Please check your connection.');
    } else {
      setMessage(error.message || 'Error updating profile');
    }
  } finally {
    setSaving(false);
  }
};
  const handleCancel = () => {
    // Reset form to original values
    setProfileData({
      username: currentUser?.username || '',
      email: currentUser?.email || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      notifications: true,
      language: 'en',
      timezone: 'Africa/Nairobi'
    });
    setMessage('Changes discarded');
  };

  const handleExportData = async (format = 'json') => {
    if (!window.confirm('This will export all your personal data and irrigation history. Continue?')) {
      return;
    }

    try {
      setMessage('Preparing your data export as ${format.toUpperCase()}...');
      
        const response = await userAPI.exportUserData();
      
      if (response.data && response.data.success) {

        const exportData = response.data.data || response;

        if (format =='pdf'){
          exportToPDF(exportData);
        }
        else{
          exportToJSON(exportData);

        }}
        else {
          const errorMsg = response.data?.message || 'Error Exporting Data'
          setMessage(errorMsg)
          
        }}
        catch (error){
          setMessage(error.response?.data?.message || error.message || 'Error exporting data');
        }
        };

      const exportToJSON = (exportData) => {
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `irrigation-data-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setMessage('Data export completed successfully! (JSON)');

      };
const exportToPDF = (exportData) => {
  try {
    const doc = new jsPDF();
    
    // Add header with logo/icon
    doc.setFillColor(42, 157, 143);
    doc.rect(0, 0, 210, 30, 'F');
    
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text('💧 Nyuza Smart Irrigation System', 20, 20);
    
    doc.setFontSize(10);
    doc.text('Data Export Report', 20, 28);
    
    let yPosition = 50;
    
    // Summary Section
    doc.setFillColor(240, 240, 240);
    doc.rect(15, yPosition - 10, 180, 40, 'F');
    
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 40);
    doc.text('Export Summary', 20, yPosition);
    
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    yPosition += 8;
    doc.text(`Generated for: ${exportData.user_info?.username || 'User'}`, 25, yPosition);
    yPosition += 6;
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 25, yPosition);
    yPosition += 6;
    doc.text(`Total Records: ${exportData.export_info?.data_points || 0}`, 25, yPosition);
    yPosition += 6;
    doc.text(`Irrigation Events: ${exportData.irrigation_history?.length || 0}`, 25, yPosition);
    yPosition += 6;
    doc.text(`Active Schedules: ${exportData.schedules?.filter(s => s.is_active)?.length || 0}`, 25, yPosition);
    
    yPosition += 20;
    
if (exportData.preferences && Object.keys(exportData.preferences).length > 0) {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(16);
      doc.setTextColor(40, 40, 40);
      doc.text('User Preferences', 20, yPosition);
      yPosition += 15;
      
      doc.setFontSize(10);
      doc.text(`Notifications: ${exportData.preferences.notifications ? 'Enabled' : 'Disabled'}`, 20, yPosition);
      yPosition += 8;
      doc.text(`Language: ${exportData.preferences.language || 'English'}`, 20, yPosition);
      yPosition += 8;
      doc.text(`Timezone: ${exportData.preferences.timezone || 'Default'}`, 20, yPosition);
      yPosition += 15;
    }
    
    // Irrigation History Section
    if (exportData.irrigation_history && exportData.irrigation_history.length > 0) {
      if (yPosition > 220) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(16);
      doc.setTextColor(40, 40, 40);
      doc.text('Irrigation History', 20, yPosition);
      yPosition += 15;
      
      doc.setFontSize(9);
      exportData.irrigation_history.slice(0, 10).forEach((log, index) => { // Show first 10 logs
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 20;
        }
        
        doc.setTextColor(60, 60, 60);
        doc.text(`${index + 1}. ${log.zone} - ${log.duration}s`, 20, yPosition);
        doc.setTextColor(30, 30, 30);
        doc.text(`Water: ${log.water_used}L, Type: ${log.trigger_type}`, 100, yPosition);
        yPosition += 6;
        
        if (log.start_time) {
          doc.setTextColor(100, 100, 100);
          doc.text(`Date: ${new Date(log.start_time).toLocaleDateString()}`, 20, yPosition);
          yPosition += 5;
        }
        yPosition += 3;
      });
      
      if (exportData.irrigation_history.length > 10) {
        doc.setTextColor(100, 100, 100);
        doc.text(`... and ${exportData.irrigation_history.length - 10} more records`, 20, yPosition);
        yPosition += 8;
      }
      yPosition += 10;
    }
    
    // Schedules Section
    if (exportData.schedules && exportData.schedules.length > 0) {
      if (yPosition > 240) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(16);
      doc.setTextColor(40, 40, 40);
      doc.text('Irrigation Schedules', 20, yPosition);
      yPosition += 15;
      
      doc.setFontSize(9);
      exportData.schedules.forEach((schedule, index) => {
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 20;
        }
        
        doc.setTextColor(60, 60, 60);
        doc.text(`${index + 1}. ${schedule.zone_name} - ${schedule.name}`, 20, yPosition);
        doc.setTextColor(30, 30, 30);
        doc.text(`${schedule.trigger_type} (${schedule.is_active ? 'Active' : 'Inactive'})`, 120, yPosition);
        yPosition += 6;
        
        doc.setTextColor(80, 80, 80);
        doc.text(`Duration: ${schedule.duration}s, Threshold: ${schedule.moisture_threshold || 'N/A'}%`, 20, yPosition);
        yPosition += 8;
      });
    }
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${pageCount}`, 180, 290, null, null, 'right');
      doc.text(' Nyuza Smart Irrigation System', 20, 290);
    }
    
    // Save PDF
    doc.save(`irrigation-report-${exportData.user_info?.username || 'user'}-${new Date().toISOString().split('T')[0]}.pdf`);
    setMessage('Professional PDF report generated successfully!');
    
  } catch (error) {
    console.error('PDF export error:', error);
    setMessage('Error generating PDF. Please try JSON export instead.');
  }
};


  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      setMessage('Please enter your password to confirm account deletion');
      return;
    }

    setDeleting(true);
    try {
     const response = await authAPI.deleteAccount(deletePassword);
      
      if (response.success) {
        setMessage('Account deleted successfully. Redirecting...');
        
        // Logout user after successful deletion
        setTimeout(() => {
          logout();
        }, 2000);
      } else {
        setMessage(response.message || 'Error deleting account');
      }
    } catch (error) {
      console.error('Account deletion error:', error);
      setMessage(error.response?.data?.message || error.message || 'Error deleting account. Please check your password.');
    } finally {
      setDeleting(false);
    }
  };

  const showDeleteConfirmation = () => {
    setShowDeleteConfirm(true);
    setDeletePassword('');
    setMessage('');
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeletePassword('');
  };

  return (
    <div className="profile-settings">
      <h2>Profile Settings</h2>

      {message && (
        <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="profile-form">
        <div className="form-section">
          <h3>Personal Information</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={profileData.username}
                onChange={(e) => handleChange('username', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                value={profileData.email}
                readOnly
                disabled
                className="disabled-field"
                title="Email cannot be changed. Please contact support if you need to update your email."
              />
              <small className="field-note">Email cannot be changed. Contact support for assistance.</small>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Change Password</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Current Password</label>
              <input
                type="password"
                value={profileData.currentPassword}
                onChange={(e) => handleChange('currentPassword', e.target.value)}
                placeholder="Enter current password to change"
              />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                value={profileData.newPassword}
                onChange={(e) => handleChange('newPassword', e.target.value)}
                placeholder="Enter new password (min. 6 characters)"
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={profileData.confirmPassword}
                onChange={(e) => handleChange('confirmPassword', e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Preferences</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Language</label>
              <select
                value={profileData.language}
                onChange={(e) => handleChange('language', e.target.value)}
              >
                <option value="en">English</option>
                <option value="sw">Swahili</option>
                <option value="fr">French</option>
              </select>
            </div>
            <div className="form-group">
              <label>Timezone</label>
              <select
                value={profileData.timezone}
                onChange={(e) => handleChange('timezone', e.target.value)}
              >
                <option value="Africa/Nairobi">East Africa Time (EAT)</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">Eastern Time (ET)</option>
              </select>
            </div>
            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={profileData.notifications}
                  onChange={(e) => handleChange('notifications', e.target.checked)}
                />
                Receive email notifications
              </label>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Account Information</h3>
          <div className="account-info">
            <div className="info-item">
              <label>User ID:</label>
              <span>{currentUser?.id || 'N/A'}</span>
            </div>
            <div className="info-item">
              <label>Role:</label>
              <span>{currentUser?.role || 'user'}</span>
            </div>
            <div className="info-item">
              <label>Member Since:</label>
              <span>{currentUser?.date_registered ? new Date(currentUser.date_registered).toLocaleDateString() : 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button 
            type="submit" 
            className="btn-primary"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button 
            type="button" 
            className="btn-secondary"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>


{/* Export Options */}
<div className="report-card">
  <h3>Export Reports</h3>
      <div className="export-options">
        <button 
          className="export-btn"
          onClick={() => handleExportData('json')}
        >
          📊 Export as JSON
        </button>
        <button 
          className="export-btn"
          onClick={() => handleExportData('pdf')}
        >
          📄 Export as PDF
        </button>

      </div>
      <p className="export-note">
        JSON: For data analysis | PDF: For readability 
      </p>
    </div>       <div className="danger-zone">
        <h3>Danger Zone</h3>
        <div className="danger-actions">
          <button 
            className="btn-danger delete-btn"
            onClick={showDeleteConfirmation}
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>⚠️ Delete Account</h3>
            <p>This action <strong>cannot be undone</strong>. This will permanently:</p>
            <ul>
              <li>Delete your account and all personal information</li>
              <li>Remove all your irrigation schedules and settings</li>
              <li>Delete your irrigation history and data</li>
            </ul>
            
            <div className="form-group">
              <label>Enter your password to confirm:</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Enter your password"
                autoFocus
              />
            </div>
            
            <div className="modal-actions">
              <button 
                className="btn-danger"
                onClick={handleDeleteAccount}
                disabled={deleting || !deletePassword.trim()}
              >
                {deleting ? 'Deleting...' : 'Permanently Delete Account'}
              </button>
              <button 
                className="btn-secondary"
                onClick={cancelDelete}
                disabled={deleting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSettings;