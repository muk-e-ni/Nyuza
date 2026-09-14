import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authAPI, userAPI } from '../../services/api';
import jsPDF from 'jspdf';
import {
  Box,
  Typography,
  Stack,
  Button,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
  Avatar,
  Chip,
  useMediaQuery,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import { nyuzaColors as c } from '../../Theme';

const CATEGORIES = [
  { id: 'personal', label: 'Personal Information', icon: PersonRoundedIcon },
  { id: 'password', label: 'Password Settings', icon: LockRoundedIcon },
  { id: 'preferences', label: 'Preferences', icon: TuneRoundedIcon },
  { id: 'account', label: 'Account Information', icon: InfoRoundedIcon },
];

const ProfileSettings = ({ currentUser, onNotification }) => {
  const { logout, updateUser } = useAuth();
  const isMobile = useMediaQuery('(max-width:900px)');
  const [activeCategory, setActiveCategory] = useState('personal');

  const [personal, setPersonal] = useState({
    username: currentUser?.username || '',
    email: currentUser?.email || '',
    phone_number: currentUser?.phone_number || '',
  });
  const [profilePicture, setProfilePicture] = useState(currentUser?.profile_picture || null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = React.useRef(null);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [prefs, setPrefs] = useState({ notifications: true, language: 'en', timezone: 'Africa/Nairobi' });

  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const notify = (msg, type = 'info') => onNotification?.(msg, type);

  // ---- Profile photo ----
  const resizeImageToDataUri = (file, maxDim = 200, quality = 0.85) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Could not read image'));
        img.onload = () => {
          // Crop to a centered square, then scale down to maxDim x maxDim —
          // keeps the stored size small (a few tens of KB) regardless of
          // the original photo's resolution.
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          const canvas = document.createElement('canvas');
          canvas.width = maxDim;
          canvas.height = maxDim;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, sx, sy, side, side, 0, 0, maxDim, maxDim);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

  const handlePhotoSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      return notify('Please choose a JPEG or PNG image', 'error');
    }
    if (file.size > 5 * 1024 * 1024) {
      return notify('Image must be under 5MB', 'error');
    }

    setUploadingPhoto(true);
    try {
      const dataUri = await resizeImageToDataUri(file);
      const response = await authAPI.updateProfile({ profile_picture: dataUri });
      if (response.data?.success) {
        setProfilePicture(dataUri);
        updateUser({ ...currentUser, profile_picture: dataUri });
        notify('Profile photo updated', 'success');
      } else {
        notify(response.data?.message || 'Error uploading photo', 'error');
      }
    } catch (error) {
      notify(error.response?.data?.message || error.message || 'Error uploading photo', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    setUploadingPhoto(true);
    try {
      const response = await authAPI.updateProfile({ profile_picture: null });
      if (response.data?.success) {
        setProfilePicture(null);
        updateUser({ ...currentUser, profile_picture: null });
        notify('Profile photo removed', 'success');
      } else {
        notify(response.data?.message || 'Error removing photo', 'error');
      }
    } catch (error) {
      notify(error.response?.data?.message || error.message || 'Error removing photo', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ---- Personal Information ----
  const handleSavePersonal = async () => {
    if (!personal.username.trim()) return notify('Username is required', 'error');
    if (personal.username.trim().length < 3) return notify('Username must be at least 3 characters', 'error');
    if (!/^[a-zA-Z0-9_]+$/.test(personal.username.trim())) return notify('Username can only contain letters, numbers, and underscores', 'error');

    setSavingPersonal(true);
    try {
      const response = await authAPI.updateProfile({
        username: personal.username.trim(),
        phone_number: personal.phone_number.trim(),
      });
      if (response.data?.success) {
        notify('Profile updated successfully', 'success');
        updateUser({ ...currentUser, username: personal.username.trim(), phone_number: personal.phone_number.trim() });
      } else {
        notify(response.data?.message || 'Error updating profile', 'error');
      }
    } catch (error) {
      notify(error.response?.data?.message || error.message || 'Error updating profile', 'error');
    } finally {
      setSavingPersonal(false);
    }
  };

  // ---- Password Settings ----
  const handleSavePassword = async () => {
    if (!passwordForm.currentPassword) return notify('Current password is required', 'error');
    if (passwordForm.newPassword.length < 6) return notify('New password must be at least 6 characters', 'error');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) return notify('New passwords do not match', 'error');

    setSavingPassword(true);
    try {
      const response = await authAPI.updateProfile({
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword,
      });
      if (response.data?.success) {
        notify('Password updated successfully', 'success');
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        notify(response.data?.message || 'Error updating password', 'error');
      }
    } catch (error) {
      notify(error.response?.data?.message || error.message || 'Error updating password', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  // ---- Preferences ----
  const handleSavePrefs = async () => {
    setSavingPrefs(true);
    try {
      await userAPI.updateUserPreferences(prefs);
      notify('Preferences saved', 'success');
    } catch (error) {
      notify('Failed to save preferences', 'error');
    } finally {
      setSavingPrefs(false);
    }
  };

  // ---- Export ----
  const handleExportData = async (format = 'json') => {
    if (!window.confirm('This will export all your personal data and irrigation history. Continue?')) return;
    try {
      notify(`Preparing your data export as ${format.toUpperCase()}...`, 'info');
      const response = await userAPI.exportUserData();
      if (response.data?.success) {
        const exportData = response.data.data || response.data;
        if (format === 'pdf') exportToPDF(exportData);
        else exportToJSON(exportData);
      } else {
        notify(response.data?.message || 'Error exporting data', 'error');
      }
    } catch (error) {
      notify(error.response?.data?.message || error.message || 'Error exporting data', 'error');
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
    notify('Data export completed (JSON)', 'success');
  };

  const exportToPDF = (exportData) => {
    try {
      const doc = new jsPDF();
      doc.setFillColor(46, 125, 50);
      doc.rect(0, 0, 210, 30, 'F');
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text('Nyuza Smart Irrigation System', 20, 20);
      doc.setFontSize(10);
      doc.text('Data Export Report', 20, 28);

      let y = 50;
      doc.setFillColor(240, 240, 240);
      doc.rect(15, y - 10, 180, 40, 'F');
      doc.setFontSize(14);
      doc.setTextColor(40, 40, 40);
      doc.text('Export Summary', 20, y);
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      y += 8;
      doc.text(`Generated for: ${exportData.user_info?.username || 'User'}`, 25, y); y += 6;
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 25, y); y += 6;
      doc.text(`Total Records: ${exportData.export_info?.data_points || 0}`, 25, y); y += 6;
      doc.text(`Irrigation Events: ${exportData.irrigation_history?.length || 0}`, 25, y); y += 6;
      doc.text(`Active Schedules: ${exportData.schedules?.filter(s => s.is_active)?.length || 0}`, 25, y);
      y += 20;

      if (exportData.preferences && Object.keys(exportData.preferences).length > 0) {
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(16); doc.setTextColor(40, 40, 40);
        doc.text('User Preferences', 20, y); y += 15;
        doc.setFontSize(10);
        doc.text(`Notifications: ${exportData.preferences.notifications ? 'Enabled' : 'Disabled'}`, 20, y); y += 8;
        doc.text(`Language: ${exportData.preferences.language || 'English'}`, 20, y); y += 8;
        doc.text(`Timezone: ${exportData.preferences.timezone || 'Default'}`, 20, y); y += 15;
      }

      if (exportData.irrigation_history?.length > 0) {
        if (y > 220) { doc.addPage(); y = 20; }
        doc.setFontSize(16); doc.setTextColor(40, 40, 40);
        doc.text('Irrigation History', 20, y); y += 15;
        doc.setFontSize(9);
        exportData.irrigation_history.slice(0, 10).forEach((log, index) => {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.setTextColor(60, 60, 60);
          doc.text(`${index + 1}. ${log.zone} - ${log.duration}s`, 20, y);
          doc.setTextColor(30, 30, 30);
          doc.text(`Water: ${log.water_used}L, Type: ${log.trigger_type}`, 100, y);
          y += 6;
          if (log.start_time) {
            doc.setTextColor(100, 100, 100);
            doc.text(`Date: ${new Date(log.start_time).toLocaleDateString()}`, 20, y);
            y += 5;
          }
          y += 3;
        });
        if (exportData.irrigation_history.length > 10) {
          doc.setTextColor(100, 100, 100);
          doc.text(`... and ${exportData.irrigation_history.length - 10} more records`, 20, y);
          y += 8;
        }
        y += 10;
      }

      if (exportData.schedules?.length > 0) {
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(16); doc.setTextColor(40, 40, 40);
        doc.text('Irrigation Schedules', 20, y); y += 15;
        doc.setFontSize(9);
        exportData.schedules.forEach((schedule, index) => {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.setTextColor(60, 60, 60);
          doc.text(`${index + 1}. ${schedule.zone_name} - ${schedule.name}`, 20, y);
          doc.setTextColor(30, 30, 30);
          doc.text(`${schedule.trigger_type} (${schedule.is_active ? 'Active' : 'Inactive'})`, 120, y);
          y += 6;
          doc.setTextColor(80, 80, 80);
          doc.text(`Duration: ${schedule.duration}s, Threshold: ${schedule.moisture_threshold || 'N/A'}%`, 20, y);
          y += 8;
        });
      }

      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i} of ${pageCount}`, 180, 290, null, null, 'right');
        doc.text('Nyuza Smart Irrigation System', 20, 290);
      }

      doc.save(`irrigation-report-${exportData.user_info?.username || 'user'}-${new Date().toISOString().split('T')[0]}.pdf`);
      notify('PDF report generated successfully', 'success');
    } catch (error) {
      console.error('PDF export error:', error);
      notify('Error generating PDF — try JSON export instead', 'error');
    }
  };

  // ---- Delete account ----
  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) return notify('Please enter your password to confirm deletion', 'error');
    setDeleting(true);
    try {
      const response = await authAPI.deleteAccount(deletePassword);
      if (response.data?.success) {
        notify('Account deleted. Signing you out...', 'success');
        setTimeout(() => logout(), 1500);
      } else {
        notify(response.data?.message || 'Error deleting account', 'error');
      }
    } catch (error) {
      notify(error.response?.data?.message || error.message || 'Error deleting account — check your password', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const initials = (personal.username || 'U').slice(0, 2).toUpperCase();

  const categoryContent = (id) => {
    switch (id) {
      case 'personal':
        return (
          <Stack spacing={3}>
            <Stack direction="row" spacing={2.5} alignItems="center">
              <Avatar
                src={profilePicture || undefined}
                sx={{ width: 72, height: 72, bgcolor: c.sidebarActive, fontSize: 24, fontWeight: 700 }}
              >
                {initials}
              </Avatar>
              <Box>
                <Typography sx={{ fontWeight: 700, color: c.textDark }}>Profile Photo</Typography>
                <Typography variant="body2" sx={{ color: c.textMuted, mb: 1 }}>JPEG, PNG up to 5MB. Recommended 200×200px.</Typography>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/jpg"
                  onChange={handlePhotoSelect}
                  style={{ display: 'none' }}
                />
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={uploadingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                    sx={{ borderColor: c.border, color: c.textDark }}
                  >
                    {uploadingPhoto ? 'Uploading...' : 'Upload New'}
                  </Button>
                  <Button size="small" disabled={uploadingPhoto || !profilePicture} onClick={handleRemovePhoto} sx={{ color: c.textBody }}>
                    Remove
                  </Button>
                </Stack>
              </Box>
            </Stack>
            <TextField label="Username" value={personal.username} onChange={(e) => setPersonal(p => ({ ...p, username: e.target.value }))} fullWidth />
            <TextField label="Email Address" value={personal.email} disabled fullWidth helperText="Contact support to change your email address" />
            <TextField label="Phone / Contact Number" value={personal.phone_number} onChange={(e) => setPersonal(p => ({ ...p, phone_number: e.target.value }))} placeholder="+254 700 000000" fullWidth />
            <Stack direction="row" spacing={1.5} justifyContent="flex-end">
              <Button onClick={() => setPersonal({ username: currentUser?.username || '', email: currentUser?.email || '', phone_number: currentUser?.phone_number || '' })} sx={{ color: c.textBody }}>
                Cancel
              </Button>
              <Button variant="contained" disabled={savingPersonal} onClick={handleSavePersonal} sx={{ bgcolor: c.sidebarActive, '&:hover': { bgcolor: '#152018' } }}>
                {savingPersonal ? 'Saving...' : 'Save Changes'}
              </Button>
            </Stack>
          </Stack>
        );

      case 'password':
        return (
          <Stack spacing={3} sx={{ maxWidth: 420 }}>
            <TextField
              label="Current Password" type="password" value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm(p => ({ ...p, currentPassword: e.target.value }))} fullWidth
            />
            <TextField
              label="New Password" type="password" value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))} fullWidth
              helperText="At least 6 characters"
            />
            <TextField
              label="Confirm New Password" type="password" value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))} fullWidth
            />
            <Stack direction="row" spacing={1.5} justifyContent="flex-end">
              <Button onClick={() => setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })} sx={{ color: c.textBody }}>Cancel</Button>
              <Button variant="contained" disabled={savingPassword} onClick={handleSavePassword} sx={{ bgcolor: c.sidebarActive, '&:hover': { bgcolor: '#152018' } }}>
                {savingPassword ? 'Updating...' : 'Update Password'}
              </Button>
            </Stack>
          </Stack>
        );

      case 'preferences':
        return (
          <Stack spacing={3} sx={{ maxWidth: 420 }}>
            <FormControlLabel
              control={<Switch checked={prefs.notifications} onChange={(e) => setPrefs(p => ({ ...p, notifications: e.target.checked }))} />}
              label={<Typography variant="body2" sx={{ color: c.textDark, fontWeight: 600 }}>Enable Notifications</Typography>}
            />
            <TextField select label="Language" value={prefs.language} onChange={(e) => setPrefs(p => ({ ...p, language: e.target.value }))} fullWidth>
              <MenuItem value="en">English</MenuItem>
              <MenuItem value="sw">Swahili</MenuItem>
              <MenuItem value="fr">French</MenuItem>
            </TextField>
            <TextField select label="Timezone" value={prefs.timezone} onChange={(e) => setPrefs(p => ({ ...p, timezone: e.target.value }))} fullWidth>
              <MenuItem value="Africa/Nairobi">East Africa Time (EAT)</MenuItem>
              <MenuItem value="UTC">UTC</MenuItem>
              <MenuItem value="America/New_York">Eastern Time (ET)</MenuItem>
            </TextField>
            <Stack direction="row" justifyContent="flex-end">
              <Button variant="contained" disabled={savingPrefs} onClick={handleSavePrefs} sx={{ bgcolor: c.sidebarActive, '&:hover': { bgcolor: '#152018' } }}>
                {savingPrefs ? 'Saving...' : 'Save Preferences'}
              </Button>
            </Stack>
          </Stack>
        );

      case 'account':
        return (
          <Stack spacing={3}>
            <Box sx={{ bgcolor: c.background, borderRadius: 3, p: 2.5 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between"><Typography variant="body2" sx={{ color: c.textMuted }}>User ID</Typography><Typography variant="body2" sx={{ fontWeight: 700, color: c.textDark }}>NYZ-{String(currentUser?.id ?? '—').padStart(3, '0')}</Typography></Stack>
                <Stack direction="row" justifyContent="space-between"><Typography variant="body2" sx={{ color: c.textMuted }}>Role</Typography><Chip label={currentUser?.role || 'user'} size="small" sx={{ bgcolor: c.chipGreenBg, color: c.primaryGreen, fontWeight: 700, textTransform: 'capitalize' }} /></Stack>
                <Stack direction="row" justifyContent="space-between"><Typography variant="body2" sx={{ color: c.textMuted }}>Member Since</Typography><Typography variant="body2" sx={{ fontWeight: 700, color: c.textDark }}>{currentUser?.date_registered ? new Date(currentUser.date_registered).toLocaleDateString() : 'N/A'}</Typography></Stack>
              </Stack>
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, color: c.textDark, mb: 1 }}>Export Your Data</Typography>
              <Typography variant="body2" sx={{ color: c.textMuted, mb: 1.5 }}>Download your irrigation history, schedules, and preferences.</Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" startIcon={<DataObjectRoundedIcon sx={{ fontSize: 16 }} />} onClick={() => handleExportData('json')} sx={{ borderColor: c.border, color: c.textDark }}>
                  Export JSON
                </Button>
                <Button size="small" variant="outlined" startIcon={<PictureAsPdfRoundedIcon sx={{ fontSize: 16 }} />} onClick={() => handleExportData('pdf')} sx={{ borderColor: c.border, color: c.textDark }}>
                  Export PDF
                </Button>
              </Stack>
            </Box>
          </Stack>
        );

      default:
        return null;
    }
  };

  const dangerZone = (
    <Box sx={{ bgcolor: c.dangerBg, border: `1px solid ${c.danger}33`, borderRadius: 3, p: 2.5, mt: 3 }}>
      <Typography sx={{ fontWeight: 700, color: c.danger, mb: 0.5 }}>Danger Zone</Typography>
      <Typography variant="body2" sx={{ color: c.textBody, mb: 1.5 }}>
        Deleting your account permanently removes all zones, schedules, and history. This cannot be undone.
      </Typography>
      {!showDeleteConfirm ? (
        <Button size="small" variant="outlined" onClick={() => setShowDeleteConfirm(true)} sx={{ borderColor: c.danger, color: c.danger }}>
          Delete Account
        </Button>
      ) : (
        <Stack spacing={1.5}>
          <TextField
            size="small" type="password" label="Enter your password to confirm" value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)} fullWidth
          />
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }} sx={{ color: c.textBody }}>Cancel</Button>
            <Button size="small" variant="contained" disabled={deleting} onClick={handleDeleteAccount} sx={{ bgcolor: c.danger, '&:hover': { bgcolor: '#a5402d' } }}>
              {deleting ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          </Stack>
        </Stack>
      )}
    </Box>
  );

  if (isMobile) {
    return (
      <Box>
        {CATEGORIES.map(cat => (
          <Accordion
            key={cat.id}
            expanded={activeCategory === cat.id}
            onChange={() => setActiveCategory(activeCategory === cat.id ? '' : cat.id)}
            sx={{ mb: 1.5, borderRadius: 3, border: `1px solid ${c.border}`, boxShadow: 'none', '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <cat.icon sx={{ fontSize: 18, color: c.textDark }} />
                <Typography sx={{ fontWeight: 700, color: c.textDark }}>{cat.label}</Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>{categoryContent(cat.id)}</AccordionDetails>
          </Accordion>
        ))}
        {dangerZone}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
      <Box sx={{ width: 280, flexShrink: 0 }}>
        <Box sx={{ bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 4, p: 1.5, mb: 2 }}>
          <Stack spacing={0.5}>
            {CATEGORIES.map(cat => {
              const active = activeCategory === cat.id;
              return (
                <Button
                  key={cat.id}
                  fullWidth
                  onClick={() => setActiveCategory(cat.id)}
                  startIcon={<cat.icon sx={{ fontSize: 18 }} />}
                  sx={{
                    justifyContent: 'flex-start', px: 2, py: 1.3, borderRadius: 2, fontSize: 14,
                    bgcolor: active ? c.chipGreenBg : 'transparent',
                    color: active ? c.primaryGreen : c.textBody,
                    fontWeight: active ? 700 : 500,
                    '&:hover': { bgcolor: c.chipGreenBg },
                  }}
                >
                  {cat.label}
                </Button>
              );
            })}
          </Stack>
        </Box>
        {dangerZone}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 4, p: 3.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: c.textDark, mb: 3 }}>
          {CATEGORIES.find(cat => cat.id === activeCategory)?.label}
        </Typography>
        {categoryContent(activeCategory)}
      </Box>
    </Box>
  );
};

export default ProfileSettings;
