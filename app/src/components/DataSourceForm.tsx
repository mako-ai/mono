/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
import { useEffect, useState, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  IconButton,
  Grid,
  Switch,
  FormControlLabel,
  Divider,
  InputAdornment,
  Alert,
  CircularProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
// react-hook-form may not have type definitions installed in this project yet.
// @ts-ignore
import { useForm, Controller, UseFormReturn } from "react-hook-form";

/**
 * Generic field description coming from the API schema
 */
export interface ConnectorFieldSchema {
  /** config key, e.g. "api_key" */
  name: string;
  /** Human readable label */
  label: string;
  /** Field type: string | number | boolean | password */
  type: "string" | "number" | "boolean" | "password";
  /** Whether it is required */
  required?: boolean;
  /** Default value if not supplied */
  default?: any;
  /** Optional helper text */
  helperText?: string;
  /** Placeholder value */
  placeholder?: string;
  /** Additional options for select inputs */
  options?: Array<{ label: string; value: any }>;
}

export interface ConnectorSchemaResponse {
  /** Array of configuration fields */
  fields: ConnectorFieldSchema[];
}

interface DataSourceFormProps {
  variant?: "dialog" | "inline";
  open?: boolean;
  onClose?: () => void;
  onSubmit: (data: any) => void;
  /** Existing data source (for edit) */
  dataSource?: any | null;
  /** List of available connector types supplied by parent */
  connectorTypes?: Array<{
    type: string;
    name: string;
    version: string;
    description: string;
    supportedEntities: string[];
  }>;
  errorMessage?: string | null;
}

function generateDefaultValues(
  schema?: ConnectorSchemaResponse,
): Record<string, any> {
  if (!schema) return {};
  const defaults: Record<string, any> = {};
  schema.fields.forEach(f => {
    if (f.default !== undefined) {
      defaults[f.name] = f.default;
    } else if (f.type === "boolean") {
      defaults[f.name] = false;
    } else {
      defaults[f.name] = "";
    }
  });
  return defaults;
}

function DataSourceForm({
  variant = "dialog",
  open = false,
  onClose,
  onSubmit,
  dataSource,
  connectorTypes = [],
  errorMessage,
}: DataSourceFormProps) {
  // Fetch connector schema when the type changes
  const [schema, setSchema] = useState<ConnectorSchemaResponse | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // React Hook Form setup
  const defaultValues = useMemo(() => {
    if (dataSource) {
      return {
        name: dataSource.name || "",
        description: dataSource.description || "",
        type: dataSource.type || "",
        isActive: dataSource.isActive ?? true,
        // Flatten config keys at the root level for RHF simplicity
        ...dataSource.config,
        // Advanced settings (namespaced with settings.)
        settings_sync_batch_size: dataSource.settings?.sync_batch_size ?? 100,
        settings_rate_limit_delay_ms:
          dataSource.settings?.rate_limit_delay_ms ?? 200,
        settings_max_retries: dataSource.settings?.max_retries ?? 3,
        settings_timeout_ms: dataSource.settings?.timeout_ms ?? 30000,
      } as Record<string, any>;
    }
    return {
      name: "",
      description: "",
      type: "",
      isActive: true,
    } as Record<string, any>;
  }, [dataSource]);

  const form = useForm({
    defaultValues,
  });

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = form;

  // Watch selected connector type
  const selectedType = watch("type");

  // Reset form when dataSource changes (edit mode)
  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  // Fetch schema when connector type changes
  useEffect(() => {
    if (!selectedType) {
      setSchema(null);
      return;
    }
    // If editing and we already have schema loaded with same type, skip
    setSchemaLoading(true);
    setSchemaError(null);
    fetch(`/api/connectors/${selectedType}/schema`)
      .then(async res => {
        if (!res.ok) {
          throw new Error(await res.text());
        }
        return res.json();
      })
      .then(json => {
        setSchema(json.data as ConnectorSchemaResponse);
        // Populate default values for new type if they don't exist yet
        const defaults = generateDefaultValues(json.data);
        Object.entries(defaults).forEach(([key, value]) => {
          // Only set if value not already present (keeps existing data when editing)
          if (form.getValues(key as any) === undefined) {
            form.setValue(key as any, value);
          }
        });
      })
      .catch(err => {
        console.error(err);
        setSchemaError(err.message || "Failed to load connector schema");
      })
      .finally(() => {
        setSchemaLoading(false);
      });
  }, [selectedType]);

  /** Submit handler */
  const onSubmitInternal = (values: Record<string, any>) => {
    // Build config from schema fields
    const config: Record<string, any> = {};
    if (schema) {
      schema.fields.forEach(f => {
        config[f.name] = values[f.name];
      });
    }

    const payload = {
      name: values.name,
      description: values.description,
      type: values.type,
      isActive: values.isActive,
      config,
      settings: {
        sync_batch_size: Number(values.settings_sync_batch_size) || 100,
        rate_limit_delay_ms: Number(values.settings_rate_limit_delay_ms) || 200,
        max_retries: Number(values.settings_max_retries) || 3,
        timeout_ms: Number(values.settings_timeout_ms) || 30000,
      },
    };

    onSubmit(payload);
  };

  /** Renders a single dynamic config field */
  const renderDynamicField = (
    field: ConnectorFieldSchema,
    form: UseFormReturn<any>,
  ) => {
    const { control } = form;
    const { name, label, type, required, helperText, placeholder, options } =
      field;
    const fieldType = type === "password" ? "password" : "text";

    if (type === "boolean") {
      return (
        <Controller
          key={name}
          name={name}
          control={control}
          rules={{ required }}
          render={({ field }) => (
            <FormControlLabel
              control={<Switch {...field} checked={field.value ?? false} />}
              label={label}
            />
          )}
        />
      );
    }

    if (options && options.length > 0) {
      return (
        <Controller
          key={name}
          name={name}
          control={control}
          rules={{ required }}
          render={({ field }) => (
            <FormControl fullWidth margin="normal">
              <InputLabel>{label}</InputLabel>
              <Select {...field} label={label}>
                {options.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
      );
    }

    // Default: TextField
    return (
      <Controller
        key={name}
        name={name}
        control={control}
        rules={{ required }}
        render={({ field, fieldState }) => (
          <TextField
            {...field}
            fullWidth
            margin="normal"
            type={fieldType}
            label={label}
            placeholder={placeholder}
            error={!!fieldState.error}
            helperText={
              fieldState.error ? "This field is required" : helperText
            }
          />
        )}
      />
    );
  };

  // -------------------------------------------------
  // UI Sections
  // -------------------------------------------------

  const typeSelect = (
    <FormControl fullWidth margin="normal">
      <InputLabel>Source Type</InputLabel>
      <Controller
        name="type"
        control={control}
        rules={{ required: true }}
        render={({ field }) => (
          <Select {...field} label="Source Type">
            {connectorTypes.map(connector => (
              <MenuItem key={connector.type} value={connector.type}>
                {connector.name}
              </MenuItem>
            ))}
          </Select>
        )}
      />
      {errors.type && (
        <Typography variant="caption" color="error" sx={{ ml: 2 }}>
          Source type is required
        </Typography>
      )}
    </FormControl>
  );

  const basicInformationSection = (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" gutterBottom>
        Basic Information
      </Typography>
      <Controller
        name="name"
        control={control}
        rules={{ required: true }}
        render={({ field, fieldState }) => (
          <TextField
            {...field}
            fullWidth
            margin="normal"
            label="Name"
            error={!!fieldState.error}
            helperText={fieldState.error ? "Name is required" : undefined}
          />
        )}
      />
      <Controller
        name="description"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            fullWidth
            margin="normal"
            label="Description (optional)"
            multiline
            rows={2}
          />
        )}
      />
      <Controller
        name="isActive"
        control={control}
        render={({ field }) => (
          <FormControlLabel
            control={<Switch {...field} checked={field.value ?? true} />}
            label="Active"
            sx={{ mt: 2 }}
          />
        )}
      />
    </Box>
  );

  const connectionConfigSection = (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" gutterBottom>
        Connection Configuration
      </Typography>
      {schemaLoading && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CircularProgress size={20} />
          <Typography variant="body2">Loading schema…</Typography>
        </Box>
      )}
      {schemaError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {schemaError}
        </Alert>
      )}
      {schema && schema.fields.map(f => renderDynamicField(f, form))}
      {!schemaLoading && !schema && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          Select a source type to load configuration fields.
        </Typography>
      )}
    </Box>
  );

  const advancedSettingsSection = (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" gutterBottom>
        Advanced Settings
      </Typography>
      <Grid container spacing={2}>
        <Grid xs={6}>
          <Controller
            name="settings_sync_batch_size"
            control={control}
            rules={{ min: 1, required: true }}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                fullWidth
                label="Sync Batch Size"
                type="number"
                margin="normal"
                error={!!fieldState.error}
                helperText={
                  fieldState.error ? "Must be at least 1" : "Records per batch"
                }
                inputProps={{ min: 1 }}
              />
            )}
          />
        </Grid>
        <Grid xs={6}>
          <Controller
            name="settings_rate_limit_delay_ms"
            control={control}
            rules={{ min: 0, required: true }}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                fullWidth
                label="Rate Limit Delay (ms)"
                type="number"
                margin="normal"
                error={!!fieldState.error}
                helperText={
                  fieldState.error
                    ? "Cannot be negative"
                    : "Delay between API calls"
                }
                inputProps={{ min: 0 }}
              />
            )}
          />
        </Grid>
        <Grid xs={6}>
          <Controller
            name="settings_max_retries"
            control={control}
            rules={{ min: 0, required: true }}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="Max Retries"
                type="number"
                margin="normal"
                inputProps={{ min: 0 }}
              />
            )}
          />
        </Grid>
        <Grid xs={6}>
          <Controller
            name="settings_timeout_ms"
            control={control}
            rules={{ min: 1000, required: true }}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="Timeout (ms)"
                type="number"
                margin="normal"
                inputProps={{ min: 1000 }}
              />
            )}
          />
        </Grid>
      </Grid>
    </Box>
  );

  // --------------------------------------------------------------------
  // Variant rendering (inline vs dialog)
  // --------------------------------------------------------------------

  const formContent = (
    <Box sx={{ py: 1 }}>
      {/* Optional error message */}
      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}

      {/* Source Type dropdown first */}
      {typeSelect}

      {/* Render rest only if type selected */}
      {selectedType && (
        <>
          <Divider sx={{ my: 3 }} />
          {basicInformationSection}
          <Divider sx={{ my: 3 }} />
          {connectionConfigSection}
          {advancedSettingsSection}
        </>
      )}
    </Box>
  );

  if (variant === "inline") {
    return (
      <Box
        component="form"
        onSubmit={handleSubmit(onSubmitInternal)}
        sx={{ p: 2, maxWidth: "800px", mx: "auto" }}
      >
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            mb: 2,
          }}
        >
          <Typography variant="h6">
            {dataSource ? "Edit Data Source" : "Add Data Source"}
          </Typography>
        </Box>
        {/* Form fields */}
        {formContent}
        {/* Actions */}
        <Box
          sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 2 }}
        >
          {onClose && <Button onClick={onClose}>Cancel</Button>}
          <Button type="submit" variant="contained" disableElevation>
            {dataSource ? "Update" : "Create"}
          </Button>
        </Box>
      </Box>
    );
  }

  // Dialog variant
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { maxHeight: "90vh" } }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography variant="h6">
          {dataSource ? "Edit Data Source" : "Add Data Source"}
        </Typography>
        <IconButton aria-label="close" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>{formContent}</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit(onSubmitInternal)}
          variant="contained"
          disableElevation
        >
          {dataSource ? "Update" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default DataSourceForm;
