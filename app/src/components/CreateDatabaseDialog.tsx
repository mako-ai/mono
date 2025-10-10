import React, { useEffect } from "react";
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
  Alert,
  CircularProgress,
  Typography,
} from "@mui/material";
import { useWorkspace } from "../contexts/workspace-context";
import { apiClient } from "../lib/api-client";
import { useDatabaseCatalogStore } from "../store/databaseCatalogStore";
import { useForm, Controller } from "react-hook-form";

interface CreateDatabaseDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CreateDatabaseDialog: React.FC<CreateDatabaseDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const { currentWorkspace } = useWorkspace();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  type FormValues = {
    name: string;
    type: string;
    connection: Record<string, any>;
  };

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { name: "", type: "", connection: {} },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const handleClose = () => {
    reset({ name: "", type: "", connection: {} });
    setError(null);
    onClose();
  };

  const onSubmit = async (values: FormValues) => {
    if (!currentWorkspace) {
      setError("No workspace selected");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<{
        success: boolean;
        data: any;
        message?: string;
      }>(`/workspaces/${currentWorkspace.id}/databases`, values);
      if (!res.success) {
        throw new Error((res as any).error || "Failed to create database");
      }
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  const {
    fetchTypes,
    fetchSchema,
    types: dbTypes,
    schemas,
  } = useDatabaseCatalogStore();

  useEffect(() => {
    if (open) {
      fetchTypes(true).catch(() => undefined);
    }
  }, [fetchTypes, open]);

  const selectedType = watch("type");

  const handleTypeChange = async (newType: string) => {
    setValue("type", newType, { shouldValidate: true, shouldDirty: true });
    const schema = schemas[newType] || (await fetchSchema(newType));
    const defaults: Record<string, any> = {};
    if (schema?.fields) {
      schema.fields.forEach(f => {
        if (f.default !== undefined) defaults[f.name] = f.default;
        else if (f.type === "boolean") defaults[f.name] = false;
        else defaults[f.name] = "";
      });
    }
    reset(prev => ({ ...prev, type: newType, connection: defaults }));
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Database Connection</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <TextField
            fullWidth
            label="Database Name"
            {...register("name", { required: "Name is required" })}
            margin="normal"
            required
            placeholder="My Database"
            error={Boolean(errors.name)}
            helperText={errors.name?.message as string}
          />

          <FormControl fullWidth margin="normal" required>
            <InputLabel>Database Type</InputLabel>
            {/* Hidden input to register 'type' as required for validation */}
            <input
              type="hidden"
              {...register("type", { required: "Database type is required" })}
            />
            <Select
              value={selectedType || ""}
              label="Database Type"
              onChange={e => handleTypeChange(String(e.target.value))}
              error={Boolean(errors.type)}
            >
              {(dbTypes || []).map(t => (
                <MenuItem key={t.type} value={t.type}>
                  {t.displayName || t.type}
                </MenuItem>
              ))}
            </Select>
            {errors.type && (
              <Typography variant="caption" color="error">
                {(errors.type.message as string) || "Database type is required"}
              </Typography>
            )}
          </FormControl>

          {/* Dynamic schema-driven form */}
          {selectedType && schemas[selectedType]?.fields && (
            <>
              {schemas[selectedType].fields.map(field => {
                const fieldName = `connection.${field.name}` as const;
                const requiredRule = field.required
                  ? { required: `${field.label} is required` }
                  : {};
                const fieldError =
                  ((errors.connection as any)?.[field.name]
                    ?.message as string) || undefined;
                switch (field.type) {
                  case "boolean":
                    return (
                      <FormControl key={field.name} fullWidth margin="normal">
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                          <Typography sx={{ mr: 2 }}>{field.label}</Typography>
                          <Controller
                            control={control}
                            name={fieldName as any}
                            rules={requiredRule}
                            render={({ field: ctrlField, fieldState }) => (
                              <input
                                type="checkbox"
                                checked={Boolean(ctrlField.value)}
                                onChange={e =>
                                  ctrlField.onChange(e.target.checked)
                                }
                                aria-invalid={
                                  fieldState.error ? "true" : "false"
                                }
                              />
                            )}
                          />
                        </Box>
                        {fieldError ? (
                          <Typography variant="caption" color="error">
                            {fieldError}
                          </Typography>
                        ) : (
                          field.helperText && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {field.helperText}
                            </Typography>
                          )
                        )}
                      </FormControl>
                    );
                  case "textarea":
                    return (
                      <TextField
                        key={field.name}
                        fullWidth
                        label={field.label}
                        margin="normal"
                        placeholder={field.placeholder}
                        multiline
                        rows={field.rows || 3}
                        {...register(fieldName as any, requiredRule)}
                        error={Boolean(fieldError)}
                        helperText={fieldError ?? field.helperText}
                      />
                    );
                  case "password":
                    return (
                      <TextField
                        key={field.name}
                        fullWidth
                        type="password"
                        label={field.label}
                        margin="normal"
                        placeholder={field.placeholder}
                        {...register(fieldName as any, requiredRule)}
                        error={Boolean(fieldError)}
                        helperText={fieldError ?? field.helperText}
                      />
                    );
                  case "number":
                    return (
                      <TextField
                        key={field.name}
                        fullWidth
                        type="number"
                        label={field.label}
                        margin="normal"
                        placeholder={field.placeholder}
                        {...register(fieldName as any, {
                          ...requiredRule,
                          valueAsNumber: true,
                        })}
                        error={Boolean(fieldError)}
                        helperText={fieldError ?? field.helperText}
                      />
                    );
                  case "select":
                    return (
                      <FormControl
                        key={field.name}
                        fullWidth
                        margin="normal"
                        required={field.required}
                        error={Boolean(fieldError)}
                      >
                        <InputLabel>{field.label}</InputLabel>
                        <Controller
                          control={control}
                          name={fieldName as any}
                          rules={requiredRule}
                          render={({ field: ctrlField }) => (
                            <Select
                              label={field.label}
                              value={ctrlField.value ?? ""}
                              onChange={e =>
                                ctrlField.onChange(String(e.target.value))
                              }
                            >
                              {(field.options || []).map(opt => (
                                <MenuItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </MenuItem>
                              ))}
                            </Select>
                          )}
                        />
                        {fieldError ? (
                          <Typography variant="caption" color="error">
                            {fieldError}
                          </Typography>
                        ) : (
                          field.helperText && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {field.helperText}
                            </Typography>
                          )
                        )}
                      </FormControl>
                    );
                  case "string":
                  default:
                    return (
                      <TextField
                        key={field.name}
                        fullWidth
                        label={field.label}
                        margin="normal"
                        placeholder={field.placeholder}
                        {...register(fieldName as any, requiredRule)}
                        error={Boolean(fieldError)}
                        helperText={fieldError ?? field.helperText}
                      />
                    );
                }
              })}
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit(onSubmit)}
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : null}
        >
          {loading ? "Creating..." : "Create Database"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateDatabaseDialog;
