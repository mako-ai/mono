import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authClient, type User, type LoginCredentials, type RegisterCredentials } from '../lib/auth-client';

/**
 * Auth context state interface
 */
interface AuthContextState {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => Promise<void>;
  loginWithOAuth: (provider: 'google' | 'github') => void;
  clearError: () => void;
}

/**
 * Auth context
 */
const AuthContext = createContext<AuthContextState | undefined>(undefined);

/**
 * Auth provider component
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Check authentication status on mount
   */
  useEffect(() => {
    checkAuth();
  }, []);

  /**
   * Check if user is authenticated
   */
  const checkAuth = async () => {
    try {
      setLoading(true);
      const currentUser = await authClient.getMe();
      setUser(currentUser);
    } catch (err) {
      console.error('Auth check failed:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Login user
   */
  const login = useCallback(async (credentials: LoginCredentials) => {
    try {
      setError(null);
      setLoading(true);
      const user = await authClient.login(credentials);
      setUser(user);
    } catch (err: any) {
      setError(err.message || 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Register user
   */
  const register = useCallback(async (credentials: RegisterCredentials) => {
    try {
      setError(null);
      setLoading(true);
      const user = await authClient.register(credentials);
      setUser(user);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Logout user
   */
  const logout = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      await authClient.logout();
      setUser(null);
    } catch (err: any) {
      setError(err.message || 'Logout failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Login with OAuth provider
   */
  const loginWithOAuth = useCallback((provider: 'google' | 'github') => {
    authClient.initiateOAuth(provider);
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AuthContextState = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    loginWithOAuth,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}