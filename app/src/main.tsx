import React from "react";
import ReactDOM from "react-dom/client";
// import { BrowserRouter } from "react-router-dom"; // Remove BrowserRouter
import CssBaseline from "@mui/material/CssBaseline";
import { LicenseInfo } from "@mui/x-license";
import App from "./App.tsx";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/auth-context.tsx";

// Set MUI X Premium license key
LicenseInfo.setLicenseKey(
  "f3eba93e264d551ba6584e6c231f023dTz0xMTI5MjMsRT0xNzc4ODAzMTk5MDAwLFM9cHJlbWl1bSxMTT1zdWJzY3JpcHRpb24sUFY9aW5pdGlhbCxLVj0y"
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* <BrowserRouter> */}
    <ThemeProvider>
      <CssBaseline />
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
    {/* </BrowserRouter> */}
  </React.StrictMode>
);
