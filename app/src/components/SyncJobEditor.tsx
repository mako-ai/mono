import { useState } from "react";
import { Box } from "@mui/material";
import { ScheduledJobForm } from "./ScheduledJobForm";
import { WebhookForm } from "./WebhookForm";
import { SyncJobLogs } from "./SyncJobLogs";
import { WebhookStats } from "./WebhookStats";
import { useWorkspace } from "../contexts/workspace-context";
import { useSyncJobStore } from "../store/syncJobStore";

interface SyncJobEditorProps {
  jobId?: string;
  isNew?: boolean;
  jobType?: "scheduled" | "webhook"; // For new jobs, specify the type
  onSave?: () => void;
  onCancel?: () => void;
}

export function SyncJobEditor({
  jobId,
  isNew = false,
  jobType = "scheduled",
  onSave,
  onCancel,
}: SyncJobEditorProps) {
  const [isEditing, setIsEditing] = useState(isNew);
  const [currentJobId, setCurrentJobId] = useState<string | undefined>(jobId);
  const { currentWorkspace } = useWorkspace();
  const { jobs: jobsMap, runJob } = useSyncJobStore();

  // Get job details and derive webhook status
  const jobs = currentWorkspace ? jobsMap[currentWorkspace.id] || [] : [];
  const currentJob = currentJobId
    ? jobs.find(j => j._id === currentJobId)
    : null;

  // Determine if this is a webhook job - for new jobs, use the prop; for existing, check the job
  const isWebhookJob = isNew
    ? jobType === "webhook"
    : currentJob?.type === "webhook";

  const handleSaved = (newJobId: string) => {
    setCurrentJobId(newJobId);
    // Switch to info view after saving
    setIsEditing(false);
    onSave?.();
  };

  const handleRunNow = async () => {
    if (currentWorkspace?.id && currentJobId) {
      await runJob(currentWorkspace.id, currentJobId);
    }
  };

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (isNew && !currentJobId) {
      // For new jobs, use the onCancel callback to close the editor
      onCancel?.();
    } else {
      // For existing jobs, just go back to info view
      setIsEditing(false);
    }
  };

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Show form when editing or creating new */}
      {isEditing ? (
        isWebhookJob ? (
          <WebhookForm
            jobId={currentJobId}
            isNew={isNew && !currentJobId}
            onSave={onSave}
            onSaved={handleSaved}
            onCancel={handleCancelEdit}
          />
        ) : (
          <ScheduledJobForm
            jobId={currentJobId}
            isNew={isNew && !currentJobId}
            onSave={onSave}
            onSaved={handleSaved}
            onCancel={handleCancelEdit}
          />
        )
      ) : (
        /* Show info/logs when not editing */
        <>
          {currentJobId && !isWebhookJob && (
            <SyncJobLogs
              jobId={currentJobId}
              onRunNow={handleRunNow}
              onEdit={handleEditClick}
            />
          )}
          {currentJobId && isWebhookJob && currentWorkspace && (
            <WebhookStats
              workspaceId={currentWorkspace.id}
              jobId={currentJobId}
              onEdit={handleEditClick}
            />
          )}
        </>
      )}
    </Box>
  );
}
