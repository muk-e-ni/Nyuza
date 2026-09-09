import React, { useState, useEffect, useCallback } from 'react';
import { visionAPI } from '../../services/api';
import {
  Paper,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Chip,
  Card,
  CardContent,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Divider
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CameraAlt as CameraIcon,
  CheckCircle as CheckIcon,
  WarningAmber as WarningIcon,
  BugReport as BugIcon,
  LocalFlorist as LeafIcon
} from '@mui/icons-material';

// Roughly matches the ~3 minute check cadence in vision_monitoring_service.py
// closely enough to feel "live" without polling too aggressively.
const REFRESH_INTERVAL_MS = 60000;

const formatLabel = (predictedClass) =>
  (predictedClass || '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const modelLabel = (modelVersion) => {
  if (modelVersion?.startsWith('disease')) return 'Disease Check';
  if (modelVersion?.startsWith('pest')) return 'Pest Check';
  return modelVersion || 'Vision Check';
};

const modelIcon = (modelVersion) =>
  modelVersion?.startsWith('pest') ? <BugIcon fontSize="small" /> : <LeafIcon fontSize="small" />;

const VisionMonitoringPanel = () => {
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  const fetchHistory = useCallback(async () => {
    try {
      setError(null);
      const response = await visionAPI.getHistory(15);
      setReadings(response?.data?.readings || []);
      setLastFetched(new Date());
    } catch (err) {
      console.error('Error fetching vision history:', err);
      setError('Could not load camera detections. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const latest = readings[0];
  const latestIsIssue = Boolean(latest) && !latest.is_healthy;
  const recent = readings.slice(0, 10);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={3}>
        <CircularProgress size={24} sx={{ mr: 2 }} />
        <Typography variant="body1">Loading camera detections...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert
        severity="warning"
        action={
          <IconButton size="small" onClick={fetchHistory}>
            <RefreshIcon />
          </IconButton>
        }
      >
        {error}
      </Alert>
    );
  }

  return (
    <Paper elevation={2} sx={{ p: 0, overflow: 'hidden' }}>
      <Box
        sx={{
          p: 2,
          bgcolor: latestIsIssue ? 'warning.main' : 'primary.main',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CameraIcon />
          <Typography variant="h6" component="h2">
            Vision Monitoring
          </Typography>
        </Box>
        <IconButton size="small" onClick={fetchHistory} sx={{ color: 'white' }}>
          <RefreshIcon />
        </IconButton>
      </Box>

      <Box sx={{ p: 2 }}>
        {!latest ? (
          <Alert severity="info">
            No camera detections yet — the monitoring service checks automatically every few minutes.
          </Alert>
        ) : (
          <Card sx={{ mb: 2, bgcolor: latestIsIssue ? '#fff3e0' : '#e8f5e8' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                {latestIsIssue ? (
                  <WarningIcon color="warning" sx={{ mr: 1 }} />
                ) : (
                  <CheckIcon color="success" sx={{ mr: 1 }} />
                )}
                <Typography variant="h6" component="h3">
                  {latestIsIssue ? `${formatLabel(latest.predicted_class)} detected` : 'All Clear'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip icon={modelIcon(latest.model_version)} label={modelLabel(latest.model_version)} size="small" />
                <Chip label={`Confidence: ${(latest.confidence * 100).toFixed(0)}%`} size="small" variant="outlined" />
                <Chip label={new Date(latest.timestamp).toLocaleString()} size="small" variant="outlined" />
              </Box>
            </CardContent>
          </Card>
        )}

        <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
          Recent checks
        </Typography>

        {recent.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing logged yet.
          </Typography>
        ) : (
          <List dense disablePadding>
            {recent.map((r, idx) => (
              <React.Fragment key={r.reading_id}>
                <ListItem sx={{ px: 0 }}>
                  <Box sx={{ mr: 1.5, display: 'flex', alignItems: 'center' }}>
                    {r.is_healthy ? (
                      <CheckIcon color="success" fontSize="small" />
                    ) : (
                      <WarningIcon color="warning" fontSize="small" />
                    )}
                  </Box>
                  <ListItemText
                    primary={`${formatLabel(r.predicted_class)} — ${(r.confidence * 100).toFixed(0)}%`}
                    secondary={`${modelLabel(r.model_version)} · ${new Date(r.timestamp).toLocaleTimeString()}`}
                  />
                </ListItem>
                {idx < recent.length - 1 && <Divider component="li" />}
              </React.Fragment>
            ))}
          </List>
        )}

        {lastFetched && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: 'right' }}>
            Last refreshed {lastFetched.toLocaleTimeString()} · auto-refreshes every minute
          </Typography>
        )}
      </Box>
    </Paper>
  );
};

export default VisionMonitoringPanel;