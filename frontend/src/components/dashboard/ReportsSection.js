import React, { useState, useEffect, useCallback, useMemo } from 'react';
import jsPDF from 'jspdf';
import { irrigationAPI, recommendationAPI, visionAPI } from '../../services/api';
import {
  Box,
  Typography,
  Stack,
  Button,
  Chip,
  CircularProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Tooltip,
} from '@mui/material';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { nyuzaColors as c } from '../../Theme';

const TIMEFRAMES = [
  { id: 7, label: 'Past 7 Days' },
  { id: 30, label: '30 Days' },
  { id: 180, label: '6 Months' },
  { id: 365, label: '1 Year' },
  { id: 730, label: '2 Years' },
  { id: 'custom', label: 'Custom' },
];

const ReportsSection = ({ onNotification }) => {
  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState(null);
  const [history, setHistory] = useState([]);
  const [alertCount, setAlertCount] = useState(0);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(null);

  const notify = (msg, type = 'info') => onNotification?.(msg, type);

  const fetchData = useCallback(async (period) => {
    setLoading(true);
    try {
      const [analyticsRes, historyRes, visionRes, recsRes] = await Promise.all([
        irrigationAPI.getAnalytics(period),
        irrigationAPI.getHistory(Math.max(period, 180)),
        visionAPI.getHistory(null, 200).catch(() => ({ data: {} })),
        recommendationAPI.getRecommendations('pending').catch(() => ({ data: [] })),
      ]);
      setAnalytics(analyticsRes.data?.data || null);
      setHistory(historyRes.data?.data || []);
      const readings = visionRes.data?.readings || [];
      const cutoff = Date.now() - period * 24 * 60 * 60 * 1000;
      setAlertCount(readings.filter(r => !r.is_healthy && new Date(r.timestamp).getTime() >= cutoff).length);
      setRecommendations(Array.isArray(recsRes.data) ? recsRes.data.slice(0, 2) : []);
    } catch (error) {
      console.error('Error fetching report data:', error);
      notify('Failed to load report data', 'error');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(days); }, [days, fetchData]);

  const handleTimeframeClick = (id) => {
    if (id === 'custom') {
      notify('Custom date range picker is coming soon', 'info');
      return;
    }
    setDays(id);
  };

  const handleApply = async (rec) => {
    setActionBusy(rec.id);
    try {
      await recommendationAPI.applyRecommendation(rec.id);
      setRecommendations(prev => prev.filter(r => r.id !== rec.id));
      notify('Recommendation applied', 'success');
    } catch (error) {
      notify('Failed to apply recommendation', 'error');
    } finally {
      setActionBusy(null);
    }
  };

  const handleDismiss = async (rec) => {
    setActionBusy(rec.id);
    try {
      await recommendationAPI.dismissRecommendation(rec.id);
      setRecommendations(prev => prev.filter(r => r.id !== rec.id));
    } catch (error) {
      notify('Failed to dismiss recommendation', 'error');
    } finally {
      setActionBusy(null);
    }
  };

  // ---- heatmap data: last ~24 weeks of irrigation event counts ----
  const localDateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const heatmapWeeks = useMemo(() => {
    const dayCounts = {};
    history.forEach(log => {
      const key = localDateKey(new Date(log.start_time));
      dayCounts[key] = (dayCounts[key] || 0) + 1;
    });
    const weeks = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Start of the current week (Sunday), then walk back 23 more full
    // weeks so the grid's last column is always the week containing today.
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(currentWeekStart.getDate() - today.getDay());
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - 23 * 7);
    for (let w = 0; w < 24; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(date.getDate() + w * 7 + d);
        const key = localDateKey(date);
        week.push({ date: key, count: dayCounts[key] || 0, future: date > today });
      }
      weeks.push(week);
    }
    return weeks;
  }, [history]);

  const maxCount = Math.max(1, ...heatmapWeeks.flat().map(d => d.count));
  const heatColor = (count, future) => {
    if (future) return 'transparent';
    if (count === 0) return c.border;
    const intensity = count / maxCount;
    if (intensity > 0.75) return c.primaryGreen;
    if (intensity > 0.5) return '#5a9c5e';
    if (intensity > 0.25) return '#8fc191';
    return c.chipGreenBg;
  };

  const efficiencyBadge = (score) => {
    if (score >= 90) return { label: 'Optimal', fg: c.primaryGreen, bg: c.chipGreenBg };
    if (score >= 75) return { label: 'Moderate', fg: c.warning, bg: c.warningBg };
    return { label: 'Needs Attention', fg: c.danger, bg: c.dangerBg };
  };

  const handleExportPDF = () => {
    if (!analytics) return;
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(16);
    doc.text('Nyuza — Reports & Analytics', 20, y); y += 8;
    doc.setFontSize(10);
    doc.text(`Period: last ${days} days · Generated ${new Date().toLocaleString()}`, 20, y); y += 12;

    doc.setFontSize(12);
    doc.text('Summary Metrics', 20, y); y += 7;
    doc.setFontSize(10);
    doc.text(`Total Water Consumed: ${Math.round(analytics.total_water_usage || 0)} L`, 25, y); y += 6;
    doc.text(`Total Irrigation Events: ${analytics.total_irrigation_events || 0}`, 25, y); y += 6;
    doc.text(`Average Water / Event: ${Math.round(analytics.average_water_per_event || 0)} L`, 25, y); y += 6;
    doc.text(`Automation Rate: ${Math.round(analytics.summary_metrics?.automation_rate || 0)}%`, 25, y); y += 6;
    doc.text(`Plant Health Alerts: ${alertCount}`, 25, y); y += 12;

    doc.setFontSize(12);
    doc.text('Zone Resource Efficiency', 20, y); y += 7;
    doc.setFontSize(10);
    (analytics.zone_efficiency || []).forEach(z => {
      doc.text(`${z.zone_name}: ${Math.round(z.water_used)} L, ${z.events} events, ${z.efficiency}% efficiency`, 25, y);
      y += 6;
    });

    doc.save(`nyuza-report-${days}d.pdf`);
    notify('PDF report downloaded', 'success');
  };

  const handleExportCSV = () => {
    if (!analytics) return;
    const rows = [
      ['Zone', 'Crop Type', 'Water Used (L)', 'Events', 'Efficiency (%)'],
      ...(analytics.zone_efficiency || []).map(z => [z.zone_name, z.crop_type || '', Math.round(z.water_used), z.events, z.efficiency]),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `nyuza-report-${days}d.csv`; a.click();
    URL.revokeObjectURL(url);
    notify('CSV report downloaded', 'success');
  };

  if (loading && !analytics) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress sx={{ color: c.primaryGreen }} />
      </Box>
    );
  }

  const metrics = [
    { label: 'Total Water Consumed', value: `${Math.round(analytics?.total_water_usage || 0).toLocaleString()} L` },
    { label: 'Total Irrigation Events', value: `${analytics?.total_irrigation_events || 0} Cycles` },
    { label: 'Automation Rate', value: `${Math.round(analytics?.summary_metrics?.automation_rate || 0)}%` },
    { label: 'Avg Water / Event', value: `${Math.round(analytics?.average_water_per_event || 0)} L` },
    { label: 'Daily Average Water', value: `${Math.round(analytics?.summary_metrics?.daily_average_water || 0)} L/day` },
    { label: 'Plant Health Alerts', value: `${alertCount} Detected` },
  ];

  return (
    <Box>
      {/* Timeframe + export */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} sx={{ mb: 3 }}>
        <Box sx={{ display: 'inline-flex', bgcolor: c.chipGreenBg, borderRadius: 3, p: 0.5, flexWrap: 'wrap' }}>
          {TIMEFRAMES.map(tf => (
            <Button
              key={tf.id}
              onClick={() => handleTimeframeClick(tf.id)}
              size="small"
              sx={{
                px: 1.8, py: 0.7, borderRadius: 2.5, fontWeight: 700, fontSize: 12.5,
                bgcolor: days === tf.id ? 'white' : 'transparent',
                color: days === tf.id ? c.textDark : c.textMuted,
                boxShadow: days === tf.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                '&:hover': { bgcolor: days === tf.id ? 'white' : 'transparent' },
              }}
            >
              {tf.label}
            </Button>
          ))}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<PictureAsPdfRoundedIcon sx={{ fontSize: 16 }} />} onClick={handleExportPDF} sx={{ borderColor: c.border, color: c.textDark }}>
            Export PDF
          </Button>
          <Button size="small" variant="outlined" startIcon={<DescriptionRoundedIcon sx={{ fontSize: 16 }} />} onClick={handleExportCSV} sx={{ borderColor: c.border, color: c.textDark }}>
            Export CSV
          </Button>
          <Button size="small" variant="outlined" startIcon={<PrintRoundedIcon sx={{ fontSize: 16 }} />} onClick={() => window.print()} sx={{ borderColor: c.border, color: c.textDark }}>
            Print
          </Button>
        </Stack>
      </Stack>

      {/* Metrics grid */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        {metrics.map(m => (
          <Box key={m.label} sx={{ flex: '1 1 220px', minWidth: 200, bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 4, p: 2.5 }}>
            <Typography variant="caption" sx={{ color: c.textMuted, fontWeight: 600 }}>{m.label}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 800, color: c.textDark }}>{m.value}</Typography>
          </Box>
        ))}
      </Box>

      {/* Zone efficiency table */}
      <Box sx={{ bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 4, p: 3, mb: 3, overflowX: 'auto' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: c.textDark, mb: 2 }}>Zone Resource Efficiency Analysis</Typography>
        {(!analytics?.zone_efficiency || analytics.zone_efficiency.length === 0) ? (
          <Typography variant="body2" sx={{ color: c.textMuted }}>No irrigation activity recorded for this period yet.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Zone Location', 'Crop Type', 'Water Consumed', 'Efficiency Score'].map(h => (
                  <TableCell key={h} sx={{ color: c.textMuted, fontWeight: 700, borderBottom: `1px solid ${c.border}` }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {analytics.zone_efficiency.map(zone => {
                const badge = efficiencyBadge(zone.efficiency);
                return (
                  <TableRow key={zone.zone_id}>
                    <TableCell sx={{ borderBottom: `1px solid ${c.border}`, fontWeight: 600, color: c.textDark }}>{zone.zone_name}</TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${c.border}`, color: c.textBody }}>{zone.crop_type || '—'}</TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${c.border}`, color: c.textBody }}>{Math.round(zone.water_used).toLocaleString()} L</TableCell>
                    <TableCell sx={{ borderBottom: `1px solid ${c.border}` }}>
                      <Chip label={`${zone.efficiency}% (${badge.label})`} size="small" sx={{ bgcolor: badge.bg, color: badge.fg, fontWeight: 700 }} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Box>

      {/* Heatmap */}
      <Box sx={{ bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 4, p: 3, mb: 3, overflowX: 'auto' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: c.textDark, mb: 2 }}>Daily Resource Activity Heatmap</Typography>
        <Stack direction="row" spacing={0.6} sx={{ minWidth: 560 }}>
          {heatmapWeeks.map((week, wi) => (
            <Stack key={wi} spacing={0.6}>
              {week.map((day, di) => (
                <Tooltip key={di} title={`${day.date}: ${day.count} event${day.count === 1 ? '' : 's'}`}>
                  <Box sx={{ width: 12, height: 12, borderRadius: 0.6, bgcolor: heatColor(day.count, day.future) }} />
                </Tooltip>
              ))}
            </Stack>
          ))}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ color: c.textMuted }}>Less</Typography>
          {[c.border, c.chipGreenBg, '#8fc191', '#5a9c5e', c.primaryGreen].map((color, i) => (
            <Box key={i} sx={{ width: 12, height: 12, borderRadius: 0.6, bgcolor: color }} />
          ))}
          <Typography variant="caption" sx={{ color: c.textMuted }}>More</Typography>
        </Stack>
      </Box>

      {/* AI Actionable Insights */}
      <Box sx={{ bgcolor: 'white', border: `1px solid ${c.border}`, borderRadius: 4, p: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <AutoAwesomeRoundedIcon sx={{ color: c.primaryGreen, fontSize: 20 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: c.textDark }}>Nyuza AI Actionable Insights</Typography>
        </Stack>
        {recommendations.length === 0 ? (
          <Typography variant="body2" sx={{ color: c.textMuted }}>No pending recommendations right now — you're all caught up.</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {recommendations.map(rec => (
              <Box key={rec.id} sx={{ flex: '1 1 320px', bgcolor: c.chipGreenBg, borderRadius: 3, p: 2.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: c.textDark, mb: 0.5 }}>{rec.title}</Typography>
                <Typography variant="body2" sx={{ color: c.textBody, mb: 1.5 }}>{rec.description}</Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="contained" disabled={actionBusy === rec.id} onClick={() => handleApply(rec)} sx={{ bgcolor: c.primaryGreen, '&:hover': { bgcolor: '#245e28' } }}>
                    Apply
                  </Button>
                  <Button size="small" disabled={actionBusy === rec.id} onClick={() => handleDismiss(rec)} sx={{ color: c.textBody }}>
                    Dismiss
                  </Button>
                </Stack>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ReportsSection;
