import { createTheme } from '@mui/material/styles';

// Design tokens pulled directly from the Figma file
// (LmjEWSPST9pYB4vZGF22Fd — "nyuza_design", desktop shell + Home/System Status/Vision Monitoring)
const colors = {
  background: '#faf9f5',
  surface: '#ffffff',
  border: '#ede9e1',
  sidebarActive: '#1e2f23',
  primaryGreen: '#2e7d32',
  secondaryGreen: '#3c4e43',
  chipGreenBg: '#ecefea',
  textDark: '#1e2722',
  textBody: '#5c6a61',
  textMuted: '#8e9e94',
  danger: '#c04e37',
  dangerBg: '#fdf2f0',
  warning: '#d87a00',
  warningBg: '#fff3e0',
};

const theme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: colors.background,
      paper: colors.surface,
    },
    primary: {
      main: colors.sidebarActive,
      contrastText: '#ffffff',
    },
    secondary: {
      main: colors.primaryGreen,
    },
    success: {
      main: colors.primaryGreen,
    },
    warning: {
      main: colors.warning,
    },
    error: {
      main: colors.danger,
    },
    text: {
      primary: colors.textDark,
      secondary: colors.textBody,
      disabled: colors.textMuted,
    },
    divider: colors.border,
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: "'Inter', 'Roboto', 'Helvetica', 'Arial', sans-serif",
    h1: { fontFamily: "'Roboto', sans-serif", fontWeight: 800 },
    h2: { fontFamily: "'Roboto', sans-serif", fontWeight: 700 },
    h3: { fontFamily: "'Roboto', sans-serif", fontWeight: 700 },
    h4: { fontFamily: "'Roboto', sans-serif", fontWeight: 700 },
    h5: { fontFamily: "'Roboto', sans-serif", fontWeight: 700 },
    h6: { fontFamily: "'Roboto', sans-serif", fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
  },
});

// Exported separately so section components can reference exact design-token
// hex values without reaching into theme.palette in non-obvious ways.
export const nyuzaColors = colors;
export default theme;
