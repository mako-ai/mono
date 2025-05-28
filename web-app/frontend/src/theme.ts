import { createTheme } from "@mui/material/styles";

// Extend the default Material-UI theme here. Update the palette & typography as desired.
const theme = createTheme({
  cssVariables: true, // Enable CSS variables for better theme switching
  colorSchemes: {
    light: {
      palette: {
        mode: "light",
        background: {
          default: "#fafafafa",
          paper: "#ffffff",
        },
        primary: {
          main: "#1976d2",
        },
        secondary: {
          main: "#dc004e",
        },
      },
    },
    dark: {
      palette: {
        mode: "dark",
        background: {
          default: "#121212", // Dark background
          paper: "#1e1e1e", // Slightly lighter for paper elements
        },
        primary: {
          main: "#90caf9",
        },
        secondary: {
          main: "#f48fb1",
        },
      },
    },
  },
  typography: {
    fontFamily: [
      "-apple-system", // San Francisco on macOS/iOS
      "BlinkMacSystemFont",
      '"Segoe UI"', // Windows
      "Roboto", // Android/Chrome OS
      '"Helvetica Neue"',
      "Arial",
      "sans-serif",
    ].join(","),
    h1: {
      fontSize: "2rem",
      fontWeight: 700,
    },
    h2: {
      fontSize: "1.75rem",
      fontWeight: 600,
    },
    h3: {
      fontSize: "1.5rem",
      fontWeight: 500,
    },
    h4: {
      fontSize: "1.25rem",
      fontWeight: 400,
    },
    h5: {
      fontSize: "1rem",
      fontWeight: 300,
    },
    h6: {
      fontSize: "0.875rem",
      fontWeight: 600,
    },
    body1: {
      fontSize: "1rem",
    },
    body2: {
      fontSize: "0.875rem",
    },
  },
});

export default theme;
