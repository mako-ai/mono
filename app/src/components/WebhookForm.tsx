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
  Alert,
  Chip,
  Stack,
} from "@mui/material";
import {
  Save as SaveIcon,
  DataObject as DataIcon,
  Storage as DatabaseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Webhook as WebhookIcon,
  ContentCopy as CopyIcon,
} from "@mui/icons-material";
import { useWorkspace } from "../contexts/workspace-context";
import { useSyncJobStore } from "../store/syncJobStore";
import { useDatabaseStore } from "../store/databaseStore";
import { apiClient } from "../lib/api-client";

interface WebhookFormProps {
  jobId?: string;
  isNew?: boolean;
  onSave?: () => void;
  onSaved?: (jobId: string) => void;
  onCancel?: () => void;
}

interface FormData {
  dataSourceId: string;
  destinationDatabaseId: string;
  webhookSecret?: string;
}

export function WebhookForm({
  jobId,
  isNew = false,
  onSave,
  onSaved,
  onCancel,
}: WebhookFormProps) {
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

  const [connectors, setConnectors] = useState<any[]>([]);
  const [isLoadingConnectors, setIsLoadingConnectors] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string>("");
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
    setValue,
  } = useForm<FormData>({
    defaultValues: {
      dataSourceId: "",
      destinationDatabaseId: "",
    },
  });

  const watchDataSourceId = watch("dataSourceId");

  // Fetch connectors
  const fetchDataSources = async (workspaceId: string) => {
    setIsLoadingConnectors(true);
    try {
      const response = await apiClient.get<{
        success: boolean;
        data: any[];
      }>(`/workspaces/${workspaceId}/connectors`);

      if (response.success) {
        const webhookCapable = (response.data || []).filter(
          source => source.type === "stripe" || source.type === "close",
        );
        setConnectors(webhookCapable);
      }
    } catch (error) {
      console.error("Failed to fetch connectors:", error);
      setError("Failed to load connectors");
    } finally {
      setIsLoadingConnectors(false);
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
      if (job && job.type === "webhook") {
        const formData: FormData = {
          dataSourceId: (job.dataSourceId as any)._id,
          destinationDatabaseId: (job.destinationDatabaseId as any)._id,
        };

        // Set webhook-specific data if available
        if (job.webhookConfig) {
          setWebhookUrl(job.webhookConfig.endpoint || "");
          formData.webhookSecret = job.webhookConfig.secret || "";
        }

        reset(formData);
      }
    }
  }, [isNewMode, currentJobId, jobs, reset]);

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

    setIsSubmitting(true);
    setError(null);

    try {
      // Find the selected source and destination names
      const selectedSource = connectors.find(
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
        type: "webhook",
        dataSourceId: data.dataSourceId,
        destinationDatabaseId: data.destinationDatabaseId,
        syncMode: "incremental", // Webhooks are always incremental
        enabled: true, // Webhooks are always enabled
        webhookSecret: data.webhookSecret || "",
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
              if (
                confirm("Are you sure you want to delete this webhook job?")
              ) {
                if (currentWorkspace?.id) {
                  try {
                    await deleteJob(currentWorkspace.id, currentJobId);
                    // Close the editor after successful deletion
                    onCancel?.();
                  } catch (error) {
                    console.error("Failed to delete webhook job:", error);
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
                        disabled={isLoadingConnectors}
                      >
                        {connectors.map(source => (
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
                      {connectors.length === 0 && !isLoadingConnectors && (
                        <FormHelperText>
                          Only Stripe and Close connectors support webhooks
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

              {/* Webhook Configuration */}
              {/* Webhook URL and Secret (only shown after creation) */}
              {!isNewMode && currentJobId && webhookUrl && (
                <Box
                  sx={{
                    p: 2,
                    bgcolor: "background.paper",
                    borderRadius: 1,
                    border: 1,
                    borderColor: "divider",
                  }}
                >
                  <Typography variant="subtitle2" sx={{ mb: 2 }}>
                    Webhook Configuration
                  </Typography>

                  <Stack spacing={2}>
                    <Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 0.5 }}
                      >
                        Webhook URL
                      </Typography>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        <TextField
                          value={webhookUrl}
                          fullWidth
                          size="small"
                          InputProps={{
                            readOnly: true,
                            endAdornment: (
                              <Button
                                size="small"
                                onClick={() => {
                                  navigator.clipboard.writeText(webhookUrl);
                                  setSuccess(true);
                                  setTimeout(() => setSuccess(false), 2000);
                                }}
                              >
                                <CopyIcon fontSize="small" />
                              </Button>
                            ),
                          }}
                        />
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        Copy this URL to your Stripe/Close webhook settings
                      </Typography>
                    </Box>

                    <Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 0.5 }}
                      >
                        Webhook Secret
                      </Typography>
                      <Controller
                        name="webhookSecret"
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            placeholder="Enter webhook secret (e.g., whsec_...)"
                            fullWidth
                            size="small"
                            type="text"
                            InputProps={{
                              endAdornment: field.value && (
                                <Button
                                  size="small"
                                  onClick={() => {
                                    navigator.clipboard.writeText(field.value);
                                    setSuccess(true);
                                    setTimeout(() => setSuccess(false), 2000);
                                  }}
                                >
                                  <CopyIcon fontSize="small" />
                                </Button>
                              ),
                            }}
                          />
                        )}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {connectors.find(ds => ds._id === watchDataSourceId)
                          ?.type === "stripe"
                          ? "Get this from Stripe Dashboard > Webhooks > Your endpoint > Signing secret"
                          : "Enter the webhook signing secret from your provider"}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              )}

              {/* Webhook Preview */}
              <Alert severity="info" icon={<WebhookIcon />}>
                <Typography variant="body2">
                  <strong>Webhook:</strong> Real-time sync triggered by webhook
                  events
                  {isNewMode && " (URL will be generated after creation)"}
                </Typography>
              </Alert>
            </Stack>
          </form>
        </Box>
      </Box>
    </Box>
  );
}
