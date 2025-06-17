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
  Divider,
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

  // ---------------- Draft store integration ----------------
  const draft = useDataSourceStore(state =>
    tabId ? state.drafts[tabId] : undefined,
  );
  const upsertDraft = useDataSourceStore(state => state.upsertDraft);

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
    if (draft?.values) {
      base = { ...base, ...draft.values };
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
  }, [dataSource, draft]);

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

  // Persist every form change into the draft store (debounced by RHF internally)
  useEffect(() => {
    if (!tabId) return;
    const lastJsonRef = { current: "" } as { current: string };
    const subscription = form.watch(values => {
      const json = JSON.stringify(values);
      if (json === lastJsonRef.current) return;
      lastJsonRef.current = json;
      // Deep clone values to ensure draft store doesn't freeze the arrays
      const clonedValues = JSON.parse(JSON.stringify(values));
      upsertDraft(tabId, clonedValues as Record<string, any>);
    });
    return () => subscription.unsubscribe();
  }, [form, tabId, upsertDraft]);

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
                autoComplete="nope"
                name={`config_${name}`}
                inputProps={{
                  autoComplete: "nope",
                  "data-lpignore": "true",
                  "data-form-type": "other",
                  "aria-autocomplete": "none",
                  style: { fontFamily: "monospace", fontSize: "0.875rem" },
                }}
                InputProps={{
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
              autoComplete="nope"
              name={`config_${name}`}
              inputProps={{
                autoComplete: "nope",
                "data-lpignore": "true",
                "data-form-type": "other",
                "aria-autocomplete": "none",
                readOnly: true,
                onFocus: (e: any) => {
                  setTimeout(() => {
                    e.target.removeAttribute("readonly");
                  }, 100);
                },
              }}
              InputProps={{
                endAdornment: shouldShowDecrypt && field.value && (
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
                ),
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
    const { control, setValue, getValues, watch } = form;

    // Watch the array value
    const arrayValue = watch(field.name) || [];

    // Custom append function that ensures mutable arrays
    const customAppend = (newItem: any) => {
      const currentArray = getValues(field.name) || [];
      // Create a completely new mutable array
      const newArray = JSON.parse(JSON.stringify([...currentArray, newItem]));
      setValue(field.name, newArray, { shouldDirty: true });
    };

    // Custom remove function
    const customRemove = (index: number) => {
      const currentArray = getValues(field.name) || [];
      const newArray = currentArray.filter((_: any, i: number) => i !== index);
      setValue(field.name, JSON.parse(JSON.stringify(newArray)), {
        shouldDirty: true,
      });
    };

    // Create a new item with all fields initialized
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

        {arrayValue.map((item: any, index: number) => (
          <Box
            key={`${field.name}-${index}`}
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
                onClick={() => customRemove(index)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>

            {field.itemFields?.map(subField => {
              const fieldPath = `${field.name}.${index}.${subField.name}`;
              const fieldValue = item[subField.name] || "";

              // Custom onChange handler that updates the entire array
              const handleChange = (newValue: any) => {
                const currentArray = getValues(field.name) || [];
                const updatedArray = [...currentArray];
                if (!updatedArray[index]) {
                  updatedArray[index] = {};
                }
                updatedArray[index] = {
                  ...updatedArray[index],
                  [subField.name]: newValue,
                };
                // Deep clone to ensure mutability
                setValue(field.name, JSON.parse(JSON.stringify(updatedArray)), {
                  shouldDirty: true,
                });
              };

              if (subField.type === "boolean") {
                return (
                  <FormControlLabel
                    key={fieldPath}
                    control={
                      <Switch
                        checked={fieldValue || false}
                        onChange={e => handleChange(e.target.checked)}
                      />
                    }
                    label={subField.label}
                  />
                );
              }

              if (subField.type === "textarea") {
                return (
                  <TextField
                    key={fieldPath}
                    fullWidth
                    margin="normal"
                    multiline
                    rows={subField.rows ?? 8}
                    label={subField.label}
                    placeholder={subField.placeholder}
                    value={fieldValue}
                    onChange={e => handleChange(e.target.value)}
                    helperText={subField.helperText}
                  />
                );
              }

              // Default: TextField
              return (
                <TextField
                  key={fieldPath}
                  fullWidth
                  margin="normal"
                  label={subField.label}
                  placeholder={subField.placeholder}
                  value={fieldValue}
                  onChange={e => handleChange(e.target.value)}
                  type={subField.type === "number" ? "number" : "text"}
                  helperText={subField.helperText}
                />
              );
            })}
          </Box>
        ))}

        <Button
          variant="outlined"
          size="small"
          onClick={() => customAppend(createNewItem())}
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
            autoComplete="nope"
            name="datasource_title"
            inputProps={{
              autoComplete: "nope",
              "data-lpignore": "true",
              "data-form-type": "other",
              "aria-autocomplete": "none",
              readOnly: true,
              onFocus: (e: any) => {
                setTimeout(() => {
                  e.target.removeAttribute("readonly");
                }, 100);
              },
            }}
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
              inputProps={{
                min: 1,
                autoComplete: "nope",
                "data-lpignore": "true",
                "data-form-type": "other",
              }}
              autoComplete="nope"
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
              inputProps={{
                min: 0,
                autoComplete: "nope",
                "data-lpignore": "true",
                "data-form-type": "other",
              }}
              autoComplete="nope"
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
              inputProps={{
                min: 0,
                autoComplete: "nope",
                "data-lpignore": "true",
                "data-form-type": "other",
              }}
              autoComplete="nope"
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

      {/* Hidden fields to prevent autocomplete */}
      <input type="text" style={{ display: "none" }} autoComplete="nope" />
      <input type="password" style={{ display: "none" }} autoComplete="nope" />
      <input type="email" style={{ display: "none" }} autoComplete="nope" />
      <input
        type="text"
        name="fakeusernameremembered"
        style={{ display: "none" }}
        autoComplete="nope"
      />
      <input
        type="password"
        name="fakepasswordremembered"
        style={{ display: "none" }}
        autoComplete="nope"
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
