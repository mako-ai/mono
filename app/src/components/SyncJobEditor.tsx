import { useState } from "react";
import { Box } from "@mui/material";
import { SyncJobForm } from "./SyncJobForm";
import { SyncJobLogs } from "./SyncJobLogs";
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
    // Switch to logs view after saving
    setView("logs");
    onSave?.();
  };

  const handleRunNow = async () => {
    if (currentWorkspace?.id && currentJobId) {
      await runJob(currentWorkspace.id, currentJobId);
    }
  };

  const handleEditClick = () => {
    setView("settings");
  };

  const handleCancelEdit = () => {
    // Only switch back to logs view, don't close the tab
    setView("logs");
  };

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Form Component - hidden when not in settings view */}
      <Box
        sx={{
          height: "100%",
          display: view === "settings" ? "flex" : "none",
          flexDirection: "column",
        }}
      >
        <SyncJobForm
          jobId={currentJobId}
          isNew={isNew && !currentJobId}
          onSave={onSave}
          onSaved={handleSaved}
          onCancel={handleCancelEdit}
        />
      </Box>

      {/* Logs Component - hidden when not in logs view */}
      {currentJobId && (
        <Box
          sx={{
            height: "100%",
            display: view === "logs" ? "flex" : "none",
            flexDirection: "column",
          }}
        >
          <SyncJobLogs
            jobId={currentJobId}
            onRunNow={handleRunNow}
            onEdit={handleEditClick}
          />
        </Box>
      )}
    </Box>
  );
}
