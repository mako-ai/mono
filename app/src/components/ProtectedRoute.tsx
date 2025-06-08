import React, { useState } from 'react';
import { useAuth } from '../contexts/auth-context';
import { CircularProgress, Box } from '@mui/material';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';

/**
 * Props for ProtectedRoute component
 */
interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Component to protect routes that require authentication
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
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

  // Show login/register if not authenticated
  if (!user) {
    if (showRegister) {
      return <RegisterPage onSwitchToLogin={() => setShowRegister(false)} />;
    }
    return <LoginPage onSwitchToRegister={() => setShowRegister(true)} />;
  }

  // Render children if authenticated
  return <>{children}</>;
}