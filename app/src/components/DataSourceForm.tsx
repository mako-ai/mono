import { useEffect, useState, useMemo, useRef } from "react";
import {
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Snackbar,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Delete as DeleteIcon,
} from "@mui/icons-material";

import {
  useForm,
  Controller,
  UseFormReturn,
  useFieldArray,
} from "react-hook-form";

// Zustand stores
import { useDataSourceStore } from "../store/dataSourceStore";
import { useConnectorCatalogStore } from "../store/connectorCatalogStore";

/**
 * Generic field description coming from the API schema
 */
export interface ConnectorFieldSchema {
  /** config key, e.g. "api_key" */
  name: string;
  /** Human readable label */
  label: string;
  /** Field type */
  type:
    | "string"
    | "number"
    | "boolean"
    | "password"
    | "textarea"
    | "object_array";
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
  /** Number of rows for textarea */
  rows?: number;
  /** Whether this field is encrypted when stored */
  encrypted?: boolean;
  /** Nested schema for array items (only for object_array) */
  itemFields?: ConnectorFieldSchema[];
}

export interface ConnectorSchemaResponse {
  /** Array of configuration fields */
  fields: ConnectorFieldSchema[];
}

interface DataSourceFormProps {
  /** Optional tab id when the form is rendered inside a console sources tab. */
  tabId?: string;
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
  /** Notify parent when dirty status changes */
  onDirtyChange?: (dirty: boolean) => void;
  /** Preserve title change callback for backward compatibility (no longer used internally) */
  onTitleChange?: (title: string) => void;
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
    } else if (f.type === "object_array") {
      // Initialize as empty array to avoid read-only property errors
      defaults[f.name] = [];
    } else {
      defaults[f.name] = "";
    }
  });
  return defaults;
}

function DataSourceForm({
  onClose,
  onSubmit,
  dataSource,
  connectorTypes = [],
  errorMessage,
  tabId,
  onDirtyChange,
}: DataSourceFormProps) {
  // Fetch connector schema when the type changes
  const [schema, setSchema] = useState<ConnectorSchemaResponse | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // Decrypt functionality states
  const [decryptedValues, setDecryptedValues] = useState<
    Record<string, string>
  >({});
  const [decryptingFields, setDecryptingFields] = useState<
    Record<string, boolean>
  >({});
  const [showDecryptedFields, setShowDecryptedFields] = useState<
    Record<string, boolean>
  >({});
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  // Avoid subscribing to draft changes to prevent re-renders on every keystroke
  const draftRef = useRef<Record<string, any> | undefined>(
    tabId ? useDataSourceStore.getState().drafts[tabId]?.values : undefined,
  );
  // Update snapshot if tabId changes
  useEffect(() => {
    if (tabId) {
      draftRef.current = useDataSourceStore.getState().drafts[tabId]?.values;
    }
  }, [tabId]);

  // React Hook Form setup
  const defaultValues = useMemo(() => {
    let base: Record<string, any>;
    if (dataSource) {
      base = {
        name: dataSource.name || "",
        description: dataSource.description || "",
        type: dataSource.type || "",
        isActive: dataSource.isActive ?? true,
        ...dataSource.config,
        settings_sync_batch_size: dataSource.settings?.sync_batch_size ?? 100,
        settings_rate_limit_delay_ms:
          dataSource.settings?.rate_limit_delay_ms ?? 200,
        settings_max_retries: dataSource.settings?.max_retries ?? 3,
        settings_timeout_ms: dataSource.settings?.timeout_ms ?? 30000,
      };
    } else {
      base = {
        name: "",
        description: "",
        type: "",
        isActive: true,
      };
    }

    // If we have a persisted draft for this tab, merge it over base
    if (draftRef.current) {
      base = { ...base, ...draftRef.current };
    }

    // Deep clone to ensure all values (including nested arrays) are mutable
    // This is necessary because values from Immer stores are frozen/immutable
    const deepClone = (obj: any): any => {
      if (obj === null || typeof obj !== "object") return obj;
      if (obj instanceof Date) return new Date(obj);
      if (Array.isArray(obj)) {
        return obj.map(item => deepClone(item));
      }
      const cloned: Record<string, any> = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          cloned[key] = deepClone(obj[key]);
        }
      }
      return cloned;
    };

    return deepClone(base);
  }, [dataSource]);

  const form = useForm({
    defaultValues,
    // Ensure arrays are mutable
    mode: "onChange",
    // Disable automatic unregister to prevent issues with dynamic fields
    shouldUnregister: false,
  });

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty },
  } = form;

  // Watch selected connector type
  const selectedType = watch("type");

  // Removed automatic reset on every defaultValues change to avoid update loops.
  // If the dataSource prop itself changes (switching from new to edit mode), we manually reset.
  useEffect(() => {
    if (dataSource) {
      // Deep clone defaultValues to ensure arrays are mutable
      const mutableDefaults = JSON.parse(JSON.stringify(defaultValues));
      reset(mutableDefaults);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource?._id]);

  const { schemas, fetchSchema } = useConnectorCatalogStore();

  // Fetch schema when connector type changes using cache
  useEffect(() => {
    if (!selectedType) {
      setSchema(null);
      return;
    }
    if (schemas[selectedType]) {
      setSchema(schemas[selectedType]);
      // When schema is set, ensure all array fields are initialized
      const currentValues = form.getValues();
      schemas[selectedType].fields.forEach((field: any) => {
        if (field.type === "object_array" && !currentValues[field.name]) {
          form.setValue(field.name, []);
        }
      });
      return;
    }
    setSchemaLoading(true);
    setSchemaError(null);
    fetchSchema(selectedType).then(res => {
      if (res) {
        setSchema(res);
        const defaults = generateDefaultValues(res);
        Object.entries(defaults).forEach(([key, value]) => {
          if (form.getValues(key as any) === undefined) {
            // Ensure arrays are mutable when setting values
            const mutableValue = Array.isArray(value) ? [...value] : value;
            form.setValue(key as any, mutableValue);
          }
        });
      } else {
        setSchemaError("Failed to load connector schema");
      }
      setSchemaLoading(false);
    });
  }, [selectedType, schemas, fetchSchema, form]);

  // Decrypt value function
  const decryptValue = async (fieldName: string, encryptedValue: string) => {
    if (!encryptedValue) {
      setSnackbarMessage("No value to decrypt");
      return;
    }

    setDecryptingFields(prev => ({ ...prev, [fieldName]: true }));

    try {
      // Get workspace ID from the form or dataSource
      const workspaceId = dataSource?.workspaceId || "default";

      const response = await fetch(
        `/api/workspaces/${workspaceId}/sources/decrypt`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ encryptedValue }),
        },
      );

      const result = await response.json();

      if (result.success) {
        setDecryptedValues(prev => ({
          ...prev,
          [fieldName]: result.data.decryptedValue,
        }));
        setShowDecryptedFields(prev => ({
          ...prev,
          [fieldName]: true,
        }));

        if (!result.data.wasEncrypted) {
          setSnackbarMessage("Value was not encrypted");
        }
      } else {
        setSnackbarMessage(result.error || "Failed to decrypt value");
      }
    } catch (error) {
      console.error("Decrypt error:", error);
      setSnackbarMessage("Failed to decrypt value");
    } finally {
      setDecryptingFields(prev => ({ ...prev, [fieldName]: false }));
    }
  };

  // Toggle decrypted value visibility
  const toggleDecryptedVisibility = (fieldName: string) => {
    setShowDecryptedFields(prev => ({
      ...prev,
      [fieldName]: !prev[fieldName],
    }));
  };

  /** Submit handler */
  const onSubmitInternal = (values: Record<string, any>) => {
    const { dirtyFields } = form.formState;

    // For new data sources, send all fields
    const isNewDataSource = !dataSource;

    // Helper function to check if a field or any of its nested fields are dirty
    const isFieldDirty = (fieldName: string): boolean => {
      // Direct field check
      if ((dirtyFields as any)[fieldName]) return true;

      // Check for nested/array fields (e.g., queries.0.name)
      const fieldPrefix = fieldName + ".";
      return Object.keys(dirtyFields).some(key => key.startsWith(fieldPrefix));
    };

    // Build payload with only changed fields
    const payload: any = {};

    // Always include type for new data sources
    if (isNewDataSource || dirtyFields.type) {
      payload.type = values.type;
    }

    // Include top-level fields only if they're dirty or it's a new data source
    if (isNewDataSource || dirtyFields.name) {
      payload.name = values.name;
    }
    if (isNewDataSource || dirtyFields.description) {
      payload.description = values.description;
    }
    if (isNewDataSource || dirtyFields.isActive) {
      payload.isActive = values.isActive;
    }

    // Build config from schema fields - only include dirty fields
    const config: Record<string, any> = {};
    let hasConfigChanges = false;

    if (schema) {
      schema.fields.forEach(f => {
        // Check if this config field is dirty (including nested fields)
        if (isNewDataSource || isFieldDirty(f.name)) {
          config[f.name] = values[f.name];
          hasConfigChanges = true;
        }
      });
    }

    // Only include config if there are changes
    if (hasConfigChanges) {
      payload.config = config;
    }

    // Handle settings - check each setting field individually
    const settings: any = {};
    let hasSettingsChanges = false;

    const settingsFields = [
      "settings_sync_batch_size",
      "settings_rate_limit_delay_ms",
      "settings_max_retries",
      "settings_timeout_ms",
    ];

    settingsFields.forEach(field => {
      if (isNewDataSource || (dirtyFields as any)[field]) {
        const key = field.replace("settings_", "");
        settings[key] =
          Number(values[field]) ||
          (field === "settings_sync_batch_size"
            ? 100
            : field === "settings_rate_limit_delay_ms"
              ? 200
              : field === "settings_max_retries"
                ? 3
                : 30000);
        hasSettingsChanges = true;
      }
    });

    // Only include settings if there are changes
    if (hasSettingsChanges) {
      payload.settings = settings;
    }

    // For updates, ensure we're sending at least something
    if (!isNewDataSource && Object.keys(payload).length === 0) {
      console.log("No changes detected in form");
      return;
    }

    onSubmit(payload);
  };

  /** Renders a single dynamic config field */
  const renderDynamicField = (
    field: ConnectorFieldSchema,
    form: UseFormReturn<any>,
  ) => {
    const { control } = form;
    const {
      name,
      label,
      type,
      required,
      helperText,
      placeholder,
      options,
      rows,
      encrypted,
    } = field;
    const fieldType = type === "password" ? "password" : "text";

    // Determine if field should have decrypt button
    const shouldShowDecrypt = encrypted === true || type === "password";

    const isNested = name.includes(".");

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
            <FormControl fullWidth margin="normal" variant="standard">
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

    if (type === "textarea") {
      return (
        <Box key={name} position="relative">
          <Controller
            name={name}
            control={control}
            rules={{ required }}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                fullWidth
                margin="normal"
                multiline
                rows={rows ?? 8}
                label={label}
                placeholder={placeholder}
                error={!!fieldState.error}
                helperText={
                  fieldState.error ? "This field is required" : helperText
                }
                type={showDecryptedFields[name] ? "text" : fieldType}
                value={
                  showDecryptedFields[name] && decryptedValues[name]
                    ? decryptedValues[name]
                    : field.value
                }
                autoComplete="false"
                name={`config_${name}`}
                slotProps={{
                  input: {
                    autoComplete: "false",
                    style: { fontFamily: "monospace", fontSize: "0.875rem" },
                    ...(isNested
                      ? {}
                      : {
                          readOnly: true,
                          onFocus: (e: any) => {
                            setTimeout(() => {
                              e.target.removeAttribute("readonly");
                            }, 100);
                          },
                        }),
                    endAdornment: shouldShowDecrypt && field.value && (
                      <Box sx={{ display: "flex", gap: 0.5, mr: 1 }}>
                        <Tooltip
                          title={
                            showDecryptedFields[name]
                              ? "Hide decrypted"
                              : "Show decrypted"
                          }
                        >
                          <IconButton
                            size="small"
                            onClick={() => {
                              if (
                                !decryptedValues[name] &&
                                !showDecryptedFields[name]
                              ) {
                                decryptValue(name, field.value);
                              } else {
                                toggleDecryptedVisibility(name);
                              }
                            }}
                            disabled={decryptingFields[name]}
                          >
                            {decryptingFields[name] ? (
                              <CircularProgress size={20} />
                            ) : showDecryptedFields[name] ? (
                              <VisibilityOff />
                            ) : (
                              <Visibility />
                            )}
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ),
                  },
                }}
              />
            )}
          />
        </Box>
      );
    }

    // Special handling for object_array
    if (field.type === "object_array") {
      return <ObjectArrayField key={field.name} field={field} form={form} />;
    }

    // Default: TextField
    return (
      <Box key={name} position="relative">
        <Controller
          name={name}
          control={control}
          rules={{ required }}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              fullWidth
              margin="normal"
              type={showDecryptedFields[name] ? "text" : fieldType}
              value={
                showDecryptedFields[name] && decryptedValues[name]
                  ? decryptedValues[name]
                  : field.value
              }
              label={label}
              placeholder={placeholder}
              error={!!fieldState.error}
              helperText={
                fieldState.error ? "This field is required" : helperText
              }
              name={`config_${name}`}
              slotProps={{
                input: {
                  endAdornment: shouldShowDecrypt && field.value && (
                    <Box sx={{ display: "flex", gap: 0.5, mr: 1 }}>
                      <Tooltip
                        title={
                          showDecryptedFields[name]
                            ? "Hide decrypted"
                            : "Show decrypted"
                        }
                      >
                        <IconButton
                          size="small"
                          onClick={() => {
                            if (
                              !decryptedValues[name] &&
                              !showDecryptedFields[name]
                            ) {
                              decryptValue(name, field.value);
                            } else {
                              toggleDecryptedVisibility(name);
                            }
                          }}
                          disabled={decryptingFields[name]}
                        >
                          {decryptingFields[name] ? (
                            <CircularProgress size={20} />
                          ) : showDecryptedFields[name] ? (
                            <VisibilityOff />
                          ) : (
                            <Visibility />
                          )}
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ),
                },
              }}
            />
          )}
        />
      </Box>
    );
  };

  /** Component to render an array of objects (e.g., GraphQL queries list) */
  const ObjectArrayField = ({
    field,
    form,
  }: {
    field: ConnectorFieldSchema;
    form: UseFormReturn<any>;
  }) => {
    const { control } = form;

    // Initialise field array hook
    const {
      fields: arrayFields,
      append,
      remove,
    } = useFieldArray({ control, name: field.name as any });

    // Helper: create a new item populated with sensible defaults
    const createNewItem = () => {
      const newItem: Record<string, any> = {};
      field.itemFields?.forEach(subField => {
        if (subField.default !== undefined) {
          newItem[subField.name] = subField.default;
        } else if (subField.type === "boolean") {
          newItem[subField.name] = false;
        } else {
          newItem[subField.name] = "";
        }
      });
      return newItem;
    };

    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle1" fontWeight="medium" sx={{ mb: 1 }}>
          {field.label}
        </Typography>

        {arrayFields.map((item, index) => (
          <Box
            key={item.id}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              p: 2,
              mb: 2,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", mb: 1, gap: 1 }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                {field.label} {index + 1}
              </Typography>
              <IconButton
                size="small"
                color="error"
                onClick={() => remove(index)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>

            {field.itemFields?.map(subField => {
              const fieldPath = `${field.name}.${index}.${subField.name}`;

              const registerProps = form.register(fieldPath);

              const commonTextProps = {
                fullWidth: true,
                margin: "normal" as const,
                label: subField.label,
                placeholder: subField.placeholder,
                helperText: subField.helperText,
                defaultValue: (item as any)[subField.name] || "",
              };

              if (subField.type === "textarea") {
                return (
                  <TextField
                    key={fieldPath}
                    {...commonTextProps}
                    multiline
                    rows={subField.rows ?? 4}
                    inputRef={registerProps.ref}
                    name={registerProps.name}
                    onChange={registerProps.onChange}
                  />
                );
              }

              // Boolean switch (controlled minimal impact)
              if (subField.type === "boolean") {
                return (
                  <FormControlLabel
                    key={fieldPath}
                    control={
                      <Switch
                        checked={(item as any)[subField.name] || false}
                        onChange={e =>
                          form.setValue(fieldPath, e.target.checked, {
                            shouldDirty: true,
                          })
                        }
                      />
                    }
                    label={subField.label}
                  />
                );
              }

              return (
                <TextField
                  key={fieldPath}
                  {...commonTextProps}
                  type={subField.type === "number" ? "number" : "text"}
                  inputRef={registerProps.ref}
                  name={registerProps.name}
                  onChange={registerProps.onChange}
                />
              );
            })}
          </Box>
        ))}

        <Button
          variant="outlined"
          size="small"
          onClick={() => append(createNewItem())}
        >
          Add Query
        </Button>
      </Box>
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
          <Select {...field} variant="outlined" size="small">
            {connectorTypes.map(connector => (
              <MenuItem key={connector.type} value={connector.type}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box
                    component="img"
                    src={`/api/connectors/${connector.type}/icon.svg`}
                    alt={`${connector.type} icon`}
                    sx={{ width: 20, height: 20 }}
                  />
                  {connector.name}
                </Box>
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
            name="datasource_title"
          />
        )}
      />
    </Box>
  );

  const connectionConfigSection = (
    <>
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
    </>
  );

  const advancedSettingsSection = (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
        gap: 2,
      }}
    >
      <Box>
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
            />
          )}
        />
      </Box>
      <Box>
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
            />
          )}
        />
      </Box>
      <Box>
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
            />
          )}
        />
      </Box>
      <Box>
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
              inputProps={{
                min: 1000,
                autoComplete: "nope",
                "data-lpignore": "true",
                "data-form-type": "other",
              }}
              autoComplete="nope"
            />
          )}
        />
      </Box>
    </Box>
  );

  // --------------------------------------------------------------------
  // Variant rendering (inline vs dialog)
  // --------------------------------------------------------------------

  const formContent = (
    <Box sx={{ py: 1 }}>
      {/* CSS to disable autocomplete dropdown */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
          input:-webkit-autofill,
          input:-webkit-autofill:hover,
          input:-webkit-autofill:focus,
          input:-webkit-autofill:active {
            -webkit-box-shadow: 0 0 0 30px white inset !important;
            transition: background-color 5000s ease-in-out 0s;
          }
          input[readonly] {
            background-color: transparent !important;
          }
        `,
        }}
      />

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
          {/* Display selected connector icon and name */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              mb: 2,
              mt: 2,
              p: 2,
              bgcolor: "action.hover",
              borderRadius: 1,
            }}
          >
            <Box
              component="img"
              src={`/api/connectors/${selectedType}/icon.svg`}
              alt={`${selectedType} icon`}
              sx={{ width: 32, height: 32 }}
            />
            <Box>
              <Typography variant="subtitle1" fontWeight="medium">
                {connectorTypes.find(c => c.type === selectedType)?.name ||
                  selectedType}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {connectorTypes.find(c => c.type === selectedType)?.description}
              </Typography>
            </Box>
          </Box>

          {basicInformationSection}
          {connectionConfigSection}
          {advancedSettingsSection}
          <Box
            sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 2 }}
          >
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="contained" disableElevation>
              {dataSource ? "Update" : "Create"}
            </Button>
          </Box>
        </>
      )}
    </Box>
  );

  // bubble dirty state to parent
  const lastDirty = useRef<boolean>(false);
  useEffect(() => {
    if (onDirtyChange && lastDirty.current !== isDirty) {
      lastDirty.current = isDirty;
      onDirtyChange(isDirty);
    }
  }, [isDirty, onDirtyChange]);

  return (
    <Box
      component="form"
      autoComplete="nope"
      noValidate
      onSubmit={handleSubmit(onSubmitInternal)}
      sx={{ p: 2, maxWidth: "800px", mx: "auto" }}
      data-form-type="other"
    >
      {/* Form fields */}
      {formContent}

      {/* Snackbar for messages */}
      <Snackbar
        open={!!snackbarMessage}
        autoHideDuration={4000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}

export default DataSourceForm;
