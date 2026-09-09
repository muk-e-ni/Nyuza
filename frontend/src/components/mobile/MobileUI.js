import React from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import {
  WaterDrop, Insights, Tune, WbSunny, Air, WbCloudy,
} from '@mui/icons-material';

/**
 * Mobile-only presentational components matching the Figma mobile design
 * (warm cream background, forest green accents, rounded white cards with
 * a thin border, status badges with color-coded backgrounds).
 *
 * These are pure presentation — no data fetching, no API calls. Each
 * section component (HomeSection, StatusSection, etc.) branches to a
 * mobile-specific render using these, while its desktop render and all
 * data-fetching logic stay completely untouched.
 */

// Maps a status word to the badge/bar color pair used throughout the
// Figma sensor cards (LOW/WARNING = amber, ALERT/CRITICAL = red,
// OPTIMAL = green). Falls back to green for anything unrecognized so a
// missing/unexpected status never renders as alarming red by default.
const STATUS_COLORS = {
  optimal: { bg: '#e8f0ec', fg: '#2e7d32', bar: '#2e7d32' },
  low: { bg: '#fdf2e2', fg: '#d87a00', bar: '#d87a00' },
  warning: { bg: '#fdf2e2', fg: '#d87a00', bar: '#d87a00' },
  mild: { bg: '#fdf2e2', fg: '#d87a00', bar: '#d87a00' },
  alert: { bg: '#fcece9', fg: '#c04e37', bar: '#c04e37' },
  critical: { bg: '#fcece9', fg: '#c04e37', bar: '#c04e37' },
};

export const getStatusColors = (status) =>
  STATUS_COLORS[(status || '').toLowerCase()] || STATUS_COLORS.optimal;

export const StatusBadge = ({ label }) => {
  const { bg, fg } = getStatusColors(label);
  return (
    <Box
      sx={{
        bgcolor: bg,
        color: fg,
        px: 1,
        py: 0.4,
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Box>
  );
};

const ICONS = {
  droplet: WaterDrop,
  activity: Insights,
  sliders: Tune,
  sun: WbSunny,
};

/**
 * A single stat card: icon + label + status badge, big value, and a
 * color-coded progress bar. Matches the soil-sensors screen's sensor-card
 * pattern. `percent` (0-100) controls the bar fill.
 */
export const StatCard = ({ icon = 'activity', label, value, unit, status, percent = 60 }) => {
  const Icon = ICONS[icon] || Insights;
  const { bar } = getStatusColors(status);

  return (
    <Box
      sx={{
        bgcolor: 'white',
        border: '1px solid #ede9e1',
        borderRadius: '16px',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        flex: 1,
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Icon sx={{ fontSize: 18, color: '#1e2722' }} />
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1e2722' }}>{label}</Typography>
        </Box>
        {status && <StatusBadge label={status} />}
      </Box>
      <Box>
        <Typography sx={{ fontSize: 28, fontWeight: 800, color: '#1e2722', lineHeight: 1 }}>
          {value}
          {unit && (
            <Typography component="span" sx={{ fontSize: 14, fontWeight: 500, color: '#5c6a61', ml: 0.5 }}>
              {unit}
            </Typography>
          )}
        </Typography>
        <Box sx={{ mt: 1, height: 6, bgcolor: '#ecefea', borderRadius: '3px', overflow: 'hidden' }}>
          <Box sx={{ width: `${Math.min(100, Math.max(0, percent))}%`, height: '100%', bgcolor: bar }} />
        </Box>
      </Box>
    </Box>
  );
};

/** A 2-column row of StatCards — just a layout helper. */
export const StatCardRow = ({ children }) => (
  <Box sx={{ display: 'flex', gap: 1.5, width: '100%' }}>{children}</Box>
);

/** Dark weather summary card (matches the Figma dashboard's weather-card). */
export const WeatherCard = ({ location, temperature, condition, humidity, windSpeed }) => (
  <Box
    sx={{
      bgcolor: '#3c4e43',
      borderRadius: '16px',
      p: 2.25,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      color: 'white',
    }}
  >
    <Box>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#8e9e94', textTransform: 'uppercase' }}>
        {location}
      </Typography>
      <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1.2 }}>
        {temperature !== undefined && temperature !== null ? `${temperature}°C` : '--'}
      </Typography>
      <Typography sx={{ fontSize: 13, opacity: 0.9 }}>{condition}</Typography>
    </Box>
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1.25 }}>
      <WbCloudy sx={{ fontSize: 32 }} />
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <WaterDrop sx={{ fontSize: 14 }} />
          <Typography sx={{ fontSize: 12 }}>{humidity !== undefined ? `${humidity}%` : '--'}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Air sx={{ fontSize: 14 }} />
          <Typography sx={{ fontSize: 12 }}>{windSpeed !== undefined ? `${windSpeed} km/h` : '--'}</Typography>
        </Box>
      </Box>
    </Box>
  </Box>
);

/** Circular health-score ring (matches the Figma dashboard's ring-graphic). */
export const HealthRing = ({ score, title, description }) => (
  <Box
    sx={{
      bgcolor: 'white',
      border: '1px solid #ede9e1',
      borderRadius: '16px',
      p: 2.5,
      display: 'flex',
      alignItems: 'center',
      gap: 2.5,
    }}
  >
    <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <CircularProgress
        variant="determinate"
        value={100}
        size={80}
        thickness={4}
        sx={{ color: '#ecefea', position: 'absolute' }}
      />
      <CircularProgress
        variant="determinate"
        value={Math.min(100, Math.max(0, score))}
        size={80}
        thickness={4}
        sx={{ color: '#2e7d32' }}
      />
      <Box
        sx={{
          top: 0, left: 0, bottom: 0, right: 0,
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography sx={{ fontSize: 22, fontWeight: 800, color: '#1e2722' }}>{score}%</Typography>
      </Box>
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#1e2722' }}>{title}</Typography>
      <Typography sx={{ fontSize: 13, color: '#5c6a61' }}>{description}</Typography>
    </Box>
  </Box>
);

const TILE_COLORS = ['#3c4e43', '#2e7d32', '#c04e37', '#7a4e43'];

/** A single quick-action tile — icon-wrap + label, in the Figma's rounded-square style. */
export const QuickActionTile = ({ icon: Icon, label, colorIndex = 0, onClick }) => (
  <Box
    onClick={onClick}
    sx={{
      bgcolor: 'white',
      border: '1px solid #ede9e1',
      borderRadius: '16px',
      p: 1.5,
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      flex: 1,
      minWidth: 0,
      cursor: onClick ? 'pointer' : 'default',
    }}
  >
    <Box
      sx={{
        bgcolor: TILE_COLORS[colorIndex % TILE_COLORS.length],
        borderRadius: '12px',
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon sx={{ fontSize: 20, color: 'white' }} />
    </Box>
    <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#1e2722', textAlign: 'center' }}>
      {label}
    </Typography>
  </Box>
);

const ACCENT_COLORS = { critical: '#c04e37', warning: '#d87a00', good: '#2e7d32' };

/** A single alert row — colored accent line + title/time + description. */
export const AlertRow = ({ title, description, time, severity = 'good', isLast = false }) => (
  <Box
    sx={{
      display: 'flex',
      gap: 1.5,
      py: 1.5,
      borderBottom: isLast ? 'none' : '1px solid #ede9e1',
    }}
  >
    <Box sx={{ width: 4, borderRadius: '2px', bgcolor: ACCENT_COLORS[severity] || ACCENT_COLORS.good, flexShrink: 0 }} />
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1e2722' }}>{title}</Typography>
        {time && <Typography sx={{ fontSize: 11, color: '#8e9e94', flexShrink: 0 }}>{time}</Typography>}
      </Box>
      <Typography sx={{ fontSize: 12, color: '#5c6a61', mt: 0.25 }}>{description}</Typography>
    </Box>
  </Box>
);

/** A section title, matching the Figma's bold 16px section headers. */
export const MobileSectionTitle = ({ children, action }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
    <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#1e2722' }}>{children}</Typography>
    {action}
  </Box>
);

/** White rounded card wrapper, matching the Figma's generic card container. */
export const MobileCard = ({ children, sx = {} }) => (
  <Box
    sx={{
      bgcolor: 'white',
      border: '1px solid #ede9e1',
      borderRadius: '16px',
      p: 2.25,
      width: '100%',
      ...sx,
    }}
  />
);