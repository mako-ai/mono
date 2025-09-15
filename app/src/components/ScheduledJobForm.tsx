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
  FormHelperText,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
  Chip,
  FormControlLabel,
  Switch,
  Stack,
  Checkbox,
  FormGroup,
  Divider,
  CircularProgress,
} from "@mui/material";
import {
  Save as SaveIcon,
  Schedule as ScheduleIcon,
  DataObject as DataIcon,
  Storage as DatabaseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { useWorkspace } from "../contexts/workspace-context";
import { useSyncJobStore } from "../store/syncJobStore";
import { useDatabaseStore } from "../store/databaseStore";
import { useConnectorCatalogStore } from "../store/connectorCatalogStore";
import { apiClient } from "../lib/api-client";

interface ScheduledJobFormProps {
  jobId?: string;
  isNew?: boolean;
  onSave?: () => void;
  onSaved?: (jobId: string) => void;
  onCancel?: () => void;
}

interface FormData {
  dataSourceId: string;
  destinationDatabaseId: string;
  schedule: string;
  timezone: string;
  syncMode: "full" | "incremental";
  enabled: boolean;
  entityFilter: string[];
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

export function ScheduledJobForm({
  jobId,
  isNew = false,
  onSave,
  onSaved,
  onCancel,
}: ScheduledJobFormProps) {
  const { currentWorkspace } = useWorkspace();
  const {
    jobs: jobsMap,
    loading: loadingMap,
    error: errorMap,
    createJob,
    updateJob,
    clearError,
    deleteJob,
  } = useSyncJobStore();

  // Get workspace-specific data
  const jobs = currentWorkspace ? jobsMap[currentWorkspace.id] || [] : [];
  const jobsLoading = currentWorkspace
    ? !!loadingMap[currentWorkspace.id]
    : false;
  const storeError = currentWorkspace
    ? errorMap[currentWorkspace.id] || null
    : null;
  const databases = useDatabaseStore(state => state.databases);
  const fetchDatabases = useDatabaseStore(state => state.fetchDatabases);

  // Get connector catalog data
  const {
    types: connectorTypes,
    fetchCatalog,
    loading: catalogLoading,
  } = useConnectorCatalogStore();

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

  // Entity selection state
  const [availableEntities, setAvailableEntities] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [selectAllEntities, setSelectAllEntities] = useState(true);
  const [entitiesLoadState, setEntitiesLoadState] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");

  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    watch,
    setValue,
  } = useForm<FormData>({
    defaultValues: {
      dataSourceId: "",
      destinationDatabaseId: "",
      schedule: "0 * * * *", // Default hourly
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      syncMode: "full",
      enabled: true,
      entityFilter: [],
    },
  });

  const watchSchedule = watch("schedule");
  const watchTimezone = watch("timezone");
  const watchDataSourceId = watch("dataSourceId");

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

  // Get entities from connector catalog instead of making REST call
  const updateAvailableEntities = (dataSourceId: string) => {
    if (!dataSourceId) {
      setAvailableEntities([]);
      setEntitiesLoadState("idle");
      return;
    }

    // If we're still loading data sources or catalog, show loading state
    if (
      isLoadingDataSources ||
      catalogLoading ||
      !dataSources.length ||
      !connectorTypes
    ) {
      setEntitiesLoadState("loading");
      return;
    }

    // Find the selected data source
    const selectedDataSource = dataSources.find(ds => ds._id === dataSourceId);
    if (!selectedDataSource) {
      setAvailableEntities([]);
      setEntitiesLoadState("error");
      return;
    }

    // Find the connector type in the catalog
    const connectorType = connectorTypes.find(
      ct => ct.type === selectedDataSource.type,
    );
    if (!connectorType) {
      console.warn(
        `Connector type ${selectedDataSource.type} not found in catalog`,
      );
      setAvailableEntities([]);
      setEntitiesLoadState("error");
      return;
    }

    // Use the supportedEntities from the connector type
    setAvailableEntities(connectorType.supportedEntities || []);
    setEntitiesLoadState("loaded");

    // Only reset selection when entities change if we're in new mode
    // or if there's no existing entity selection from a loaded job
    if (isNewMode || (!currentJobId && jobs.length === 0)) {
      setSelectedEntities([]);
      setSelectAllEntities(true);
      setValue("entityFilter", []);
    }
  };

  // Handle entity selection changes
  const handleEntityChange = (entity: string, checked: boolean) => {
    let newSelectedEntities: string[];
    if (checked) {
      newSelectedEntities = [...selectedEntities, entity];
    } else {
      newSelectedEntities = selectedEntities.filter(e => e !== entity);
    }

    setSelectedEntities(newSelectedEntities);
    setSelectAllEntities(
      newSelectedEntities.length === availableEntities.length,
    );

    // Update form value - empty array means sync all entities
    setValue(
      "entityFilter",
      newSelectedEntities.length === availableEntities.length
        ? []
        : newSelectedEntities,
      {
        shouldDirty: true,
      },
    );
  };

  // Handle "All Entities" checkbox
  const handleSelectAllChange = (checked: boolean) => {
    setSelectAllEntities(checked);
    if (checked) {
      setSelectedEntities([...availableEntities]);
      setValue("entityFilter", [], { shouldDirty: true }); // Empty means all
    } else {
      setSelectedEntities([]);
      // When unchecking "All Entities", start with no specific entities selected
      // The user must then select specific entities, or re-check "All Entities"
      setValue("entityFilter", [], { shouldDirty: true });
    }
  };

  // Load initial data
  useEffect(() => {
    if (currentWorkspace?.id) {
      fetchDataSources(currentWorkspace.id);
      fetchDatabases();
      fetchCatalog(currentWorkspace.id);
    }
  }, [currentWorkspace?.id, fetchDatabases, fetchCatalog]);

  // Update entities when data source changes
  useEffect(() => {
    updateAvailableEntities(watchDataSourceId);
  }, [
    watchDataSourceId,
    dataSources,
    connectorTypes,
    isLoadingDataSources,
    catalogLoading,
  ]);

  // Load job data if editing
  useEffect(() => {
    if (!isNewMode && currentJobId && jobs.length > 0) {
      const job = jobs.find(j => j._id === currentJobId);
      if (job && job.type === "scheduled") {
        const formData: FormData = {
          dataSourceId: (job.dataSourceId as any)._id,
          destinationDatabaseId: (job.destinationDatabaseId as any)._id,
          schedule: job.schedule?.cron || "0 * * * *",
          timezone: job.schedule?.timezone || "UTC",
          syncMode: job.syncMode as "full" | "incremental",
          enabled: job.enabled,
          entityFilter: job.entityFilter || [],
        };

        reset(formData);

        // Set entity selection state
        if (job.entityFilter && job.entityFilter.length > 0) {
          setSelectedEntities(job.entityFilter);
          setSelectAllEntities(false);
        } else {
          setSelectAllEntities(true);
          setSelectedEntities([]);
        }

        // Check if using a preset
        const isPreset = SCHEDULE_PRESETS.some(
          p => p.cron === job.schedule.cron,
        );
        setScheduleMode(isPreset ? "preset" : "custom");
      }
    }
  }, [isNewMode, currentJobId, jobs, reset]);

  // Re-apply job entity selection after entities are loaded
  useEffect(() => {
    if (
      !isNewMode &&
      currentJobId &&
      jobs.length > 0 &&
      availableEntities.length > 0
    ) {
      const job = jobs.find(j => j._id === currentJobId);
      if (job && job.entityFilter && job.entityFilter.length > 0) {
        // Validate that the job's entities exist in available entities
        const validEntities = job.entityFilter.filter(entity =>
          availableEntities.includes(entity),
        );
        if (validEntities.length > 0) {
          setSelectedEntities(validEntities);
          setSelectAllEntities(false);
        }
      }
    }
  }, [isNewMode, currentJobId, jobs, availableEntities]);

  // Sync form entityFilter with selection state
  useEffect(() => {
    if (selectAllEntities) {
      setValue("entityFilter", [], { shouldDirty: true });
    } else {
      setValue("entityFilter", selectedEntities, { shouldDirty: true });
    }
  }, [selectAllEntities, selectedEntities, setValue]);

  // Clear store error when component unmounts
  useEffect(() => {
    return () => {
      if (currentWorkspace?.id) {
        clearError(currentWorkspace.id);
      }
    };
  }, [clearError, currentWorkspace?.id]);

  const onSubmit = async (data: FormData) => {
    if (!currentWorkspace?.id) {
      setError("No workspace selected");
      console.error("No workspace selected");
      return;
    }

    // Validate entity selection
    if (!selectAllEntities && selectedEntities.length === 0) {
      setError(
        "Please select at least one entity to sync, or choose 'All Entities'",
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Find the selected source and destination names
      const selectedSource = dataSources.find(
        ds => ds._id === data.dataSourceId,
      );
      const selectedDatabase = databases.find(
        db => db.id === data.destinationDatabaseId,
      );

      // Auto-generate name as "source → destination"
      const generatedName = `${selectedSource?.name || "Source"} → ${selectedDatabase?.name || "Destination"}`;

      // Create payload compatible with the API
      const payload: any = {
        name: generatedName,
        type: "scheduled",
        dataSourceId: data.dataSourceId,
        destinationDatabaseId: data.destinationDatabaseId,
        syncMode: data.syncMode,
        enabled: data.enabled,
        entityFilter: data.entityFilter,
        schedule: {
          cron: data.schedule,
          timezone: data.timezone,
        },
      };

      // Debug logging
      console.log("Form submission data:", {
        selectAllEntities,
        selectedEntities,
        entityFilter: data.entityFilter,
        payload: payload.entityFilter,
      });

      let newJob;
      if (isNewMode) {
        newJob = await createJob(currentWorkspace.id, payload);
        setSuccess(true);
        // Refresh the jobs list
        await useSyncJobStore.getState().fetchJobs(currentWorkspace.id);

        // Switch to edit mode and update the jobId
        setIsNewMode(false);
        setCurrentJobId(newJob._id);

        // Notify parent that a new job has been created
        onSaved?.(newJob._id);

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

        onSaved?.(currentJobId);

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
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Top bar with action buttons */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {/* Delete button on the left */}
        {!isNewMode && currentJobId && (
          <Button
            color="error"
            size="small"
            startIcon={<DeleteIcon />}
            onClick={async () => {
              if (confirm("Are you sure you want to delete this sync job?")) {
                if (currentWorkspace?.id) {
                  try {
                    await deleteJob(currentWorkspace.id, currentJobId);
                    // Close the editor after successful deletion
                    onCancel?.();
                  } catch (error) {
                    console.error("Failed to delete sync job:", error);
                  }
                }
              }
            }}
            disabled={isSubmitting}
          >
            Delete
          </Button>
        )}

        {/* Spacer for left alignment */}
        <Box sx={{ flex: 1 }} />

        {/* Right-aligned save/cancel buttons */}
        <Box sx={{ display: "flex", gap: 1 }}>
          {onCancel && (
            <Button size="small" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            variant="contained"
            size="small"
            startIcon={isNewMode ? <AddIcon /> : <SaveIcon />}
            disabled={isSubmitting}
            onClick={handleSubmit(onSubmit)}
          >
            {isNewMode ? "Create" : "Save"}
          </Button>
        </Box>
      </Box>

      {/* Main form content */}
      <Box sx={{ flex: 1, overflow: "auto", p: { xs: 2, sm: 3 } }}>
        <Box sx={{ maxWidth: "800px", mx: "auto" }}>
          {(error || storeError) && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error || storeError}
            </Alert>
          )}

          <Typography
            variant="body1"
            sx={{ mb: 3, display: "flex", alignItems: "center", gap: 1 }}
          >
            {currentJobId && (
              <>
                <strong>Job ID:</strong> {currentJobId}
              </>
            )}
          </Typography>

          <form onSubmit={handleSubmit(onSubmit)}>
            <Stack spacing={3}>
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
                    <FormControl
                      fullWidth
                      error={!!errors.destinationDatabaseId}
                    >
                      <InputLabel>Destination Database</InputLabel>
                      <Select
                        {...field}
                        label="Destination Database"
                        startAdornment={
                          <DatabaseIcon
                            sx={{ mr: 1, color: "action.active" }}
                          />
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

              {/* Entity Selection */}
              {watchDataSourceId && (
                <>
                  <Divider />
                  <Box>
                    {entitiesLoadState === "loading" ? (
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                          p: 2,
                        }}
                      >
                        <CircularProgress size={20} />
                        <Typography variant="body2" color="text.secondary">
                          Loading available entities...
                        </Typography>
                      </Box>
                    ) : entitiesLoadState === "loaded" &&
                      availableEntities.length > 0 ? (
                      <Box>
                        {/* Select All Option */}
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={selectAllEntities}
                              indeterminate={
                                selectedEntities.length > 0 &&
                                selectedEntities.length <
                                  availableEntities.length
                              }
                              onChange={e =>
                                handleSelectAllChange(e.target.checked)
                              }
                            />
                          }
                          label={
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                              }}
                            >
                              <Typography variant="body2" fontWeight="bold">
                                Entities
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                ({availableEntities.length} total)
                              </Typography>
                            </Box>
                          }
                        />

                        {/* Individual Entity Options */}
                        <FormGroup sx={{ ml: 2 }}>
                          {availableEntities.map(entity => (
                            <FormControlLabel
                              key={entity}
                              control={
                                <Checkbox
                                  checked={
                                    selectAllEntities ||
                                    selectedEntities.includes(entity)
                                  }
                                  onChange={e =>
                                    handleEntityChange(entity, e.target.checked)
                                  }
                                  disabled={selectAllEntities}
                                />
                              }
                              label={
                                <Typography variant="body2">
                                  {entity}
                                </Typography>
                              }
                            />
                          ))}
                        </FormGroup>

                        <Alert
                          severity={
                            selectAllEntities || selectedEntities.length > 0
                              ? "info"
                              : "warning"
                          }
                          sx={{ mt: 2 }}
                        >
                          <Typography variant="body2">
                            {selectAllEntities
                              ? "All entities will be synced from this data source."
                              : selectedEntities.length > 0
                                ? `${selectedEntities.length} of ${availableEntities.length} entities selected for sync.`
                                : "⚠️ No entities selected. Please select at least one entity or choose 'All Entities' to proceed."}
                          </Typography>
                        </Alert>
                      </Box>
                    ) : entitiesLoadState === "loaded" ? (
                      <Alert severity="warning">
                        No entities available for this data source.
                      </Alert>
                    ) : null}
                  </Box>
                </>
              )}

              {/* Schedule Configuration */}
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

              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <Box sx={{ flex: scheduleMode === "preset" ? 2 : 1.5 }}>
                  <Controller
                    name="schedule"
                    control={control}
                    rules={{
                      required: "Schedule is required",
                    }}
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
                        <MenuItem value="incremental">
                          Incremental Sync
                        </MenuItem>
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
          </form>
        </Box>
      </Box>
    </Box>
  );
}
