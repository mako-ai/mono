import { useState } from "react";
import { Box, ToggleButton, ToggleButtonGroup, Button } from "@mui/material";
import { SyncJobForm } from "./SyncJobForm";
import { SyncJobLogs } from "./SyncJobLogs";
import { SettingsIcon, LogsIcon } from "lucide-react";
import { PlayArrow as PlayArrowIcon } from "@mui/icons-material";
import { useWorkspace } from "../contexts/workspace-context";
import { useSyncJobStore } from "../store/syncJobStore";

interface SyncJobEditorProps {
  jobId?: string;
  isNew?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
}

export function SyncJobEditor({
  jobId,
  isNew = false,
  onSave,
  onCancel,
}: SyncJobEditorProps) {
  const [view, setView] = useState<"settings" | "logs">(
    isNew || !jobId ? "settings" : "logs",
  );
  const [currentJobId, setCurrentJobId] = useState<string | undefined>(jobId);
  const { currentWorkspace } = useWorkspace();
  const { runJob } = useSyncJobStore();

  const handleSaved = (newJobId: string) => {
    setCurrentJobId(newJobId);
    onSave?.();
  };

  const handleRunNow = async () => {
    if (currentWorkspace?.id && currentJobId) {
      await runJob(currentWorkspace.id, currentJobId);
    }
  };

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* Top row with Run Now button and toggle button group */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {/* Run Now button on the left */}
        {!isNew && currentJobId && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<PlayArrowIcon fontSize="small" />}
            onClick={handleRunNow}
            sx={{ minWidth: 100 }}
          >
            Run Now
          </Button>
        )}

        {/* Toggle button group in the center */}
        <Box sx={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={(e, val) => val && setView(val)}
            size="small"
          >
            <ToggleButton value="settings" sx={{ gap: 0.5 }}>
              <SettingsIcon size={16} />
              Settings
            </ToggleButton>
            <ToggleButton
              value="logs"
              disabled={!currentJobId}
              sx={{ gap: 0.5 }}
            >
              <LogsIcon size={16} />
              Logs
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Spacer for right side */}
        <Box sx={{ minWidth: 100 }} />
      </Box>

      <Box sx={{ flex: 1, overflow: "auto", position: "relative" }}>
        {view === "settings" && (
          <SyncJobForm
            jobId={currentJobId}
            isNew={isNew && !currentJobId}
            onSave={onSave}
            onSaved={handleSaved}
            onCancel={onCancel}
          />
        )}

        {view === "logs" && currentJobId && (
          <SyncJobLogs jobId={currentJobId} />
        )}
      </Box>
    </Box>
  );
}
