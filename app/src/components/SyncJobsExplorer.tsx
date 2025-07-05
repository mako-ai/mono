import { useEffect, useState } from "react";
import {
  Box,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Tooltip,
  Alert,
  Skeleton,
} from "@mui/material";
import { Add as AddIcon, Refresh as RefreshIcon } from "@mui/icons-material";
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
          title: `${job.dataSourceId.name} → ${job.destinationDatabaseId.name}`,
          content: "",
          initialContent: "",
          kind: "sync-job-editor" as any,
          metadata: { jobId, isNew: false },
        });
        setActiveConsole(id);
      }
    }
  };

  const getJobStatus = (job: any) => {
    if (!job.enabled) {
      return {
        label: "Disabled",
        color: "default" as const,
        letter: "D",
      };
    }
    if (job.lastError) {
      return {
        label: "Failed",
        color: "error" as const,
        letter: "F",
      };
    }
    if (job.lastSuccessAt) {
      return {
        label: "Success",
        color: "success" as const,
        letter: "S",
      };
    }
    return {
      label: "Pending",
      color: "warning" as const,
      letter: "A", // Abandoned/Awaiting
    };
  };

  const renderSkeletonItems = () => {
    return Array.from({ length: 3 }).map((_, index) => (
      <ListItem key={`skeleton-${index}`} disablePadding>
        <ListItemButton disabled>
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
                <ListItem key={job._id} disablePadding>
                  <ListItemButton
                    selected={selectedJobId === job._id}
                    onClick={() => handleEditJob(job._id)}
                  >
                    <ListItemText
                      primary={`${job.dataSourceId.name} → ${job.destinationDatabaseId.name}`}
                      secondary={null}
                      sx={{
                        pr: 6,
                        "& .MuiListItemText-primary": {
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        },
                      }}
                    />
                    <Box
                      sx={{
                        position: "absolute",
                        right: 16,
                        top: "50%",
                        transform: "translateY(-50%)",
                        display: "flex",
                        gap: 1,
                        alignItems: "center",
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: "bold",
                          color: "text.secondary",
                        }}
                      >
                        {job.syncMode === "incremental" ? "I" : "F"}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: "bold",
                          color:
                            status.letter === "S"
                              ? "success.main"
                              : status.letter === "F"
                                ? "error.main"
                                : status.letter === "A"
                                  ? "warning.main"
                                  : "text.disabled",
                        }}
                      >
                        {status.letter}
                      </Typography>
                    </Box>
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
