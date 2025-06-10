import { AuthProvider } from "../contexts/auth-context";
import { WorkspaceProvider } from "../contexts/workspace-context";
import { ThemeProvider } from "../contexts/ThemeContext";
import { ProtectedRoute } from "./ProtectedRoute";

interface AuthWrapperProps {
  children: React.ReactNode;
}

/**
 * Wrapper component that provides authentication and workspace context
 * Also wraps children in protected route
 */
export function AuthWrapper({ children }: AuthWrapperProps) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <ProtectedRoute>{children}</ProtectedRoute>
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
