import React, { useState, useEffect, useCallback } from 'react';
import { systemAPI, zoneAPI, notificationAPI } from '../../services/api';
import {
  Box,
  Typography,
  Stack,
  Button,
  Switch,
  Slider,
  TextField,
  MenuItem,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  useMediaQuery,
} from '@mui/material';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import WaterDropRoundedIcon from '@mui/icons-material/WaterDropRounded';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { nyuzaColors as c } from '../../Theme';

const CATEGORIES = [
  { id: 'general', label: 'General Settings', icon: SettingsRoundedIcon },
  { id: 'irrigation', label: 'Irrigation Configuration', icon: WaterDropRoundedIcon },
  { id: 'zones', label: 'Zone Configuration', icon: GridViewRoundedIcon },
  { id: 'alerts', label: 'Alerts & Notifications', icon: NotificationsRoundedIcon },
  { id: 'ai', label: 'AI & ML Settings', icon: MemoryRoundedIcon },
];

const DEFAULT_SETTINGS = {
  weatherApiKey: '',
  dataRetention: 90,
  theme: 'light',
  typography: 'Roboto',
  language: 'en',
  timeFormat: '24',
  defaultDuration: 10,
  maxDailyWater: 1000,
  minInterval: 4,
  smartIrrigation: true,
  weatherAdaptive: true,
  soilMoistureThreshold: 45,
  lowWaterAlert: 20,
  sensorAlert: true,
  irrigationTriggerAlert: true,
  pesticideOrderAlert: true,
  weatherWarningAlert: true,
  aiModelVersion: '2.4.1',
  learningMode: 'active',
  confidenceThreshold: 75,
  autoApply: false,
  shareDataForImprovement: true,
  lastUpdated: null,
};

const SystemSettings = ({ onNotification }) => {
  const isMobile = useMediaQuery('(max-width:900px)');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [zones, setZones] = useState([]);
  const [activeCategory, setActiveCategory] = useState('general');
  const [expandedZoneId, setExpandedZoneId] = useState(null);
  const [zoneDraft, setZoneDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [savingZone, setSavingZone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notificationMethods, setNotificationMethods] = useState({ email: false, sms: false, push: false, web: true });
  const [testing, setTesting] = useState(null);

  const notify = (msg, type = 'info') => onNotification?.(msg, type);

  const fetchAll = useCallback(async () => {
    try {
      const [settingsRes, zonesRes, prefsRes] = await Promise.all([
        systemAPI.getSettings(),
        systemAPI.getZones(),
        notificationAPI.getNotificationPreferences().catch(() => ({ data: {} })),
      ]);
      setSettings(prev => ({ ...prev, ...(settingsRes?.data || {}) }));
      const zonesData = zonesRes?.data?.zones || zonesRes?.data?.data || zonesRes?.data || [];
      setZones(Array.isArray(zonesData) ? zonesData : []);
      if (Array.isArray(zonesData) && zonesData.length > 0) setExpandedZoneId(zonesData[0].zone_id);
      if (prefsRes?.data?.preferences?.notification_methods) setNotificationMethods(prefsRes.data.preferences.notification_methods);
    } catch (error) {
      console.error('Error fetching settings:', error);
      notify('Failed to load some settings', 'error');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const zone = zones.find(z => z.zone_id === expandedZoneId);
    if (zone) {
      setZoneDraft({
        zone_name: zone.zone_name || '',
        crop_type: zone.crop_type || '',
        soil_type: zone.soil_type || '',
        area_sqm: zone.area_sqm ?? '',
      });
    }
  }, [expandedZoneId, zones]);

  const set = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await systemAPI.updateSettings({ ...settings, notificationMethods, lastUpdated: new Date().toISOString() });
      notify('Settings saved successfully', 'success');
    } catch (error) {
      notify('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResetCategory = () => {
    if (!window.confirm('Reset this category to its default values?')) return;
    setSettings(prev => ({ ...prev, ...DEFAULT_SETTINGS }));
    notify('Reset to defaults — remember to save', 'info');
  };

  const handleNotificationMethodChange = async (method, enabled) => {
    const updated = { ...notificationMethods, [method]: enabled };
    setNotificationMethods(updated);
    try {
      await notificationAPI.updateNotificationPreferences({ notification_methods: updated });
    } catch (error) {
      notify('Failed to update notification preferences', 'error');
    }
  };

  const handleTestNotification = async (type) => {
    setTesting(type);
    try {
      const res = await notificationAPI.testNotification(type);
      notify(res.data?.success ? `${type.toUpperCase()} test sent` : `${type} test failed`, res.data?.success ? 'success' : 'error');
    } catch (error) {
      notify(`Failed to test ${type}`, 'error');
    } finally {
      setTesting(null);
    }
  };

  const handleSaveZone = async () => {
    setSavingZone(true);
    try {
      await zoneAPI.updateZone(expandedZoneId, zoneDraft);
      setZones(prev => prev.map(z => (z.zone_id === expandedZoneId ? { ...z, ...zoneDraft } : z)));
      notify('Zone updated successfully', 'success');
    } catch (error) {
      notify('Failed to update zone — please try again', 'error');
    } finally {
      setSavingZone(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress sx={{ color: c.primaryGreen }} />
      </Box>
    );
  }

  const categoryContent = (id) => {
    switch (id) {
      case 'general':
        return (
          <Stack divider={<Box sx={{ borderBottom: `1px solid ${c.border}` }} />} spacing={0}>
            <SettingRow label="Application Theme" description="Switch between cosmetic modes of the farm operator interface.">
              <SegmentedControl value={settings.theme} onChange={(v) => set('theme', v)} options={[['light', 'Light'], ['dark', 'Dark'], ['system', 'System']]} />
            </SettingRow>
            <SettingRow label="Typography Preference" description="Select the default primary typeface used across control metrics.">
              <TextField select size="small" value={settings.typography} onChange={(e) => set('typography', e.target.value)} sx={{ minWidth: 200 }}>
                <MenuItem value="Roboto">Roboto (Default)</MenuItem>
                <MenuItem value="Inter">Inter</MenuItem>
                <MenuItem value="System">System UI</MenuItem>
              </TextField>
            </SettingRow>
            <SettingRow label="Language Selection" description="Changes the localized text for all charts, operations, and warnings.">
              <TextField select size="small" value={settings.language} onChange={(e) => set('language', e.target.value)} sx={{ minWidth: 200 }}>
                <MenuItem value="en">English (US)</MenuItem>
                <MenuItem value="sw">Swahili</MenuItem>
                <MenuItem value="fr">French</MenuItem>
              </TextField>
            </SettingRow>
            <SettingRow label="Telemetry Data Retention" description="How long IoT sensor logs and moisture history are archived locally.">
              <SliderRow value={settings.dataRetention} min={30} max={365} onChange={(v) => set('dataRetention', v)} format={(v) => (v >= 360 ? '1 Year' : `${v} days`)} />
            </SettingRow>
            <SettingRow label="Date / Time Standard" description="Format displayed across localized operations and irrigation logs.">
              <SegmentedControl value={settings.timeFormat} onChange={(v) => set('timeFormat', v)} options={[['12', '12-hour'], ['24', '24-hour']]} />
            </SettingRow>
          </Stack>
        );

      case 'irrigation':
        return (
          <Stack divider={<Box sx={{ borderBottom: `1px solid ${c.border}` }} />} spacing={0}>
            <SettingRow label="Default Irrigation Duration" description="Default operating timeframe for newly triggered general cycles.">
              <NumberField value={settings.defaultDuration} onChange={(v) => set('defaultDuration', v)} suffix="minutes" min={1} max={60} />
            </SettingRow>
            <SettingRow label="Maximum Daily Water Usage" description="A safety cap to alert management and stop triggers when threshold is breached.">
              <NumberField value={settings.maxDailyWater} onChange={(v) => set('maxDailyWater', v)} suffix="Liters" min={100} max={5000} />
            </SettingRow>
            <SettingRow label="Minimum Interval Between Irrigations" description="Resting period between zone active states to avoid root drowning.">
              <NumberField value={settings.minInterval} onChange={(v) => set('minInterval', v)} suffix="hours" min={1} max={24} />
            </SettingRow>
            <SettingRow label="Enable Smart Irrigation" description="Allow the system to automatically trigger and adjust irrigation based on sensor data and weather forecasts.">
              <ToggleSwitch checked={settings.smartIrrigation} onChange={(v) => set('smartIrrigation', v)} />
            </SettingRow>
            {settings.smartIrrigation && (
              <Box sx={{ bgcolor: c.background, borderRadius: 3, p: 2, ml: { md: 2 } }}>
                <Stack divider={<Box sx={{ borderBottom: `1px solid ${c.border}` }} />} spacing={0}>
                  <SettingRow label="Weather-Adaptive Mode" description="Automatically skip scheduled watering days if precipitation is imminent.">
                    <ToggleSwitch checked={settings.weatherAdaptive} onChange={(v) => set('weatherAdaptive', v)} />
                  </SettingRow>
                  <SettingRow label="Soil Moisture Threshold" description="Target baseline limit to start auto-irrigation.">
                    <SliderRow value={settings.soilMoistureThreshold} min={10} max={80} onChange={(v) => set('soilMoistureThreshold', v)} format={(v) => `${v}%`} />
                  </SettingRow>
                </Stack>
              </Box>
            )}
          </Stack>
        );

      case 'zones': {
        return (
          <Stack spacing={2}>
            {zones.length === 0 && (
              <Typography variant="body2" sx={{ color: c.textMuted }}>No zones configured yet.</Typography>
            )}
            {zones.map(zone => {
              const isOpen = zone.zone_id === expandedZoneId;
              return (
                <Box key={zone.zone_id} sx={{ border: `1px solid ${c.border}`, borderRadius: 3, p: 2.5 }}>
                  {isOpen ? (
                    <Stack spacing={2}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box>
                          <Typography variant="caption" sx={{ color: c.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>
                            Editing: {zone.zone_name}
                          </Typography>
                          <Typography variant="body2" sx={{ color: c.textBody }}>Zone parameters</Typography>
                        </Box>
                        <Chip
                          label={zone.is_active !== false ? 'Active State' : 'Inactive'}
                          size="small"
                          sx={{ bgcolor: zone.is_active !== false ? c.chipGreenBg : c.dangerBg, color: zone.is_active !== false ? c.primaryGreen : c.danger, fontWeight: 700 }}
                        />
                      </Stack>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                        <TextField label="Zone Name" size="small" value={zoneDraft.zone_name || ''} onChange={(e) => setZoneDraft(p => ({ ...p, zone_name: e.target.value }))} sx={{ flex: '1 1 160px' }} />
                        <TextField label="Crop / Plant Type" size="small" value={zoneDraft.crop_type || ''} onChange={(e) => setZoneDraft(p => ({ ...p, crop_type: e.target.value }))} sx={{ flex: '1 1 160px' }} />
                        <TextField label="Soil Type" size="small" value={zoneDraft.soil_type || ''} onChange={(e) => setZoneDraft(p => ({ ...p, soil_type: e.target.value }))} sx={{ flex: '1 1 160px' }} />
                        <TextField label="Area (m²)" size="small" type="number" value={zoneDraft.area_sqm ?? ''} onChange={(e) => setZoneDraft(p => ({ ...p, area_sqm: e.target.value }))} sx={{ flex: '1 1 120px' }} />
                      </Box>
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button size="small" onClick={() => setExpandedZoneId(null)} sx={{ color: c.textBody }}>Cancel</Button>
                        <Button size="small" variant="contained" disabled={savingZone} onClick={handleSaveZone} sx={{ bgcolor: c.sidebarActive, '&:hover': { bgcolor: '#152018' } }}>
                          {savingZone ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </Stack>
                    </Stack>
                  ) : (
                    <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: c.textDark }}>
                          {zone.zone_name} {zone.area_sqm ? `· ${zone.area_sqm} m²` : ''}
                        </Typography>
                        <Typography variant="body2" sx={{ color: c.textMuted }}>
                          {zone.crop_type || 'No crop set'} · {zone.soil_type || 'No soil set'}
                        </Typography>
                      </Box>
                      <Button size="small" variant="outlined" onClick={() => setExpandedZoneId(zone.zone_id)} sx={{ borderColor: c.border, color: c.textDark }}>
                        Edit
                      </Button>
                    </Stack>
                  )}
                </Box>
              );
            })}
          </Stack>
        );
      }

      case 'alerts':
        return (
          <Stack spacing={4}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: c.textDark, mb: 1 }}>Notification Channels</Typography>
              <Stack divider={<Box sx={{ borderBottom: `1px solid ${c.border}` }} />} spacing={0}>
                <SettingRow label="SMS Alerts" description="Send automated texts for critical, high-importance operational alerts.">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <ToggleSwitch checked={notificationMethods.sms} onChange={(v) => handleNotificationMethodChange('sms', v)} />
                    <Button size="small" disabled={!notificationMethods.sms || testing === 'sms'} onClick={() => handleTestNotification('sms')} sx={{ color: c.primaryGreen, minWidth: 0 }}>
                      {testing === 'sms' ? '...' : 'Test'}
                    </Button>
                  </Stack>
                </SettingRow>
                <SettingRow label="Email Notifications" description="Receive general summaries and system reports.">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <ToggleSwitch checked={notificationMethods.email} onChange={(v) => handleNotificationMethodChange('email', v)} />
                    <Button size="small" disabled={!notificationMethods.email || testing === 'email'} onClick={() => handleTestNotification('email')} sx={{ color: c.primaryGreen, minWidth: 0 }}>
                      {testing === 'email' ? '...' : 'Test'}
                    </Button>
                  </Stack>
                </SettingRow>
                <SettingRow label="Push Notifications" description="Allow instant mobile app warnings.">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <ToggleSwitch checked={notificationMethods.push} onChange={(v) => handleNotificationMethodChange('push', v)} />
                    <Button size="small" disabled={!notificationMethods.push || testing === 'push'} onClick={() => handleTestNotification('push')} sx={{ color: c.primaryGreen, minWidth: 0 }}>
                      {testing === 'push' ? '...' : 'Test'}
                    </Button>
                  </Stack>
                </SettingRow>
              </Stack>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: c.textDark, mb: 1 }}>Alert Types</Typography>
              <Stack divider={<Box sx={{ borderBottom: `1px solid ${c.border}` }} />} spacing={0}>
                <SettingRow label="Low Water Level Alert" description="Alert threshold for reservoir capacities before emergency block actions.">
                  <NumberField value={settings.lowWaterAlert} onChange={(v) => set('lowWaterAlert', v)} suffix="%" min={5} max={50} />
                </SettingRow>
                <SettingRow label="Irrigation Trigger Alert" description="Receive pings when cycles start or end on ground blocks.">
                  <ToggleSwitch checked={settings.irrigationTriggerAlert} onChange={(v) => set('irrigationTriggerAlert', v)} />
                </SettingRow>
                <SettingRow label="Pesticide Order Confirmation Alert" description="Trigger a notification once orders are confirmed by suppliers.">
                  <ToggleSwitch checked={settings.pesticideOrderAlert} onChange={(v) => set('pesticideOrderAlert', v)} />
                </SettingRow>
                <SettingRow label="Sensor Failure Alert" description="Urgent ping when IoT soil moisture telemetry drops or disconnects.">
                  <ToggleSwitch checked={settings.sensorAlert} onChange={(v) => set('sensorAlert', v)} />
                </SettingRow>
                <SettingRow label="Weather Warning Alert" description="Severe thunderstorm or freeze predictions affecting crop fields.">
                  <ToggleSwitch checked={settings.weatherWarningAlert} onChange={(v) => set('weatherWarningAlert', v)} />
                </SettingRow>
              </Stack>
            </Box>
          </Stack>
        );

      case 'ai':
        return (
          <Stack divider={<Box sx={{ borderBottom: `1px solid ${c.border}` }} />} spacing={0}>
            <SettingRow label="Algorithm Version" description="Current running model version details.">
              <Chip label={`v${settings.aiModelVersion} (Latest) ✓`} size="small" sx={{ bgcolor: c.chipGreenBg, color: c.primaryGreen, fontWeight: 700 }} />
            </SettingRow>
            <Box sx={{ py: 2.5 }}>
              <Typography sx={{ fontWeight: 700, color: c.textDark, mb: 1.5 }}>Learning Mode Selector</Typography>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                {[
                  { id: 'passive', label: 'Passive', desc: 'Collects data silently. No smart action alerts are served.' },
                  { id: 'active', label: 'Active Mode', desc: 'Full triggers active. Serves real-time irrigation advice.', tag: 'Recommended' },
                  { id: 'disabled', label: 'Disabled', desc: 'Disconnects pipeline triggers. Pure scheduling logic fallback.' },
                ].map(mode => (
                  <Box
                    key={mode.id}
                    onClick={() => set('learningMode', mode.id)}
                    sx={{
                      flex: '1 1 200px', cursor: 'pointer', borderRadius: 3, p: 2,
                      border: `2px solid ${settings.learningMode === mode.id ? c.primaryGreen : c.border}`,
                      bgcolor: settings.learningMode === mode.id ? c.chipGreenBg : 'white',
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Typography sx={{ fontWeight: 700, color: c.textDark, fontSize: 14 }}>{mode.label}</Typography>
                      {mode.tag && <Chip label={mode.tag} size="small" sx={{ bgcolor: c.primaryGreen, color: 'white', fontWeight: 700, height: 18, fontSize: 10 }} />}
                    </Stack>
                    <Typography variant="body2" sx={{ color: c.textBody, fontSize: 12.5 }}>{mode.desc}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
            <SettingRow label="Recommendation Confidence Threshold" description="Define the minimum probability certainty required to suggest field tasks.">
              <SliderRow value={settings.confidenceThreshold} min={50} max={95} onChange={(v) => set('confidenceThreshold', v)} format={(v) => `${v}%`} />
            </SettingRow>
            <SettingRow label="Automatically apply high-confidence recommendations" description="Recommendations above the confidence threshold will be applied without manual review.">
              <ToggleSwitch checked={settings.autoApply} onChange={(v) => set('autoApply', v)} />
            </SettingRow>
            <SettingRow label="Include my farm data in model improvement" description="Securely and anonymously upload telemetry variables to enhance Nyuza core models.">
              <ToggleSwitch checked={settings.shareDataForImprovement} onChange={(v) => set('shareDataForImprovement', v)} />
            </SettingRow>
            <Stack direction="row" justifyContent="space-between" sx={{ py: 2 }}>
              <Typography variant="body2" sx={{ color: c.textBody }}>Last Model Update</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: c.textDark }}>
                {settings.lastUpdated ? new Date(settings.lastUpdated).toLocaleString() : 'Not yet updated'}
              </Typography>
            </Stack>
          </Stack>
        );

      default:
        return null;
    }
  };

  const currentCategory = CATEGORIES.find(cat => cat.id === activeCategory);

  const footer = (
    <Stack direction="row" spacing={1.5} justifyContent="flex-end" sx={{ mt: 3 }}>
      <Button variant="outlined" onClick={handleResetCategory} sx={{ borderColor: c.border, color: c.textBody }}>
        Reset to Defaults
      </Button>
      <Button variant="contained" disabled={saving} onClick={handleSave} sx={{ bgcolor: c.sidebarActive, '&:hover': { bgcolor: '#152018' } }}>
        {saving ? 'Saving...' : 'Save Settings'}
      </Button>
    </Stack>
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
        {footer}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
      <Box sx={{ width: 280, flexShrink: 0, bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 4, p: 1.5 }}>
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
      <Box sx={{ flex: 1, minWidth: 0, bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 4, p: 3.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: c.textDark, mb: 3 }}>
          {currentCategory?.label}
        </Typography>
        {categoryContent(activeCategory)}
        {footer}
      </Box>
    </Box>
  );
};

// ---- shared field primitives ----

const SettingRow = ({ label, description, children }) => (
  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, py: 2.5, justifyContent: 'space-between', alignItems: 'center' }}>
    <Box sx={{ flex: '1 1 280px', minWidth: 0 }}>
      <Typography variant="body2" sx={{ fontWeight: 700, color: c.textDark }}>{label}</Typography>
      {description && <Typography variant="body2" sx={{ color: c.textMuted, mt: 0.3 }}>{description}</Typography>}
    </Box>
    <Box sx={{ flexShrink: 0 }}>{children}</Box>
  </Box>
);

const ToggleSwitch = ({ checked, onChange }) => (
  <Switch
    checked={!!checked}
    onChange={(e) => onChange(e.target.checked)}
    sx={{ '& .MuiSwitch-track': { bgcolor: c.border }, '& .Mui-checked+.MuiSwitch-track': { bgcolor: `${c.primaryGreen} !important` } }}
  />
);

const NumberField = ({ value, onChange, suffix, min, max }) => (
  <TextField
    size="small"
    type="number"
    value={value}
    onChange={(e) => onChange(Number(e.target.value))}
    inputProps={{ min, max }}
    InputProps={{ endAdornment: suffix ? <Typography variant="caption" sx={{ color: c.textMuted, ml: 1 }}>{suffix}</Typography> : undefined }}
    sx={{ width: 160 }}
  />
);

const SliderRow = ({ value, min, max, onChange, format }) => (
  <Stack direction="row" spacing={2} alignItems="center" sx={{ width: 260 }}>
    <Slider
      value={value}
      min={min}
      max={max}
      onChange={(_, v) => onChange(v)}
      sx={{ color: c.primaryGreen, flex: 1 }}
    />
    <Typography variant="body2" sx={{ fontWeight: 700, color: c.textDark, minWidth: 56, textAlign: 'right' }}>
      {format ? format(value) : value}
    </Typography>
  </Stack>
);

const SegmentedControl = ({ value, onChange, options }) => (
  <Box sx={{ display: 'inline-flex', bgcolor: c.chipGreenBg, borderRadius: 2.5, p: 0.4 }}>
    {options.map(([id, label]) => (
      <Button
        key={id}
        onClick={() => onChange(id)}
        size="small"
        sx={{
          px: 2, borderRadius: 2, fontWeight: 700, fontSize: 13,
          bgcolor: value === id ? 'white' : 'transparent',
          color: value === id ? c.textDark : c.textMuted,
          boxShadow: value === id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          '&:hover': { bgcolor: value === id ? 'white' : 'transparent' },
        }}
      >
        {label}
      </Button>
    ))}
  </Box>
);

export default SystemSettings;
