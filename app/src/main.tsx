import React from "react";
import ReactDOM from "react-dom/client";
// import { BrowserRouter } from "react-router-dom"; // Remove BrowserRouter
import CssBaseline from "@mui/material/CssBaseline";
import { LicenseInfo } from "@mui/x-license";
import App from "./App.tsx";
import { ThemeProvider } from "./contexts/ThemeContext";

// Set MUI X Premium license key
LicenseInfo.setLicenseKey(
  "***REMOVED***"
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* <BrowserRouter> */}
    <ThemeProvider>
      <CssBaseline />
      <App />
    </ThemeProvider>
    {/* </BrowserRouter> */}
  </React.StrictMode>
);
