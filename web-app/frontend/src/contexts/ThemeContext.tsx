import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  ThemeProvider as MuiThemeProvider,
  createTheme,
} from "@mui/material/styles";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  effectiveMode: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

// Function to detect system theme preference
const getSystemTheme = (): "light" | "dark" => {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    // Get saved theme from localStorage or default to 'system'
    const savedMode = localStorage.getItem("themeMode") as ThemeMode;
    return savedMode || "system";
  });

  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(
    getSystemTheme
  );

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        setSystemTheme(e.matches ? "dark" : "light");
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, []);

  // Save theme preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("themeMode", mode);
  }, [mode]);

  // Determine the effective theme mode
  const effectiveMode: "light" | "dark" =
    mode === "system" ? systemTheme : mode;

  // Create theme based on effective mode
  const theme = createTheme({
    palette: {
      mode: effectiveMode,
      ...(effectiveMode === "light"
        ? {
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
          }
        : {
            background: {
              default: "#121212",
              paper: "#1e1e1e",
            },
            primary: {
              main: "#90caf9",
            },
            secondary: {
              main: "#f48fb1",
            },
          }),
    },
    typography: {
      fontFamily: [
        "-apple-system",
        "BlinkMacSystemFont",
        '"Segoe UI"',
        "Roboto",
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
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
          },
          sizeSmall: {
            py: 1,
            px: 2,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            transition: "background-color 0.2s ease, color 0.2s ease",
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          root: {
            transition: "background-color 0.2s ease, border-color 0.2s ease",
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: 0,
            padding: 0,
          },
          scroller: {
            minHeight: 0,
          },
          indicator: {
            transition: "none",
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: ({ theme }: any) => ({
            textTransform: "none",
            minHeight: 0,
            padding: theme.spacing(0.5, 1),
            color: theme.palette.text.secondary,
            "&:hover": {
              color: theme.palette.text.primary,
            },
            "&.Mui-selected": {
              backgroundColor: theme.palette.background.paper,
              color: theme.palette.text.primary,
            },
          }),
        },
      },
    },
  });

  return (
    <ThemeContext.Provider value={{ mode, setMode, effectiveMode }}>
      <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
    </ThemeContext.Provider>
  );
};
