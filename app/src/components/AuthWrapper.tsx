import React, { useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "../hooks/useAuth";
import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";

interface AuthWrapperProps {
  children: React.ReactNode;
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { user, loading } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  // Show loading spinner while checking auth status
  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress size={60} />
      </Box>
    );
  }

  // If user is not authenticated, show login/register forms
  if (!user) {
    if (showRegister) {
      return <RegisterPage onSwitchToLogin={() => setShowRegister(false)} />;
    }
    return <LoginPage onSwitchToRegister={() => setShowRegister(true)} />;
  }

  // If user is authenticated, show the main app
  return <>{children}</>;
}
