import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Stack,
  Button,
  CircularProgress,
  Alert,
  TextField,
  MenuItem,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import LocalFloristRoundedIcon from '@mui/icons-material/LocalFloristRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ThumbUpRoundedIcon from '@mui/icons-material/ThumbUpRounded';
import ThumbDownRoundedIcon from '@mui/icons-material/ThumbDownRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { visionAPI } from '../../services/api';
import { nyuzaColors as c } from '../../Theme';

// There's one real camera configured on the backend (services/vision_monitoring_service.py,
// CAMERA_SOURCE — a phone running IP Webcam), not the four zone cameras the Figma mock
// showed. This tile reflects that one real feed rather than faking four.

function timeAgo(isoString) {
  if (!isoString) return '';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatClassName(predictedClass) {
  if (!predictedClass) return 'Unknown';
  return predictedClass
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function modelLabel(modelVersion) {
  if (modelVersion?.startsWith('disease')) return 'Disease Check';
  if (modelVersion?.startsWith('pest')) return 'Pest Check';
  return modelVersion || 'Vision Check';
}

// Mirrors backend/services/vision_monitoring_service.py's ADVICE dict keys —
// used only to offer sensible correction options in the feedback widget.
const CLASSES_BY_MODEL = {
  disease: ['healthy', 'common_rust', 'gray_leaf_spot', 'northern_leaf_blight'],
  pest: ['no_pest', 'corn_borer', 'army_worm', 'aphid', 'potosia_brevitarsis'],
};

function classOptionsFor(modelVersion) {
  if (modelVersion?.startsWith('pest')) return CLASSES_BY_MODEL.pest;
  return CLASSES_BY_MODEL.disease;
}

function ModelIcon({ modelVersion, sx }) {
  return modelVersion?.startsWith('pest')
    ? <BugReportRoundedIcon sx={sx} />
    : <LocalFloristRoundedIcon sx={sx} />;
}

const VisionMonitoringSection = ({ onNotification }) => {
  const [mode, setMode] = useState('auto'); // 'auto' | 'manual'

  // ---- Status (real: is the background loop running, models ready, last check) ----
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [streamOk, setStreamOk] = useState(true);

  // ---- History (combined disease + pest readings) ----
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const [dismissed, setDismissed] = useState(new Set());

  // ---- Manual diagnosis workspace ----
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [capturingSnapshot, setCapturingSnapshot] = useState(false);
  const [lastResults, setLastResults] = useState(null); // array of per-model results
  const [analyzeError, setAnalyzeError] = useState(null);
  const fileInputRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await visionAPI.getStatus();
      setStatus(response?.data?.status || null);
      setStatusError(null);
    } catch (error) {
      console.error('Error fetching vision status:', error);
      setStatusError('Could not reach the vision monitoring service.');
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      setHistoryError(null);
      const response = await visionAPI.getHistory(null, 12);
      setHistory(response?.data?.readings || []);
    } catch (error) {
      console.error('Error fetching vision history:', error);
      setHistoryError('Could not load detection history from the server.');
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchHistory();
    const statusInterval = setInterval(fetchStatus, 30000);
    const historyInterval = setInterval(fetchHistory, 30000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(historyInterval);
    };
  }, [fetchStatus, fetchHistory]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const setFileAndPreview = (file) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    setAnalyzeError(null);
  };

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (file) setFileAndPreview(file);
    e.target.value = '';
  };

  const handleCaptureSnapshot = async () => {
    setCapturingSnapshot(true);
    setAnalyzeError(null);
    try {
      const response = await visionAPI.getSnapshotBlob();
      const blob = response.data;
      const file = new File([blob], `snapshot_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setFileAndPreview(file);
    } catch (error) {
      console.error('Error capturing snapshot:', error);
      const message = error?.response?.data?.error || 'Could not reach the camera for a snapshot.';
      setAnalyzeError(message);
    } finally {
      setCapturingSnapshot(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const response = await visionAPI.analyze(selectedFile);
      const results = response?.data?.results || [];
      setLastResults(results);

      const problems = results.filter((r) => !r.is_negative);
      if (problems.length === 0) {
        onNotification?.('Analysis complete: no issues found.', 'success');
      } else {
        const top = problems.find((r) => r.primary) || problems[0];
        const extra = problems.length > 1 ? ` (also checked: ${modelLabel(problems.find((r) => r !== top)?.model_version)})` : '';
        onNotification?.(`Analysis complete: likely ${formatClassName(top.predicted_class)}${extra}`, 'info');
      }
      fetchHistory();
    } catch (error) {
      console.error('Error running combined analysis:', error);
      const message = error?.response?.data?.error || 'Analysis failed — check that at least one vision model is loaded on the server.';
      setAnalyzeError(message);
      onNotification?.(message, 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const visibleHistory = history.filter((r) => !dismissed.has(r.reading_id));
  const cameraLive = Boolean(status?.camera_configured) && Boolean(status?.monitoring_active) && streamOk;
  const anyModelReady = Boolean(status?.disease_model_ready || status?.pest_model_ready);

  return (
    <Box>
      {/* Summary bar */}
      <Box
        sx={{
          bgcolor: c.sidebarActive,
          borderRadius: 3,
          p: 2.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <SummaryItem
          label="Crop Health Overview"
          value={
            visibleHistory.length === 0
              ? '—'
              : `${Math.round(
                  (visibleHistory.filter((r) => r.is_healthy).length / visibleHistory.length) * 100
                )}% Healthy`
          }
        />
        <Divider />
        <SummaryItem
          label="Camera Node"
          value={cameraLive ? 'Live' : status?.camera_configured ? 'Configured (offline)' : 'Not Configured'}
          accent={cameraLive ? undefined : c.warning}
        />
        <Divider />
        <SummaryItem
          label="Detection Alerts"
          value={`${visibleHistory.filter((r) => !r.is_healthy).length} Pending`}
          accent={c.warning}
        />
        <Divider />
        <SummaryItem
          label="Last Check"
          value={status?.last_check_time ? timeAgo(status.last_check_time) : 'No checks yet'}
        />
      </Box>

      {statusError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {statusError}
        </Alert>
      )}

      {/* Mode toggle */}
      <Box
        sx={{
          bgcolor: 'white',
          border: `1px solid ${c.border}`,
          borderRadius: 3,
          p: 0.5,
          display: 'flex',
          gap: 1,
          width: 400,
          maxWidth: '100%',
          mb: 3,
        }}
      >
        {[
          { key: 'auto', label: 'Automatic Detection' },
          { key: 'manual', label: 'Manual Diagnosis' },
        ].map((t) => (
          <Box
            key={t.key}
            onClick={() => setMode(t.key)}
            sx={{
              flex: 1,
              textAlign: 'center',
              py: 1.2,
              borderRadius: 2,
              cursor: 'pointer',
              bgcolor: mode === t.key ? c.sidebarActive : 'transparent',
              color: mode === t.key ? 'white' : c.textBody,
              fontWeight: mode === t.key ? 600 : 500,
              fontSize: 15,
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </Box>
        ))}
      </Box>

      {mode === 'auto' ? (
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: c.textDark, mb: 1.5 }}>
            Active Feed Modules
          </Typography>

          <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', flexWrap: 'wrap', mb: 3 }}>
            <Box
              sx={{
                flex: '1 1 340px',
                maxWidth: 480,
                bgcolor: 'white',
                border: `1px solid ${c.border}`,
                borderRadius: 3,
                p: 1.5,
              }}
            >
              <Box sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden', bgcolor: '#0f1512', height: 260 }}>
                {status?.camera_configured ? (
                  <Box
                    component="img"
                    src={visionAPI.streamUrl()}
                    alt="Zone camera live feed"
                    onError={() => setStreamOk(false)}
                    onLoad={() => setStreamOk(true)}
                    sx={{ width: '100%', height: '100%', objectFit: 'cover', display: streamOk ? 'block' : 'none' }}
                  />
                ) : null}
                {(!status?.camera_configured || !streamOk) && (
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: c.textMuted,
                      gap: 1,
                      p: 2,
                      textAlign: 'center',
                    }}
                  >
                    <PhotoCameraRoundedIcon sx={{ fontSize: 30 }} />
                    <Typography variant="body2" sx={{ color: 'inherit' }}>
                      {status?.camera_configured
                        ? 'Camera configured but not reachable right now.'
                        : 'No camera configured on the server yet.'}
                    </Typography>
                  </Box>
                )}
                <Chip
                  label={cameraLive ? 'LIVE' : 'OFFLINE'}
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    bgcolor: cameraLive ? c.primaryGreen : c.textMuted,
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 10,
                  }}
                />
              </Box>
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 1.2, px: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: c.textDark }}>
                  Zone Camera
                </Typography>
                <Typography variant="caption" sx={{ color: c.textMuted }}>
                  {status?.check_interval_seconds
                    ? `Auto-checks every ${Math.round(status.check_interval_seconds / 60)} min`
                    : ''}
                </Typography>
              </Stack>
            </Box>

            <Box sx={{ flex: '1 1 260px', bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 3, p: 2.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: c.textDark, mb: 1 }}>
                Last Automatic Check
              </Typography>
              {!status?.last_check_results?.length ? (
                <Typography variant="caption" sx={{ color: c.textMuted }}>
                  No automatic checks logged yet.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {status.last_check_results.map((r, i) => (
                    <Stack key={i} direction="row" spacing={1} alignItems="center">
                      <ModelIcon modelVersion={r.model_version} sx={{ fontSize: 16, color: r.is_negative ? c.primaryGreen : c.warning }} />
                      <Typography variant="caption" sx={{ color: c.textBody }}>
                        {modelLabel(r.model_version)}: <strong>{formatClassName(r.predicted_class)}</strong> ({Math.round(r.confidence * 100)}%)
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
              <Typography variant="caption" sx={{ color: c.textMuted, display: 'block', mt: 1.5 }}>
                {anyModelReady
                  ? `Models loaded: ${[status?.disease_model_ready && 'Disease', status?.pest_model_ready && 'Pest'].filter(Boolean).join(', ')}`
                  : 'No models are loaded on the server.'}
              </Typography>
            </Box>
          </Box>

          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: c.textDark, mb: 1.5 }}>
            Recent Detected Findings
          </Typography>
          <FindingsList
            loading={loadingHistory}
            error={historyError}
            items={visibleHistory}
            onDismiss={(id) => setDismissed((prev) => new Set(prev).add(id))}
          />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Manual workspace */}
          <Box sx={{ flex: '1 1 360px', maxWidth: 460, bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 3, p: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: c.textDark, mb: 1 }}>
              Manual Diagnosis
            </Typography>
            <Typography variant="body2" sx={{ color: c.textBody, mb: 2 }}>
              Upload a leaf photo, or capture a still from the live camera. Every ready model
              (disease and pest) runs on the same image — no need to pick which check applies.
            </Typography>

            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              ref={fileInputRef}
              onChange={handleFileSelected}
              style={{ display: 'none' }}
            />

            {previewUrl ? (
              <Box sx={{ mb: 2, position: 'relative' }}>
                <Box
                  component="img"
                  src={previewUrl}
                  alt="Selected crop"
                  sx={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 2, border: `1px solid ${c.border}` }}
                />
                <Button
                  size="small"
                  onClick={() => setFileAndPreview(null)}
                  sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'white', minWidth: 0, px: 1 }}
                >
                  Clear
                </Button>
              </Box>
            ) : (
              <Box
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  bgcolor: c.background,
                  border: `1px dashed ${c.border}`,
                  borderRadius: 3,
                  px: 2.5,
                  py: 4,
                  textAlign: 'center',
                  cursor: 'pointer',
                  mb: 2,
                }}
              >
                <UploadFileIcon sx={{ color: c.primaryGreen, fontSize: 32, mb: 1 }} />
                <Typography variant="body2" sx={{ fontWeight: 600, color: c.textDark }}>
                  Click to select a crop image
                </Typography>
                <Typography variant="caption" sx={{ color: c.textMuted }}>
                  PNG or JPG
                </Typography>
              </Box>
            )}

            <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => fileInputRef.current?.click()}
                sx={{ borderColor: c.border, color: c.textDark }}
              >
                Upload
              </Button>
              <Button
                fullWidth
                variant="outlined"
                startIcon={capturingSnapshot ? <CircularProgress size={16} /> : <PhotoCameraRoundedIcon />}
                onClick={handleCaptureSnapshot}
                disabled={capturingSnapshot || !status?.camera_configured}
                sx={{ borderColor: c.border, color: c.textDark }}
              >
                {status?.camera_configured ? 'Capture Live' : 'No Camera'}
              </Button>
            </Stack>

            {analyzeError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {analyzeError}
              </Alert>
            )}

            <Button
              fullWidth
              variant="contained"
              disabled={!selectedFile || analyzing}
              onClick={handleAnalyze}
              sx={{ bgcolor: c.primaryGreen, py: 1.3, '&:hover': { bgcolor: '#256428' } }}
            >
              {analyzing ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Analyze Image'}
            </Button>
          </Box>

          {/* Results */}
          <Box sx={{ flex: '1 1 320px', bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 3, p: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: c.textDark, mb: 1.5 }}>
              Result
            </Typography>
            {!lastResults ? (
              <Typography variant="caption" sx={{ color: c.textMuted }}>
                No manual queries run yet this session.
              </Typography>
            ) : lastResults.length === 0 ? (
              <Typography variant="body2" sx={{ color: c.textMuted }}>
                No models responded — check that a model is loaded on the server.
              </Typography>
            ) : (() => {
              // Show the higher-confidence problem as the clear answer;
              // anything else is a secondary, de-emphasized possibility.
              // This is the fix for "both models disagree and the farmer
              // doesn't know which to believe."
              const sorted = [...lastResults].sort((a, b) => {
                if (a.primary) return -1;
                if (b.primary) return 1;
                return b.confidence - a.confidence;
              });
              const allHealthy = sorted.every((r) => r.is_negative);

              return (
                <Stack spacing={2}>
                  {allHealthy && (
                    <Alert severity="success" sx={{ borderRadius: 2 }}>
                      Both checks came back clean — no disease or pest activity found.
                    </Alert>
                  )}
                  {sorted.map((r, i) => {
                    const isPrimary = r.primary || (allHealthy && i === 0);
                    return (
                      <Box key={i}>
                        {!isPrimary && (
                          <Typography variant="caption" sx={{ color: c.textMuted, display: 'block', mb: 0.5 }}>
                            Also checked ({modelLabel(r.model_version)}) — less likely:
                          </Typography>
                        )}
                        <Stack
                          direction="row"
                          spacing={1.5}
                          alignItems="flex-start"
                          sx={{
                            p: isPrimary ? 2 : 1.2,
                            borderRadius: 2,
                            border: `1px solid ${r.is_negative ? c.border : (isPrimary ? c.danger : c.border)}`,
                            bgcolor: r.is_negative ? c.background : (isPrimary ? c.dangerBg : 'white'),
                            opacity: isPrimary ? 1 : 0.75,
                          }}
                        >
                          <ModelIcon modelVersion={r.model_version} sx={{ color: r.is_negative ? c.primaryGreen : c.danger, fontSize: isPrimary ? 22 : 18, mt: 0.2 }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                              <Typography sx={{ fontWeight: 700, color: c.textDark, fontSize: isPrimary ? 16 : 14 }}>
                                {formatClassName(r.predicted_class)}
                              </Typography>
                              {isPrimary && !r.is_negative && (
                                <Chip label="Most Likely" size="small" sx={{ bgcolor: c.danger, color: 'white', fontWeight: 700, fontSize: 10, height: 18 }} />
                              )}
                            </Stack>
                            <Typography variant="caption" sx={{ color: r.is_negative ? c.textBody : c.danger }}>
                              {modelLabel(r.model_version)} • Confidence {Math.round(r.confidence * 100)}%
                              {r.is_negative ? ' • Nothing found' : ''}
                            </Typography>
                            {isPrimary && !r.is_negative && (
                              <>
                                <AdviceBlock advice={r.advice} />
                                <FeedbackWidget reading={r} isHealthy={r.is_negative} />
                              </>
                            )}
                          </Box>
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              );
            })()}
          </Box>
        </Box>
      )}
    </Box>
  );
};

const AdviceBlock = ({ advice, compact }) => {
  if (!advice) return null;
  return (
    <Box sx={{ bgcolor: c.chipGreenBg, borderRadius: 2, p: compact ? 1.2 : 1.8, mt: 1 }}>
      <Stack direction="row" spacing={0.8} alignItems="flex-start">
        <AutoAwesomeRoundedIcon sx={{ fontSize: 15, color: c.primaryGreen, mt: 0.2, flexShrink: 0 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ color: c.textDark, fontWeight: 700, display: 'block' }}>
            {advice.summary}
          </Typography>
          <Typography variant="caption" sx={{ color: c.textBody }}>
            {advice.next_steps}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
};

// Farmer confirms or corrects a detection — this is the human-verified label
// future model retraining will use (backend: PlantHealthReading.farmer_*).
const FeedbackWidget = ({ reading, isHealthy, onSubmitted }) => {
  const [state, setState] = useState('idle'); // idle | correcting | submitting | done
  const [correctedClass, setCorrectedClass] = useState('');

  if (!reading?.reading_id) return null;

  const submit = async (agrees, corrected) => {
    setState('submitting');
    try {
      await visionAPI.submitReadingFeedback(reading.reading_id, {
        agrees,
        corrected_class: agrees ? null : corrected,
      });
      setState('done');
      onSubmitted?.();
    } catch (error) {
      setState(agrees ? 'idle' : 'correcting');
    }
  };

  if (state === 'done') {
    return (
      <Stack direction="row" spacing={0.6} alignItems="center" sx={{ mt: 1 }}>
        <CheckCircleRoundedIcon sx={{ fontSize: 14, color: c.primaryGreen }} />
        <Typography variant="caption" sx={{ color: c.primaryGreen, fontWeight: 600 }}>
          Thanks — this helps improve future detections.
        </Typography>
      </Stack>
    );
  }

  if (state === 'correcting') {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
        <TextField
          select
          size="small"
          value={correctedClass}
          onChange={(e) => setCorrectedClass(e.target.value)}
          sx={{ minWidth: 160 }}
          SelectProps={{ displayEmpty: true }}
        >
          <MenuItem value="" disabled>What is it actually?</MenuItem>
          {classOptionsFor(reading.model_version).map((cls) => (
            <MenuItem key={cls} value={cls}>{formatClassName(cls)}</MenuItem>
          ))}
        </TextField>
        <Button
          size="small"
          variant="contained"
          disabled={!correctedClass}
          onClick={() => submit(false, correctedClass)}
          sx={{ bgcolor: c.sidebarActive, '&:hover': { bgcolor: '#152018' } }}
        >
          Submit
        </Button>
        <Button size="small" onClick={() => setState('idle')} sx={{ color: c.textMuted }}>Cancel</Button>
      </Stack>
    );
  }

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
      <Typography variant="caption" sx={{ color: c.textMuted }}>Does this look right?</Typography>
      <Button
        size="small"
        disabled={state === 'submitting'}
        startIcon={<ThumbUpRoundedIcon sx={{ fontSize: 14 }} />}
        onClick={() => submit(true, null)}
        sx={{ color: c.primaryGreen, minWidth: 0, fontSize: 12 }}
      >
        Yes
      </Button>
      <Button
        size="small"
        disabled={state === 'submitting'}
        startIcon={<ThumbDownRoundedIcon sx={{ fontSize: 14 }} />}
        onClick={() => setState('correcting')}
        sx={{ color: c.textMuted, minWidth: 0, fontSize: 12 }}
      >
        No, correct it
      </Button>
    </Stack>
  );
};

const FindingsList = ({ loading, error, items, onDismiss }) => {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }
  if (error) return <Alert severity="warning">{error}</Alert>;
  if (items.length === 0) {
    return (
      <Box
        sx={{
          bgcolor: 'white',
          border: `1px solid ${c.border}`,
          borderRadius: 3,
          p: 3,
          textAlign: 'center',
          color: c.textMuted,
        }}
      >
        No detections yet — switch to Manual Diagnosis to run one, or wait for the next automatic check.
      </Box>
    );
  }
  return (
    <Stack spacing={1.5}>
      {items.map((r) => {
        const severe = !r.is_healthy;
        return (
          <Box
            key={r.reading_id}
            sx={{
              bgcolor: 'white',
              border: `1px solid ${severe ? c.danger : c.border}`,
              borderRadius: 2,
              p: 2,
              display: 'flex',
              gap: 2,
              alignItems: 'center',
            }}
          >
            <Box sx={{ width: 4, height: 44, bgcolor: severe ? c.danger : c.primaryGreen, borderRadius: 1 }} />
            <ModelIcon modelVersion={r.model_version} sx={{ color: severe ? c.danger : c.primaryGreen, fontSize: 20 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="body1" sx={{ fontWeight: 700, color: c.textDark }}>
                  {formatClassName(r.predicted_class)}
                </Typography>
                <Chip
                  label={modelLabel(r.model_version)}
                  size="small"
                  sx={{ bgcolor: c.chipGreenBg, color: c.primaryGreen, fontWeight: 700, fontSize: 10, height: 20 }}
                />
                <Chip
                  label={severe ? 'NEEDS REVIEW' : 'HEALTHY'}
                  size="small"
                  sx={{
                    bgcolor: severe ? c.dangerBg : c.chipGreenBg,
                    color: severe ? c.danger : c.primaryGreen,
                    fontWeight: 700,
                    fontSize: 10,
                    height: 20,
                  }}
                />
                <Typography variant="caption" sx={{ color: c.textMuted }}>
                  {r.zone_id ? `Zone ${r.zone_id} • ` : ''}
                  {timeAgo(r.timestamp)}
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ color: c.textBody, mt: 0.3 }}>
                Confidence {Math.round((r.confidence || 0) * 100)}%
              </Typography>
              {severe && <AdviceBlock advice={r.advice} compact />}
              {severe && !r.farmer_reviewed && (
                <FeedbackWidget reading={r} isHealthy={r.is_healthy} onSubmitted={() => onDismiss(r.reading_id)} />
              )}
            </Box>
            <Button
              size="small"
              onClick={() => onDismiss(r.reading_id)}
              sx={{ border: `1px solid ${c.border}`, color: c.textBody, fontSize: 12 }}
            >
              Dismiss
            </Button>
          </Box>
        );
      })}
    </Stack>
  );
};

const SummaryItem = ({ label, value, accent }) => (
  <Box sx={{ flex: '1 1 140px', minWidth: 0 }}>
    <Typography
      variant="caption"
      sx={{ color: '#8e9e94', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}
    >
      {label}
    </Typography>
    <Typography variant="h6" sx={{ color: accent || 'white', fontWeight: 800 }} noWrap>
      {value}
    </Typography>
  </Box>
);

const Divider = () => (
  <Box sx={{ width: '1px', height: 40, bgcolor: 'rgba(255,255,255,0.15)', mx: 1 }} />
);

export default VisionMonitoringSection;
