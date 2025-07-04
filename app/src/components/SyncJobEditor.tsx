import { useState } from "react";
import { Box, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { SyncJobForm } from "./SyncJobForm";
import { SyncJobLogs } from "./SyncJobLogs";
import { SettingsIcon, LogsIcon } from "lucide-react";

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
  const [view, setView] = useState<"settings" | "logs">("settings");
  const [currentJobId, setCurrentJobId] = useState<string | undefined>(jobId);

  const handleSaved = (newJobId: string) => {
    setCurrentJobId(newJobId);
    onSave?.();
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
      {/* Center the toggle button group */}
      <Box
        sx={{ display: "flex", justifyContent: "center", p: 1, flexShrink: 0 }}
      >
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
          <ToggleButton value="logs" disabled={!currentJobId} sx={{ gap: 0.5 }}>
            <LogsIcon size={16} />
            Logs
          </ToggleButton>
        </ToggleButtonGroup>
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
