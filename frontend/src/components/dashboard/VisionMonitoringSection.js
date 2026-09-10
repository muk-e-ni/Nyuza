import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Stack,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import { visionAPI } from '../../services/api';
import { nyuzaColors as c } from '../../Theme';

// The backend (routes/vision_routes.py) only exposes disease detection today —
// there's no live camera-stream endpoint and no pest-detection route yet, even
// though a pest model service exists. So "Active Feed Modules" below is a
// visual placeholder for where live camera tiles will go once that backend
// piece exists, clearly labeled as such rather than faking real feeds.
const DEMO_ZONES = [
  { label: 'Zone 1 Cam: Orchard' },
  { label: 'Zone 2 Cam: Tomato' },
  { label: 'Zone 3 Cam: Pasture' },
  { label: 'Zone 4 Cam: Vineyard' },
];

function timeAgo(isoString) {
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

const VisionMonitoringSection = ({ onNotification }) => {
  const [mode, setMode] = useState('auto'); // 'auto' | 'manual'
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const [dismissed, setDismissed] = useState(new Set());

  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [lastPreviewUrl, setLastPreviewUrl] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      setHistoryError(null);
      const response = await visionAPI.getHistory(null, 10);
      const readings = response?.data?.readings || [];
      setHistory(readings);
    } catch (error) {
      console.error('Error fetching vision history:', error);
      setHistoryError('Could not load detection history from the server.');
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploading(true);
    const previewUrl = URL.createObjectURL(file);

    try {
      const response = await visionAPI.detectDisease(file);
      const result = response?.data?.result;
      setLastResult(result);
      setLastPreviewUrl(previewUrl);
      onNotification?.(
        `Diagnosis complete: ${formatClassName(result?.predicted_class)} (${Math.round(
          (result?.confidence || 0) * 100
        )}%)`,
        result?.is_healthy ? 'success' : 'info'
      );
      fetchHistory();
    } catch (error) {
      console.error('Error running diagnostic:', error);
      const message =
        error?.response?.data?.error || 'Diagnosis failed — is the disease model loaded on the server?';
      setUploadError(message);
      onNotification?.(message, 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const visibleHistory = history.filter((r) => !dismissed.has(r.reading_id));

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
        <SummaryItem label="Active Camera Nodes" value={`${DEMO_ZONES.length} / ${DEMO_ZONES.length} Demo`} />
        <Divider />
        <SummaryItem
          label="Detection Alerts"
          value={`${visibleHistory.filter((r) => !r.is_healthy).length} Pending`}
          accent={c.warning}
        />
      </Box>

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

      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Left: auto-detection workspace */}
        <Box sx={{ flex: '1 1 480px', minWidth: 0 }}>
          <Box
            sx={{
              bgcolor: 'white',
              border: `1px solid ${c.border}`,
              borderRadius: 2,
              p: 2.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 3,
              flexWrap: 'wrap',
              gap: 1,
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Chip
                label="Demo Feed"
                size="small"
                sx={{ bgcolor: c.chipGreenBg, color: c.primaryGreen, fontWeight: 700, fontSize: 12 }}
              />
              <Typography variant="body2" sx={{ color: c.textBody }}>
                Live camera streaming isn't wired up on the backend yet — these tiles are placeholders.
              </Typography>
            </Stack>
          </Box>

          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: c.textDark, mb: 1.5 }}>
            Active Feed Modules
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            {DEMO_ZONES.map((zone) => (
              <Box
                key={zone.label}
                sx={{
                  flex: '1 1 120px',
                  bgcolor: 'white',
                  border: `1px solid ${c.border}`,
                  borderRadius: 3,
                  p: 1.5,
                }}
              >
                <Box
                  sx={{
                    height: 100,
                    borderRadius: 2,
                    mb: 1.2,
                    background: `linear-gradient(135deg, ${c.chipGreenBg}, ${c.border})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ImageOutlinedIcon sx={{ color: c.textMuted, fontSize: 28 }} />
                </Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: c.textDark, display: 'block' }} noWrap>
                  {zone.label}
                </Typography>
              </Box>
            ))}
          </Box>

          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: c.textDark, mb: 1.5 }}>
            Recent Detected Findings
          </Typography>

          {loadingHistory ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={22} />
            </Box>
          ) : historyError ? (
            <Alert severity="warning">{historyError}</Alert>
          ) : visibleHistory.length === 0 ? (
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
              No detections yet — run a manual diagnostic to see results here.
            </Box>
          ) : (
            <Stack spacing={1.5}>
              {visibleHistory.map((r) => {
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
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="body1" sx={{ fontWeight: 700, color: c.textDark }}>
                          {formatClassName(r.predicted_class)}
                        </Typography>
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
                    </Box>
                    <Button
                      size="small"
                      onClick={() => setDismissed((prev) => new Set(prev).add(r.reading_id))}
                      sx={{ border: `1px solid ${c.border}`, color: c.textBody, fontSize: 12 }}
                    >
                      Dismiss
                    </Button>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Box>

        {/* Right: manual diagnosis panel */}
        <Box
          sx={{
            width: 380,
            maxWidth: '100%',
            bgcolor: 'white',
            border: `1px solid ${c.border}`,
            borderRadius: 3,
            p: 3,
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: c.textDark, mb: 1 }}>
            Manual Analysis Upload
          </Typography>
          <Typography variant="body2" sx={{ color: c.textBody, mb: 2 }}>
            Upload a leaf photo. The disease model (MobileNetV2, ~94% val. accuracy) runs on the
            server and returns a diagnosis.
          </Typography>

          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            ref={fileInputRef}
            onChange={handleFileSelected}
            style={{ display: 'none' }}
          />
          <Box
            onClick={() => !uploading && fileInputRef.current?.click()}
            sx={{
              bgcolor: c.background,
              border: `1px dashed ${c.border}`,
              borderRadius: 3,
              px: 2.5,
              py: 4,
              textAlign: 'center',
              cursor: uploading ? 'default' : 'pointer',
              mb: 2,
            }}
          >
            {uploading ? (
              <CircularProgress size={28} sx={{ color: c.primaryGreen }} />
            ) : (
              <>
                <UploadFileIcon sx={{ color: c.primaryGreen, fontSize: 32, mb: 1 }} />
                <Typography variant="body2" sx={{ fontWeight: 600, color: c.textDark }}>
                  Click to select a crop image
                </Typography>
                <Typography variant="caption" sx={{ color: c.textMuted }}>
                  PNG or JPG
                </Typography>
              </>
            )}
          </Box>

          {uploadError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {uploadError}
            </Alert>
          )}

          <Button
            fullWidth
            variant="contained"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            sx={{ bgcolor: c.primaryGreen, py: 1.3, mb: 2, '&:hover': { bgcolor: '#256428' } }}
          >
            Run Custom Diagnostic
          </Button>

          <Box sx={{ borderTop: `1px solid ${c.border}`, pt: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: c.textDark, mb: 1 }}>
              Last Manual Query
            </Typography>
            {lastResult ? (
              <Box sx={{ bgcolor: c.background, borderRadius: 2, p: 1.5, display: 'flex', gap: 1.5, alignItems: 'center' }}>
                {lastPreviewUrl && (
                  <Box
                    component="img"
                    src={lastPreviewUrl}
                    alt="Uploaded leaf"
                    sx={{ width: 48, height: 48, borderRadius: 1.5, objectFit: 'cover' }}
                  />
                )}
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: c.textDark }}>
                    {formatClassName(lastResult.predicted_class)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: lastResult.is_healthy ? c.primaryGreen : c.danger }}>
                    Confidence {Math.round((lastResult.confidence || 0) * 100)}%
                    {lastResult.is_healthy ? ' • Healthy' : ' • Needs attention'}
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Typography variant="caption" sx={{ color: c.textMuted }}>
                No manual queries run yet this session.
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

const SummaryItem = ({ label, value, accent }) => (
  <Box sx={{ flex: 1, minWidth: 0 }}>
    <Typography
      variant="caption"
      sx={{ color: '#8e9e94', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}
    >
      {label}
    </Typography>
    <Typography variant="h6" sx={{ color: accent || 'white', fontWeight: 800 }}>
      {value}
    </Typography>
  </Box>
);

const Divider = () => (
  <Box sx={{ width: '1px', height: 40, bgcolor: 'rgba(255,255,255,0.15)', mx: 3 }} />
);

export default VisionMonitoringSection;
