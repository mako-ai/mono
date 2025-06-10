import { useEffect, useState, useRef } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Container,
} from "@mui/material";
import { CheckCircle, Error as ErrorIcon } from "@mui/icons-material";
import { useWorkspace } from "../contexts/workspace-context";

interface AcceptInviteProps {
  token: string;
}

export function AcceptInvite({ token }: AcceptInviteProps) {
  const { acceptInvite } = useWorkspace();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState<string>("");
  const isProcessingRef = useRef(false);

  useEffect(() => {
    const handleAcceptInvite = async () => {
      if (isProcessingRef.current) return; // Prevent multiple concurrent calls
      isProcessingRef.current = true;

      try {
        const workspace = await acceptInvite(token);
        setStatus("success");
        setMessage(`Successfully joined ${workspace.name}`);

        // Redirect to app after a short delay
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      } catch (error: any) {
        setStatus("error");
        setMessage(error.message || "Failed to accept invitation");
      } finally {
        isProcessingRef.current = false;
      }
    };

    handleAcceptInvite();
  }, [token, acceptInvite]);

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Paper sx={{ p: 4, width: "100%", textAlign: "center" }}>
          {status === "loading" && (
            <>
              <CircularProgress size={60} sx={{ mb: 3 }} />
              <Typography variant="h5" gutterBottom>
                Accepting Invitation
              </Typography>
              <Typography color="text.secondary">
                Please wait while we process your invitation...
              </Typography>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle color="success" sx={{ fontSize: 60, mb: 3 }} />
              <Typography variant="h5" gutterBottom>
                Success!
              </Typography>
              <Alert severity="success" sx={{ mb: 3 }}>
                {message}
              </Alert>
              <Typography color="text.secondary">
                Redirecting to the application...
              </Typography>
            </>
          )}

          {status === "error" && (
            <>
              <ErrorIcon color="error" sx={{ fontSize: 60, mb: 3 }} />
              <Typography variant="h5" gutterBottom>
                Invitation Error
              </Typography>
              <Alert severity="error" sx={{ mb: 3 }}>
                {message}
              </Alert>
              <Button
                variant="contained"
                onClick={() => (window.location.href = "/")}
                sx={{ mt: 2 }}
              >
                Go to Application
              </Button>
            </>
          )}
        </Paper>
      </Box>
    </Container>
  );
}
