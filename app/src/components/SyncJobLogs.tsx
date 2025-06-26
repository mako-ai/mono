import { useEffect, useState } from "react";
import {
  Box,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Typography,
  Alert,
  Stack,
  styled,
} from "@mui/material";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { useWorkspace } from "../contexts/workspace-context";
import { apiClient } from "../lib/api-client";

interface ExecutionHistoryItem {
  executionId: string;
  executedAt: string;
  startedAt?: string;
  lastHeartbeat?: string;
  completedAt?: string;
  status: "running" | "completed" | "failed" | "canceled";
  success: boolean;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  duration?: number;
  system?: {
    workerId: string;
    workerVersion?: string;
    nodeVersion: string;
    hostname: string;
  };
  context?: {
    dataSourceId: string;
    destinationDatabaseId?: string;
    syncMode: string;
    entityFilter?: string[];
    cronExpression?: string;
    timezone?: string;
  };
  stats?: any;
  logs?: Array<{
    timestamp: string;
    level: string;
    message: string;
    metadata?: any;
  }>;
}

interface SyncJobLogsProps {
  jobId: string;
}

// Styled PanelResizeHandle components (moved from Databases.tsx/Consoles.tsx)
const StyledHorizontalResizeHandle = styled(PanelResizeHandle)(({ theme }) => ({
  width: "1px",
  background: theme.palette.divider,
  cursor: "col-resize",
  transition: "background-color 0.2s ease",
  "&:hover": {
    backgroundColor: theme.palette.primary.main,
  },
}));

export function SyncJobLogs({ jobId }: SyncJobLogsProps) {
  const { currentWorkspace } = useWorkspace();
  const [history, setHistory] = useState<ExecutionHistoryItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [fullExecutionDetails, setFullExecutionDetails] =
    useState<ExecutionHistoryItem | null>(null);

  // Fetch execution history
  useEffect(() => {
    const fetchHistory = async () => {
      if (!currentWorkspace?.id || !jobId) return;
      setIsLoading(true);
      try {
        const response = await apiClient.get<{
          success: boolean;
          data: {
            history: ExecutionHistoryItem[];
          };
        }>(`/workspaces/${currentWorkspace.id}/sync-jobs/${jobId}/history`, {
          limit: "100",
        });

        if (response.success) {
          setHistory(response.data.history || []);
        } else {
          setError("Failed to load history");
        }
      } catch (err) {
        console.error("Failed to fetch execution history", err);
        setError("Failed to load execution history");
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [currentWorkspace?.id, jobId]);

  const selectedHistory =
    selectedIndex >= 0 && selectedIndex < history.length
      ? history[selectedIndex]
      : null;

  // Fetch logs and full execution details when a history item is selected
  useEffect(() => {
    const fetchExecutionDetails = async () => {
      if (!selectedHistory || !currentWorkspace?.id) return;
      try {
        const response = await apiClient.get<{
          success: boolean;
          data: ExecutionHistoryItem;
        }>(
          `/workspaces/${currentWorkspace.id}/sync-jobs/${jobId}/executions/${selectedHistory.executionId}`,
        );

        if (response.success && response.data) {
          setFullExecutionDetails(response.data);
          setLogs(response.data.logs || []);
        } else {
          setFullExecutionDetails(null);
          setLogs([]);
        }
      } catch (err) {
        console.error("Failed to fetch execution details", err);
        setFullExecutionDetails(null);
        setLogs([]);
      }
    };

    fetchExecutionDetails();
  }, [selectedHistory, currentWorkspace?.id, jobId]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 400,
        borderTop: "1px solid",
        borderColor: "divider",
      }}
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <PanelGroup direction="horizontal" style={{ height: "100%" }}>
        <Panel
          defaultSize={25}
          minSize={10}
          maxSize={50}
          style={{ overflow: "auto" }}
        >
          {isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : history.length === 0 ? (
            <Typography variant="body2" sx={{ p: 2 }}>
              No execution history available.
            </Typography>
          ) : (
            <List dense>
              {history.map((h, idx) => (
                <ListItemButton
                  key={idx}
                  selected={idx === selectedIndex}
                  onClick={() => setSelectedIndex(idx)}
                >
                  <ListItemText
                    primary={formatDate(h.executedAt)}
                    secondary={
                      h.status.charAt(0).toUpperCase() + h.status.slice(1)
                    }
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Panel>
        <StyledHorizontalResizeHandle />
        <Panel style={{ padding: 16, overflow: "auto" }}>
          {selectedHistory ? (
            <Stack spacing={2}>
              <Typography variant="subtitle2" color="text.secondary">
                Run ID: {selectedHistory.executionId}
              </Typography>

              <Typography variant="h6">Execution Details</Typography>

              {(() => {
                // Use fullExecutionDetails if available, otherwise fall back to selectedHistory
                const details = fullExecutionDetails || selectedHistory;
                return (
                  <>
                    {/* Timing Information */}
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 1,
                      }}
                    >
                      <Typography variant="body2">
                        <strong>Started:</strong>{" "}
                        {details.startedAt
                          ? formatDate(details.startedAt)
                          : "N/A"}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Completed:</strong>{" "}
                        {details.completedAt
                          ? formatDate(details.completedAt)
                          : "N/A"}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Last Heartbeat:</strong>{" "}
                        {details.lastHeartbeat
                          ? formatDate(details.lastHeartbeat)
                          : "N/A"}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Status:</strong> {details.status}
                      </Typography>
                    </Box>

                    {details.duration !== undefined && (
                      <Typography variant="body2">
                        <strong>Duration:</strong> {details.duration} ms
                      </Typography>
                    )}

                    {/* System Information */}
                    {details.system && (
                      <Box>
                        <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>
                          System Information
                        </Typography>
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 1,
                          }}
                        >
                          <Typography variant="body2">
                            <strong>Worker ID:</strong>{" "}
                            {details.system.workerId}
                          </Typography>
                          <Typography variant="body2">
                            <strong>Hostname:</strong> {details.system.hostname}
                          </Typography>
                          <Typography variant="body2">
                            <strong>Node Version:</strong>{" "}
                            {details.system.nodeVersion}
                          </Typography>
                          {details.system.workerVersion && (
                            <Typography variant="body2">
                              <strong>Worker Version:</strong>{" "}
                              {details.system.workerVersion}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    )}

                    {/* Context Information */}
                    {details.context && (
                      <Box>
                        <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>
                          Sync Configuration
                        </Typography>
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 1,
                          }}
                        >
                          <Typography variant="body2">
                            <strong>Sync Mode:</strong>{" "}
                            {details.context.syncMode}
                          </Typography>
                          <Typography variant="body2">
                            <strong>Data Source ID:</strong>{" "}
                            {details.context.dataSourceId}
                          </Typography>
                          {details.context.cronExpression && (
                            <Typography variant="body2">
                              <strong>Cron:</strong>{" "}
                              {details.context.cronExpression}
                            </Typography>
                          )}
                          {details.context.timezone && (
                            <Typography variant="body2">
                              <strong>Timezone:</strong>{" "}
                              {details.context.timezone}
                            </Typography>
                          )}
                        </Box>
                        {details.context.entityFilter &&
                          details.context.entityFilter.length > 0 && (
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              <strong>Entities:</strong>{" "}
                              {details.context.entityFilter.join(", ")}
                            </Typography>
                          )}
                      </Box>
                    )}

                    {details.error && (
                      <Alert severity="error">
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          <strong>Error:</strong> {details.error.message}
                        </Typography>
                        {details.error.stack && (
                          <Typography
                            variant="caption"
                            component="pre"
                            sx={{ whiteSpace: "pre-wrap", fontSize: "0.7rem" }}
                          >
                            {details.error.stack}
                          </Typography>
                        )}
                      </Alert>
                    )}
                  </>
                );
              })()}

              {logs.length > 0 && (
                <Box>
                  <Typography variant="subtitle2">Logs</Typography>
                  {logs.map((l, idx) => (
                    <Typography
                      key={idx}
                      variant="caption"
                      component="pre"
                      sx={{ whiteSpace: "pre-wrap" }}
                    >
                      [{new Date(l.timestamp).toLocaleTimeString()}]{" "}
                      {l.level.toUpperCase()}: {l.message}
                    </Typography>
                  ))}
                </Box>
              )}
            </Stack>
          ) : (
            <Typography variant="body2">
              Select a run to view details.
            </Typography>
          )}
        </Panel>
      </PanelGroup>
    </Box>
  );
}
