import { useEffect, useState } from "react";
import {
  Box,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Chip,
  Tooltip,
  Alert,
  Skeleton,
} from "@mui/material";
import {
  Add as AddIcon,
  PlayArrow as RunIcon,
  Pause as PauseIcon,
  Delete as DeleteIcon,
  Schedule as ScheduleIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  HourglassEmpty as PendingIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { useWorkspace } from "../contexts/workspace-context";
import { useSyncJobStore } from "../store/syncJobStore";
import { useConsoleStore } from "../store/consoleStore";

export function SyncJobsExplorer() {
  const { currentWorkspace } = useWorkspace();
  const {
    jobs: jobsMap,
    loading: loadingMap,
    error: errorMap,
    selectedJobId,
    init,
    refresh,
    selectJob,
    toggleJob,
    runJob,
    deleteJob,
    clearError,
  } = useSyncJobStore();

  const jobs = currentWorkspace ? jobsMap[currentWorkspace.id] || [] : [];
  const isLoading = currentWorkspace
    ? !!loadingMap[currentWorkspace.id]
    : false;
  const error = currentWorkspace ? errorMap[currentWorkspace.id] || null : null;

  const { addConsoleTab, setActiveConsole } = useConsoleStore();

  useEffect(() => {
    if (currentWorkspace) {
      init(currentWorkspace.id);
    }
  }, [currentWorkspace?.id, init]);

  const handleRefresh = async () => {
    if (currentWorkspace?.id) {
      await refresh(currentWorkspace.id);
    }
  };

  const handleCreateNew = () => {
    const id = addConsoleTab({
      title: "New Sync Job",
      content: "",
      initialContent: "",
      kind: "sync-job-editor" as any,
      metadata: { isNew: true },
    });
    setActiveConsole(id);
  };

  const handleEditJob = (jobId: string) => {
    selectJob(jobId);
    const job = jobs.find(j => j._id === jobId);
    if (job) {
      const existingTab = useConsoleStore
        .getState()
        .consoleTabs.find((tab: any) => tab.metadata?.jobId === jobId);

      if (existingTab) {
        setActiveConsole(existingTab.id);
      } else {
        const id = addConsoleTab({
          title: job.name,
          content: "",
          initialContent: "",
          kind: "sync-job-editor" as any,
          metadata: { jobId, isNew: false },
        });
        setActiveConsole(id);
      }
    }
  };

  const handleRunJob = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (currentWorkspace?.id) {
      await runJob(currentWorkspace.id, jobId);
    }
  };

  const handleToggleJob = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (currentWorkspace?.id) {
      await toggleJob(currentWorkspace.id, jobId);
    }
  };

  const handleDeleteJob = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this sync job?")) {
      if (currentWorkspace?.id) {
        await deleteJob(currentWorkspace.id, jobId);
      }
    }
  };

  const getJobStatus = (job: any) => {
    if (!job.enabled) {
      return {
        icon: <PauseIcon />,
        label: "Disabled",
        color: "default" as const,
      };
    }
    if (job.lastError) {
      return { icon: <ErrorIcon />, label: "Failed", color: "error" as const };
    }
    if (job.lastSuccessAt) {
      return {
        icon: <SuccessIcon />,
        label: "Success",
        color: "success" as const,
      };
    }
    return {
      icon: <PendingIcon />,
      label: "Pending",
      color: "warning" as const,
    };
  };

  const renderSkeletonItems = () => {
    return Array.from({ length: 3 }).map((_, index) => (
      <ListItem key={`skeleton-${index}`} disablePadding>
        <ListItemButton disabled>
          <ListItemIcon sx={{ minWidth: 36 }}>
            <Skeleton variant="circular" width={24} height={24} />
          </ListItemIcon>
          <ListItemText
            primary={
              <Skeleton
                variant="text"
                width={`${60 + Math.random() * 40}%`}
                height={20}
              />
            }
            secondary={
              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  gap: 0.5,
                  alignItems: "center",
                }}
              >
                <Skeleton variant="text" width={120} height={16} />
                <Skeleton
                  variant="rectangular"
                  width={50}
                  height={16}
                  sx={{ borderRadius: 1 }}
                />
              </Box>
            }
          />
        </ListItemButton>
      </ListItem>
    ));
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box sx={{ px: 1, py: 0.25, borderBottom: 1, borderColor: "divider" }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography
            variant="h6"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Sync Jobs
          </Typography>
          <Box sx={{ display: "flex" }}>
            <Tooltip title="Add Sync Job">
              <IconButton size="small" onClick={handleCreateNew}>
                <AddIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Refresh">
              <IconButton
                size="small"
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert
          severity="error"
          onClose={() =>
            currentWorkspace?.id && clearError(currentWorkspace.id)
          }
          sx={{ mx: 2, mt: 2 }}
        >
          {error}
        </Alert>
      )}

      {/* Jobs List */}
      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        {isLoading && jobs.length === 0 ? (
          <List dense>{renderSkeletonItems()}</List>
        ) : jobs.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
            <Typography variant="body2">No sync jobs configured.</Typography>
          </Box>
        ) : (
          <List dense>
            {jobs.map(job => {
              const status = getJobStatus(job);
              return (
                <ListItem
                  key={job._id}
                  disablePadding
                  secondaryAction={
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      <Tooltip title="Run now">
                        <IconButton
                          size="small"
                          onClick={e => handleRunJob(e, job._id)}
                          disabled={!job.enabled}
                        >
                          <RunIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={job.enabled ? "Disable" : "Enable"}>
                        <IconButton
                          size="small"
                          onClick={e => handleToggleJob(e, job._id)}
                        >
                          {job.enabled ? (
                            <PauseIcon fontSize="small" />
                          ) : (
                            <RunIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={e => handleDeleteJob(e, job._id)}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  }
                >
                  <ListItemButton
                    selected={selectedJobId === job._id}
                    onClick={() => handleEditJob(job._id)}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {status.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={job.name}
                      secondary={
                        <Box
                          component="span"
                          sx={{
                            display: "inline-flex",
                            gap: 0.5,
                            alignItems: "center",
                          }}
                        >
                          <Typography variant="caption" component="span">
                            {job.dataSourceId.name} →{" "}
                            {job.destinationDatabaseId.name}
                          </Typography>
                          <Chip
                            label={job.syncMode}
                            size="small"
                            sx={{ height: 16, fontSize: "0.7rem" }}
                          />
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </Box>
    </Box>
  );
}
