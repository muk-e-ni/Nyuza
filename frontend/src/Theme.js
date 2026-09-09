import { createTheme } from '@mui/material/styles';

/**
 * Nyuza theme — derived from the Figma mobile design (warm cream + forest
 * green, rounded cards, Inter typeface).
 *
 * This is the single source of truth for color/shape/typography. Because
 * every screen already uses @mui/material components (Paper, Card, Button,
 * Chip, etc.), wrapping the app in a ThemeProvider with this theme restyles
 * the whole product without touching any component's logic or markup.
 */

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2e7d32',       // target/positive green — buttons, active states, success
      dark: '#1e2722',
      light: '#4c9a51',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#3c4e43',       // deep forest green — nav chrome, dark chips
      light: '#5c6a61',
      contrastText: '#ffffff',
    },
    error: {
      main: '#c04e37',       // deficit/alert red-orange (matches "current" bar in Figma)
    },
    warning: {
      main: '#d98c2b',
    },
    success: {
      main: '#2e7d32',
    },
    background: {
      default: '#faf6f0',    // warm cream page background
      paper: '#ffffff',
    },
    text: {
      primary: '#1e2722',
      secondary: '#5c6a61',
    },
    divider: '#ede9e1',
  },

  shape: {
    borderRadius: 14,
  },

  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#faf6f0',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: '1px solid #ede9e1',
          boxShadow: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 600,
        },
      },
    },
  },
});

export default theme;