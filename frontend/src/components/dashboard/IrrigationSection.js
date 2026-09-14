import React, { useState, useEffect, useCallback } from 'react';
import { irrigationAPI, sensorAPI, recommendationAPI, visionAPI } from '../../services/api';
import {
  Box,
  Typography,
  Stack,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
  IconButton,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { nyuzaColors as c } from '../../Theme';

const MODE = { AUTO: 'auto', MANUAL: 'manual' };

const IrrigationSection = ({ onNotification }) => {
  const [zones, setZones] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [currentStatus, setCurrentStatus] = useState([]);
  const [sensorData, setSensorData] = useState(null);
  const [history, setHistory] = useState({ data: [], summary: {} });
  const [dosedByZone, setDosedByZone] = useState({});
  const [mode, setMode] = useState(MODE.AUTO);
  const [loading, setLoading] = useState(true);
  const [busyZone, setBusyZone] = useState(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [recommendation, setRecommendation] = useState(null);

  const notify = (msg, type = 'info') => onNotification?.(msg, type);

  const fetchIrrigationData = useCallback(async () => {
    try {
      const [zonesRes, schedulesRes, statusRes, historyRes, sensorRes, visionRes] = await Promise.all([
        irrigationAPI.getUserZones(),
        irrigationAPI.getSchedules(),
        irrigationAPI.getCurrentStatus(),
        irrigationAPI.getHistory(7),
        sensorAPI.getCurrentSensorData().catch(() => ({ data: {} })),
        visionAPI.getHistory(null, 100).catch(() => ({ data: {} })),
      ]);
      setZones(zonesRes.data?.zones || zonesRes.data?.data || (Array.isArray(zonesRes.data) ? zonesRes.data : []) || []);
      setSchedules(schedulesRes.data?.data || (Array.isArray(schedulesRes.data) ? schedulesRes.data : []) || []);
      setCurrentStatus(statusRes.data?.data || (Array.isArray(statusRes.data) ? statusRes.data : []) || []);
      setHistory({ data: historyRes.data?.data || [], summary: historyRes.data?.summary || {} });
      setSensorData(sensorRes.data?.data || null);

      // Map zone_id -> most recent dosed reading, for the "Last Dosed" line
      const readings = visionRes.data?.readings || [];
      const dosedMap = {};
      readings.filter(r => r.dosed).forEach(r => {
        if (!dosedMap[r.zone_id] || new Date(r.timestamp) > new Date(dosedMap[r.zone_id])) {
          dosedMap[r.zone_id] = r.timestamp;
        }
      });
      setDosedByZone(dosedMap);
    } catch (error) {
      console.error('Error fetching irrigation data:', error);
      notify('Failed to load irrigation data', 'error');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRecommendation = useCallback(async () => {
    try {
      const res = await recommendationAPI.getRecommendations('pending');
      const list = Array.isArray(res.data) ? res.data : [];
      const irrigationRec = list.find(r => (r.type || '').toLowerCase().includes('irrigat')) || list[0] || null;
      setRecommendation(irrigationRec);
    } catch (error) {
      console.error('Error fetching recommendation:', error);
    }
  }, []);

  useEffect(() => {
    fetchIrrigationData();
    fetchRecommendation();
    const interval = setInterval(fetchIrrigationData, 15000);
    return () => clearInterval(interval);
  }, [fetchIrrigationData, fetchRecommendation]);

  const getZoneStatus = (zoneName) =>
    Array.isArray(currentStatus) ? currentStatus.find(s => s.zone_name === zoneName) : null;

  const formatRelativeTime = (isoString) => {
    if (!isoString) return null;
    const diffMs = Date.now() - new Date(isoString).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  };

  const zoneBadge = (status) => {
    if (status?.is_irrigating) return { label: 'Irrigating Now', bg: c.chipGreenBg, fg: c.primaryGreen };
    if (status?.needs_irrigation) return { label: 'Dry Warning', bg: c.warningBg, fg: c.warning };
    return { label: 'Standby', bg: c.background, fg: c.textMuted };
  };

  const handleStart = async (zone, duration = 300) => {
    setBusyZone(zone.zone_name);
    try {
      await irrigationAPI.manualControl({ zone: zone.zone_name, duration });
      notify(`Irrigation started for ${zone.zone_name}`, 'success');
      setTimeout(fetchIrrigationData, 1500);
    } catch (error) {
      notify(`Failed to start irrigation for ${zone.zone_name}`, 'error');
    } finally {
      setBusyZone(null);
    }
  };

  const handleStop = async (zone) => {
    setBusyZone(zone.zone_name);
    try {
      await irrigationAPI.stopZoneIrrigation(zone.zone_name);
      notify(`Irrigation stopped for ${zone.zone_name}`, 'success');
      setTimeout(fetchIrrigationData, 1500);
    } catch (error) {
      notify(`Failed to stop irrigation for ${zone.zone_name} — check the Arduino connection`, 'error');
    } finally {
      setBusyZone(null);
    }
  };

  const handleToggleScheduleActive = async (schedule) => {
    try {
      await irrigationAPI.updateIrrigationSchedule(schedule.id, { is_active: !schedule.is_active });
      setSchedules(prev => prev.map(s => (s.id === schedule.id ? { ...s, is_active: !s.is_active } : s)));
      notify(`Schedule ${!schedule.is_active ? 'enabled' : 'disabled'}`, 'success');
    } catch (error) {
      notify('Failed to update schedule', 'error');
    }
  };

  const handleDeleteSchedule = async (schedule) => {
    if (!window.confirm(`Delete "${schedule.name}"? This cannot be undone.`)) return;
    try {
      await irrigationAPI.deleteIrrigationSchedule(schedule.id);
      setSchedules(prev => prev.filter(s => s.id !== schedule.id));
      notify('Schedule deleted', 'success');
    } catch (error) {
      notify('Failed to delete schedule', 'error');
    }
  };

  const handleSaveSchedule = async (formData) => {
    try {
      if (editingSchedule) {
        await irrigationAPI.updateIrrigationSchedule(editingSchedule.id, formData);
        notify('Schedule updated', 'success');
      } else {
        await irrigationAPI.createSchedule(formData);
        notify('Schedule created', 'success');
      }
      setShowScheduleForm(false);
      setEditingSchedule(null);
      fetchIrrigationData();
    } catch (error) {
      notify('Failed to save schedule', 'error');
    }
  };

  const scheduleDescription = (schedule) => {
    if (schedule.trigger_type === 'moisture') {
      return `Triggers automatically if soil moisture falls below ${schedule.moisture_threshold ?? 35}%`;
    }
    if (schedule.trigger_type === 'manual') {
      return 'Manual trigger only — runs when activated from this page';
    }
    return `Runs a ${Math.round((schedule.duration || 300) / 60)}-minute cycle when triggered`;
  };

  // ---- derived summary values (shared across both modes) ----
  const totalWaterUsed = history.summary?.total_water_used || 0;
  const activeZoneCount = currentStatus.filter(s => s.is_irrigating).length;
  const waterLevelRaw = sensorData?.water_level;
  const tankStatus = waterLevelRaw == null ? null : (waterLevelRaw <= 20 ? 'Good' : 'Low — refill soon');
  const nextSchedule = schedules
    .filter(s => s.is_active && !currentStatus.find(cs => cs.zone_name === s.zone_name)?.is_irrigating)
    .sort((a, b) => (a.moisture_threshold ?? 100) - (b.moisture_threshold ?? 100))[0];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress sx={{ color: c.primaryGreen }} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Summary bar — shared across both modes */}
      <Box sx={{ bgcolor: c.secondaryGreen, borderRadius: 4, p: 2.5, mb: 3, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        <SummaryItem
          label="Water Used (7 Days)"
          value={totalWaterUsed > 0 ? `${totalWaterUsed.toLocaleString()} Liters` : '— No data yet'}
        />
        <SummaryItem
          label="Tank Level"
          value={tankStatus || 'No sensor data'}
          accent={tankStatus === 'Low — refill soon' ? c.warning : undefined}
        />
        <SummaryItem label="Active Zones" value={`${activeZoneCount} / ${zones.length || 0} Irrigating`} />
        <SummaryItem
          label="Next Scheduled Cycle"
          value={nextSchedule ? `${nextSchedule.zone_name || ''} — ${nextSchedule.name}` : 'No active schedules'}
        />
      </Box>

      {/* Mode toggle */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          {mode === MODE.AUTO ? (
            <VisibilityRoundedIcon sx={{ fontSize: 20, color: c.textMuted }} />
          ) : (
            <TuneRoundedIcon sx={{ fontSize: 20, color: c.textMuted }} />
          )}
          <Typography variant="body2" sx={{ color: c.textMuted }}>
            {mode === MODE.AUTO
              ? 'System is running automatically — view-only.'
              : 'Manual mode — you can start, stop, and configure irrigation.'}
          </Typography>
        </Stack>
        <Box sx={{ display: 'inline-flex', bgcolor: c.chipGreenBg, borderRadius: 3, p: 0.5 }}>
          {[{ id: MODE.AUTO, label: 'Auto' }, { id: MODE.MANUAL, label: 'Manual' }].map(opt => (
            <Button
              key={opt.id}
              onClick={() => setMode(opt.id)}
              sx={{
                px: 2.5, py: 0.8, borderRadius: 2.5, fontWeight: 700, fontSize: 13,
                bgcolor: mode === opt.id ? 'white' : 'transparent',
                color: mode === opt.id ? c.textDark : c.textMuted,
                boxShadow: mode === opt.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                '&:hover': { bgcolor: mode === opt.id ? 'white' : 'transparent' },
              }}
            >
              {opt.label}
            </Button>
          ))}
        </Box>
      </Stack>

      {/* Zone cards — read-only in Auto, interactive in Manual */}
      <Typography variant="h6" sx={{ fontWeight: 700, color: c.textDark, mb: 2 }}>
        {mode === MODE.AUTO ? 'Live Farm Status' : 'Ground Zones Management'}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        {zones.length === 0 ? (
          <Typography variant="body2" sx={{ color: c.textMuted }}>No irrigation zones configured yet.</Typography>
        ) : zones.map(zone => {
          const status = getZoneStatus(zone.zone_name);
          const badge = zoneBadge(status);
          const isActive = !!status?.is_irrigating;
          const isBusy = busyZone === zone.zone_name;
          const lastDosed = dosedByZone[zone.zone_id];

          return (
            <Box
              key={zone.zone_id}
              sx={{ flex: '1 1 380px', minWidth: 300, bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 4, p: 2.5 }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                <Typography sx={{ fontWeight: 700, color: c.textDark, fontSize: 16 }}>{zone.zone_name}</Typography>
                <Chip label={badge.label} size="small" sx={{ bgcolor: badge.bg, color: badge.fg, fontWeight: 700, height: 22 }} />
              </Stack>
              <Stack direction="row" spacing={4} sx={{ mb: 1 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: c.textMuted }}>Soil Moisture</Typography>
                  <Typography sx={{ fontWeight: 700, color: c.textDark }}>
                    {status?.current_moisture != null ? `${status.current_moisture}%` : '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: c.textMuted }}>Water Need</Typography>
                  <Typography sx={{ fontWeight: 700, color: c.textDark }}>
                    {zone.water_requirement ? `${zone.water_requirement} L/day` : '—'}
                  </Typography>
                </Box>
              </Stack>
              <Typography variant="body2" sx={{ color: c.textMuted, mb: 0.3 }}>
                Last Irrigated: {formatRelativeTime(status?.last_irrigation) || 'No record yet'}
              </Typography>
              <Typography variant="body2" sx={{ color: c.textMuted, mb: 2 }}>
                Last Dosed: {formatRelativeTime(lastDosed) || 'No record yet'}
              </Typography>

              {mode === MODE.MANUAL && (
                isActive ? (
                  <Button
                    size="small"
                    variant="contained"
                    disabled={isBusy}
                    startIcon={<StopRoundedIcon sx={{ fontSize: 16 }} />}
                    onClick={() => handleStop(zone)}
                    sx={{ bgcolor: c.danger, '&:hover': { bgcolor: '#a5402d' } }}
                  >
                    {isBusy ? 'Stopping...' : 'Stop Irrigation'}
                  </Button>
                ) : (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                    {[[5, 300], [10, 600], [15, 900]].map(([mins, secs]) => (
                      <Button
                        key={mins}
                        size="small"
                        variant="outlined"
                        disabled={isBusy}
                        onClick={() => handleStart(zone, secs)}
                        sx={{ borderColor: c.border, color: c.textDark, fontWeight: 600 }}
                      >
                        {isBusy ? '...' : `${mins} min`}
                      </Button>
                    ))}
                  </Stack>
                )
              )}
            </Box>
          );
        })}
      </Box>

      {/* AI Recommendation — informational in both modes */}
      {recommendation && (
        <Box sx={{ bgcolor: c.chipGreenBg, borderRadius: 4, p: 2.5, mb: 3 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <AutoAwesomeRoundedIcon sx={{ color: c.primaryGreen, fontSize: 20 }} />
            <Typography sx={{ fontWeight: 700, color: c.textDark }}>Smart Recommendation</Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: c.textDark, fontWeight: 600, mb: 0.5 }}>
            {recommendation.title}
          </Typography>
          <Typography variant="body2" sx={{ color: c.textBody }}>
            {recommendation.description}
          </Typography>
        </Box>
      )}

      {/* Automatic Scheduling — manual mode only, this is where schedules are configured */}
      {mode === MODE.MANUAL && (
        <Box sx={{ bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 4, p: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: c.textDark }}>Automatic Scheduling</Typography>
            <Stack direction="row" spacing={1}>
              <IconButton size="small" onClick={fetchIrrigationData} title="Refresh">
                <RefreshRoundedIcon sx={{ fontSize: 18, color: c.textMuted }} />
              </IconButton>
              <Button
                size="small"
                variant="contained"
                startIcon={<AddRoundedIcon sx={{ fontSize: 16 }} />}
                onClick={() => { setEditingSchedule(null); setShowScheduleForm(true); }}
                sx={{ bgcolor: c.sidebarActive, '&:hover': { bgcolor: '#152018' } }}
              >
                Add New Trigger
              </Button>
            </Stack>
          </Stack>

          {schedules.length === 0 ? (
            <Typography variant="body2" sx={{ color: c.textMuted, py: 2 }}>No irrigation schedules configured yet.</Typography>
          ) : (
            <Stack spacing={0}>
              {schedules.map((schedule, i) => (
                <Stack
                  key={schedule.id}
                  direction="row"
                  alignItems="center"
                  spacing={2}
                  sx={{ py: 2, borderBottom: i < schedules.length - 1 ? `1px solid ${c.border}` : 'none' }}
                >
                  <Box sx={{ bgcolor: c.chipGreenBg, borderRadius: 2, px: 1.5, py: 1, minWidth: 64, textAlign: 'center' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: c.primaryGreen }}>
                      {Math.round((schedule.duration || 300) / 60)} min
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: c.textDark }} noWrap>
                      {schedule.zone_name ? `${schedule.zone_name} — ` : ''}{schedule.name}
                    </Typography>
                    <Typography variant="body2" sx={{ color: c.textMuted }} noWrap>
                      {scheduleDescription(schedule)}
                    </Typography>
                  </Box>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={!!schedule.is_active}
                        onChange={() => handleToggleScheduleActive(schedule)}
                        sx={{ '& .MuiSwitch-track': { bgcolor: c.border }, '& .Mui-checked+.MuiSwitch-track': { bgcolor: `${c.primaryGreen} !important` } }}
                      />
                    }
                    label={<Typography variant="body2" sx={{ color: c.textBody }}>Enabled</Typography>}
                    sx={{ m: 0 }}
                  />
                  <Button size="small" onClick={() => { setEditingSchedule(schedule); setShowScheduleForm(true); }} sx={{ color: c.textBody, minWidth: 0 }}>
                    Edit
                  </Button>
                  <IconButton size="small" onClick={() => handleDeleteSchedule(schedule)}>
                    <DeleteOutlineRoundedIcon sx={{ fontSize: 18, color: c.danger }} />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
          )}
        </Box>
      )}

      {showScheduleForm && (
        <ScheduleDialog
          zones={zones}
          editSchedule={editingSchedule}
          onSave={handleSaveSchedule}
          onClose={() => { setShowScheduleForm(false); setEditingSchedule(null); }}
        />
      )}
    </Box>
  );
};

const SummaryItem = ({ label, value, accent }) => (
  <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
    <Typography variant="caption" sx={{ color: '#8e9e94', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
      {label}
    </Typography>
    <Typography variant="h6" sx={{ color: accent || 'white', fontWeight: 800 }} noWrap>
      {value}
    </Typography>
  </Box>
);

const ScheduleDialog = ({ zones, editSchedule, onSave, onClose }) => {
  const [form, setForm] = useState({
    zone_id: editSchedule?.zone_id || (zones[0]?.zone_id ?? ''),
    name: editSchedule?.name || '',
    trigger_type: editSchedule?.trigger_type || 'moisture',
    moisture_threshold: editSchedule?.moisture_threshold ?? 35,
    duration: editSchedule?.duration ?? 300,
    minimum_interval: editSchedule?.minimum_interval ?? 3600,
    max_daily_irrigations: editSchedule?.max_daily_irrigations ?? 3,
    is_active: editSchedule?.is_active ?? true,
  });

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, color: c.textDark }}>
        {editSchedule ? 'Edit Trigger' : 'Add New Trigger'}
        <IconButton onClick={onClose} size="small"><CloseRoundedIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <TextField select label="Zone" value={form.zone_id} onChange={(e) => set('zone_id', Number(e.target.value))} fullWidth>
            {zones.map(z => <MenuItem key={z.zone_id} value={z.zone_id}>{z.zone_name}</MenuItem>)}
          </TextField>
          <TextField label="Trigger Name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Tomato Block Smart-Boost" fullWidth />
          <TextField select label="Trigger Type" value={form.trigger_type} onChange={(e) => set('trigger_type', e.target.value)} fullWidth>
            <MenuItem value="moisture">Moisture Level</MenuItem>
            <MenuItem value="timed">Timed / Duration</MenuItem>
            <MenuItem value="manual">Manual Only</MenuItem>
          </TextField>
          {form.trigger_type === 'moisture' && (
            <TextField
              type="number" label="Moisture Threshold (%)" value={form.moisture_threshold}
              onChange={(e) => set('moisture_threshold', Number(e.target.value))}
              inputProps={{ min: 0, max: 100 }} fullWidth
              helperText="Irrigate when moisture drops below this percentage"
            />
          )}
          <TextField
            type="number" label="Duration (seconds)" value={form.duration}
            onChange={(e) => set('duration', Number(e.target.value))}
            inputProps={{ min: 60, step: 60 }} fullWidth
            helperText="How long to run irrigation when triggered"
          />
          <TextField
            type="number" label="Minimum Interval (seconds)" value={form.minimum_interval}
            onChange={(e) => set('minimum_interval', Number(e.target.value))}
            inputProps={{ min: 3600, step: 3600 }} fullWidth
            helperText="Minimum time between irrigations"
          />
          <TextField
            type="number" label="Max Daily Irrigations" value={form.max_daily_irrigations}
            onChange={(e) => set('max_daily_irrigations', Number(e.target.value))}
            inputProps={{ min: 1, max: 10 }} fullWidth
          />
          <FormControlLabel
            control={<Switch checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />}
            label="Active"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 3, pt: 1 }}>
        <Button onClick={onClose} sx={{ color: c.textBody }}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!form.zone_id || !form.name.trim()}
          onClick={() => onSave(form)}
          sx={{ bgcolor: c.sidebarActive, '&:hover': { bgcolor: '#152018' } }}
        >
          {editSchedule ? 'Update Trigger' : 'Create Trigger'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default IrrigationSection;
