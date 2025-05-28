import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { LicenseInfo } from "@mui/x-license";
import App from "./App.tsx";
import theme from "./theme";

// Set MUI X Premium license key
LicenseInfo.setLicenseKey(
  "f3eba93e264d551ba6584e6c231f023dTz0xMTI5MjMsRT0xNzc4ODAzMTk5MDAwLFM9cHJlbWl1bSxMTT1zdWJzY3JpcHRpb24sUFY9aW5pdGlhbCxLVj0y"
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
