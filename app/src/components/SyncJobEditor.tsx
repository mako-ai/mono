import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import {
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Typography,
  Paper,
  FormHelperText,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
  LinearProgress,
  Chip,
  FormControlLabel,
  Switch,
  Stack,
  Snackbar,
} from "@mui/material";
import {
  Save as SaveIcon,
  Schedule as ScheduleIcon,
  DataObject as DataIcon,
  Storage as DatabaseIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import { useWorkspace } from "../contexts/workspace-context";
import { useSyncJobStore } from "../store/syncJobStore";
import { useDatabaseStore } from "../store/databaseStore";
import { apiClient } from "../lib/api-client";

interface SyncJobEditorProps {
  jobId?: string;
  isNew?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
}

interface FormData {
  name: string;
  dataSourceId: string;
  destinationDatabaseId: string;
  schedule: string;
  timezone: string;
  syncMode: "full" | "incremental";
  enabled: boolean;
}

// Common schedule presets
const SCHEDULE_PRESETS = [
  { label: "Every 5 minutes", cron: "*/5 * * * *" },
  { label: "Every 15 minutes", cron: "*/15 * * * *" },
  { label: "Every 30 minutes", cron: "*/30 * * * *" },
  { label: "Hourly", cron: "0 * * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Daily at midnight", cron: "0 0 * * *" },
  { label: "Daily at 6 AM", cron: "0 6 * * *" },
  { label: "Weekly on Sunday", cron: "0 0 * * 0" },
  { label: "Monthly on 1st", cron: "0 0 1 * *" },
];

export function SyncJobEditor({
  jobId,
  isNew = false,
  onSave,
  onCancel,
}: SyncJobEditorProps) {
  const { currentWorkspace } = useWorkspace();
  const {
    jobs,
    createJob,
    updateJob,
    isLoading: jobsLoading,
    error: storeError,
    clearError,
  } = useSyncJobStore();
  const databases = useDatabaseStore(state => state.databases);
  const fetchDatabases = useDatabaseStore(state => state.fetchDatabases);

  const [dataSources, setDataSources] = useState<any[]>([]);
  const [isLoadingDataSources, setIsLoadingDataSources] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"preset" | "custom">(
    "preset",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | undefined>(jobId);
  const [isNewMode, setIsNewMode] = useState(isNew);

  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    watch,
  } = useForm<FormData>({
    defaultValues: {
      name: "",
      dataSourceId: "",
      destinationDatabaseId: "",
      schedule: "0 * * * *", // Default hourly
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      syncMode: "full",
      enabled: true,
    },
  });

  const watchSchedule = watch("schedule");
  const watchTimezone = watch("timezone");

  // Fetch data sources
  const fetchDataSources = async (workspaceId: string) => {
    setIsLoadingDataSources(true);
    try {
      const response = await apiClient.get<{
        success: boolean;
        data: any[];
      }>(`/workspaces/${workspaceId}/sources`);

      if (response.success) {
        setDataSources(response.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch data sources:", error);
      setError("Failed to load data sources");
    } finally {
      setIsLoadingDataSources(false);
    }
  };

  // Load initial data
  useEffect(() => {
    if (currentWorkspace?.id) {
      fetchDataSources(currentWorkspace.id);
      fetchDatabases();
    }
  }, [currentWorkspace?.id, fetchDatabases]);

  // Load job data if editing
  useEffect(() => {
    if (!isNewMode && currentJobId && jobs.length > 0) {
      const job = jobs.find(j => j._id === currentJobId);
      if (job) {
        const formData = {
          name: job.name,
          dataSourceId: job.dataSourceId._id,
          destinationDatabaseId: job.destinationDatabaseId._id,
          schedule: job.schedule.cron,
          timezone: job.schedule.timezone || "UTC",
          syncMode: job.syncMode,
          enabled: job.enabled,
        };
        reset(formData);

        // Check if using a preset
        const isPreset = SCHEDULE_PRESETS.some(
          p => p.cron === job.schedule.cron,
        );
        setScheduleMode(isPreset ? "preset" : "custom");
      }
    }
  }, [isNewMode, currentJobId, jobs, reset]);

  // Clear store error when component unmounts
  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  const onSubmit = async (data: FormData) => {
    if (!currentWorkspace?.id) {
      setError("No workspace selected");
      console.error("No workspace selected");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Create payload compatible with the API
      const payload: any = {
        name: data.name,
        dataSourceId: data.dataSourceId,
        destinationDatabaseId: data.destinationDatabaseId,
        schedule: {
          cron: data.schedule,
          timezone: data.timezone,
        },
        syncMode: data.syncMode,
        enabled: data.enabled,
      };

      let newJob;
      if (isNewMode) {
        newJob = await createJob(currentWorkspace.id, payload);
        setSuccess(true);
        // Refresh the jobs list
        await useSyncJobStore.getState().fetchJobs(currentWorkspace.id);

        // Switch to edit mode and update the jobId
        setIsNewMode(false);
        setCurrentJobId(newJob._id);

        // Reset form with the new job data to mark it as pristine
        reset(data);

        // Notify parent if needed
        onSave?.();
      } else if (currentJobId) {
        await updateJob(currentWorkspace.id, currentJobId, payload);
        setSuccess(true);
        // Refresh the jobs list
        await useSyncJobStore.getState().fetchJobs(currentWorkspace.id);

        // Reset form to mark it as pristine
        reset(data);

        // Notify parent if needed
        onSave?.();
      }
    } catch (error) {
      console.error("Failed to save sync job:", error);
      setError(
        error instanceof Error ? error.message : "Failed to save sync job",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCronDescription = (cron: string) => {
    const preset = SCHEDULE_PRESETS.find(p => p.cron === cron);
    if (preset) return preset.label;

    // Basic cron parsing for common patterns
    const parts = cron.split(" ");
    if (parts.length !== 5) return "Invalid cron expression";

    const [minute, hour, dayMonth, month, dayWeek] = parts;

    if (
      minute === "0" &&
      hour === "*" &&
      dayMonth === "*" &&
      month === "*" &&
      dayWeek === "*"
    ) {
      return "Every hour";
    }
    if (
      minute === "*" &&
      hour === "*" &&
      dayMonth === "*" &&
      month === "*" &&
      dayWeek === "*"
    ) {
      return "Every minute";
    }

    return `Custom: ${cron}`;
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: "auto" }}>
      <Paper sx={{ p: 3 }}>
        <Typography
          variant="h5"
          sx={{ mb: 3, display: "flex", alignItems: "center", gap: 1 }}
        >
          <ScheduleIcon />
          {isNewMode ? "Create Sync Job" : "Edit Sync Job"}
        </Typography>

        {(error || storeError) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error || storeError}
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <Stack spacing={3}>
            {/* Basic Info */}
            <Controller
              name="name"
              control={control}
              rules={{ required: "Name is required" }}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Job Name"
                  error={!!errors.name}
                  helperText={errors.name?.message}
                  placeholder="Daily Customer Sync"
                />
              )}
            />

            {/* Source and Destination */}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <Controller
                name="dataSourceId"
                control={control}
                rules={{ required: "Data source is required" }}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.dataSourceId}>
                    <InputLabel>Data Source</InputLabel>
                    <Select
                      {...field}
                      label="Data Source"
                      startAdornment={
                        <DataIcon sx={{ mr: 1, color: "action.active" }} />
                      }
                      disabled={isLoadingDataSources}
                    >
                      {dataSources.map(source => (
                        <MenuItem key={source._id} value={source._id}>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            {source.name}
                            <Chip label={source.type} size="small" />
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                    {errors.dataSourceId && (
                      <FormHelperText>
                        {errors.dataSourceId.message}
                      </FormHelperText>
                    )}
                  </FormControl>
                )}
              />

              <Controller
                name="destinationDatabaseId"
                control={control}
                rules={{ required: "Destination database is required" }}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.destinationDatabaseId}>
                    <InputLabel>Destination Database</InputLabel>
                    <Select
                      {...field}
                      label="Destination Database"
                      startAdornment={
                        <DatabaseIcon sx={{ mr: 1, color: "action.active" }} />
                      }
                    >
                      {databases.map(db => (
                        <MenuItem key={db.id} value={db.id}>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            {db.name}
                            <Chip label={db.type} size="small" />
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                    {errors.destinationDatabaseId && (
                      <FormHelperText>
                        {errors.destinationDatabaseId.message}
                      </FormHelperText>
                    )}
                  </FormControl>
                )}
              />
            </Stack>

            {/* Schedule Mode */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Schedule
              </Typography>
              <ToggleButtonGroup
                value={scheduleMode}
                exclusive
                onChange={(e, value) => value && setScheduleMode(value)}
                size="small"
                sx={{ mb: 2 }}
              >
                <ToggleButton value="preset">Preset</ToggleButton>
                <ToggleButton value="custom">Custom</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Schedule Input and Timezone */}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <Box sx={{ flex: scheduleMode === "preset" ? 2 : 1.5 }}>
                <Controller
                  name="schedule"
                  control={control}
                  rules={{ required: "Schedule is required" }}
                  render={({ field }) =>
                    scheduleMode === "preset" ? (
                      <FormControl fullWidth>
                        <InputLabel>Schedule Preset</InputLabel>
                        <Select {...field} label="Schedule Preset">
                          {SCHEDULE_PRESETS.map(preset => (
                            <MenuItem key={preset.cron} value={preset.cron}>
                              {preset.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      <TextField
                        {...field}
                        fullWidth
                        label="Cron Expression"
                        error={!!errors.schedule}
                        helperText={
                          errors.schedule?.message ||
                          "Format: minute hour day month weekday"
                        }
                        placeholder="0 * * * *"
                      />
                    )
                  }
                />
              </Box>

              <Box sx={{ flex: 1 }}>
                <Controller
                  name="timezone"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Timezone"
                      helperText="e.g., America/New_York"
                    />
                  )}
                />
              </Box>
            </Stack>

            {/* Sync Mode and Enabled */}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <Controller
                name="syncMode"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>Sync Mode</InputLabel>
                    <Select {...field} label="Sync Mode">
                      <MenuItem value="full">Full Sync</MenuItem>
                      <MenuItem value="incremental">Incremental Sync</MenuItem>
                    </Select>
                    <FormHelperText>
                      {field.value === "full"
                        ? "Replace all data on each sync"
                        : "Only sync new or updated records"}
                    </FormHelperText>
                  </FormControl>
                )}
              />

              <Box sx={{ display: "flex", alignItems: "center", flex: 1 }}>
                <Controller
                  name="enabled"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={field.value}
                          onChange={field.onChange}
                        />
                      }
                      label="Enable Job"
                    />
                  )}
                />
              </Box>
            </Stack>

            {/* Schedule Preview */}
            <Alert severity="info" icon={<ScheduleIcon />}>
              <Typography variant="body2">
                <strong>Schedule:</strong> {getCronDescription(watchSchedule)}
                {watchTimezone && ` in ${watchTimezone}`}
              </Typography>
            </Alert>
          </Stack>

          {/* Actions */}
          <Box
            sx={{ mt: 3, display: "flex", gap: 2, justifyContent: "flex-end" }}
          >
            {onCancel && (
              <Button onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              variant="contained"
              startIcon={isNewMode ? <AddIcon /> : <SaveIcon />}
              disabled={isSubmitting || jobsLoading || !isDirty}
            >
              {isSubmitting
                ? "Saving..."
                : isNewMode
                  ? "Create Job"
                  : "Save Changes"}
            </Button>
          </Box>

          {isSubmitting && <LinearProgress sx={{ mt: 2 }} />}
        </form>
      </Paper>

      <Snackbar
        open={success}
        autoHideDuration={3000}
        onClose={() => setSuccess(false)}
        message={
          isNewMode
            ? "Sync job created successfully!"
            : "Sync job updated successfully!"
        }
      />
    </Box>
  );
}
