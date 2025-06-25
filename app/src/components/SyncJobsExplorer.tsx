import { useEffect, useState } from "react";
import {
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Chip,
  Tooltip,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
} from "@mui/material";
import {
  Add as AddIcon,
  PlayArrow as RunIcon,
  Pause as PauseIcon,
  Delete as DeleteIcon,
  Schedule as ScheduleIcon,
  Search as SearchIcon,
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
    jobs,
    selectedJobId,
    isLoading,
    error,
    fetchJobs,
    selectJob,
    toggleJob,
    runJob,
    deleteJob,
    clearError,
  } = useSyncJobStore();
  const hasLoadedOnce = useSyncJobStore(state => state.hasLoadedOnce);
  const resetLoadedState = useSyncJobStore(state => state.resetLoadedState);
  const { addConsoleTab, setActiveConsole } = useConsoleStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [lastWorkspaceId, setLastWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    // Reset loaded state when workspace changes
    if (currentWorkspace?.id && currentWorkspace.id !== lastWorkspaceId) {
      resetLoadedState();
      setLastWorkspaceId(currentWorkspace.id);
    }

    // Only fetch if we have a workspace and haven't loaded once
    if (currentWorkspace?.id && !hasLoadedOnce) {
      fetchJobs(currentWorkspace.id);
    }
  }, [
    currentWorkspace?.id,
    hasLoadedOnce,
    fetchJobs,
    resetLoadedState,
    lastWorkspaceId,
  ]);

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

  const filteredJobs = jobs.filter(
    job =>
      job.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.dataSourceId.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.destinationDatabaseId.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
  );

  if (isLoading && jobs.length === 0) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <ScheduleIcon sx={{ fontSize: 20 }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Sync Jobs
          </Typography>
          <Tooltip title="Refresh">
            <IconButton
              size="small"
              onClick={() =>
                currentWorkspace?.id && fetchJobs(currentWorkspace.id)
              }
              disabled={isLoading}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={handleCreateNew}
            variant="contained"
          >
            New
          </Button>
        </Box>

        {/* Search */}
        <TextField
          size="small"
          fullWidth
          placeholder="Search jobs..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={clearError} sx={{ mx: 2, mt: 2 }}>
          {error}
        </Alert>
      )}

      {/* Jobs List */}
      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        {filteredJobs.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {searchTerm
                ? "No jobs found matching your search"
                : "No sync jobs created yet"}
            </Typography>
          </Box>
        ) : (
          <List dense>
            {filteredJobs.map(job => {
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
                            display: "flex",
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
