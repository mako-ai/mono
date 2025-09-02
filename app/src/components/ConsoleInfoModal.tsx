import { useCallback } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Stack,
  IconButton,
} from "@mui/material";
import { ContentCopy } from "@mui/icons-material";

interface ConsoleInfoModalProps {
  open: boolean;
  onClose: () => void;
  consoleId: string;
  workspaceId?: string;
}

interface MonospaceFieldProps {
  value: string;
  onCopy?: () => void;
  disabled?: boolean;
}

const MonospaceField = ({ value, onCopy, disabled }: MonospaceFieldProps) => {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <Typography
        variant="body2"
        sx={{
          fontFamily: "monospace",
          backgroundColor: "action.selected",
          px: 1,
          py: 0.5,
          borderRadius: 1,
          flex: 1,
          overflowX: "auto",
          fontSize: "0.875rem",
        }}
      >
        {value}
      </Typography>
      {onCopy && (
        <IconButton
          size="small"
          onClick={onCopy}
          title="Copy to clipboard"
          disabled={disabled}
          sx={{ p: 0.5 }}
        >
          <ContentCopy sx={{ fontSize: 18 }} />
        </IconButton>
      )}
    </Box>
  );
};

export default function ConsoleInfoModal({
  open,
  onClose,
  consoleId,
  workspaceId,
}: ConsoleInfoModalProps) {
  const handleCopyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const apiEndpoint = `/workspaces/${workspaceId || ":id"}/consoles/${consoleId}/execute`;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Console Information</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Console ID
            </Typography>
            <MonospaceField
              value={consoleId}
              onCopy={() => handleCopyToClipboard(consoleId)}
            />
          </Box>

          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Workspace ID
            </Typography>
            <MonospaceField
              value={workspaceId || "N/A"}
              onCopy={
                workspaceId
                  ? () => handleCopyToClipboard(workspaceId)
                  : undefined
              }
              disabled={!workspaceId}
            />
          </Box>

          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              API Endpoint
            </Typography>
            <MonospaceField
              value={apiEndpoint}
              onCopy={() => handleCopyToClipboard(apiEndpoint)}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
