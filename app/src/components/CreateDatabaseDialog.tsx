import React, { useState, useEffect } from "react";
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
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("");
  const [connection, setConnection] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setType("");
    setConnection({});
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name || !type) {
      setError("Name and database type are required");
      return;
    }
    if (!currentWorkspace) {
      setError("No workspace selected");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await apiClient.post<{
        success: boolean;
        data: any;
        message?: string;
      }>(`/workspaces/${currentWorkspace.id}/databases`, {
        name,
        type,
        connection,
      });

      if (!data.success) {
        throw new Error((data as any).error || "Failed to create database");
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
    fetchTypes().catch(() => undefined);
  }, [fetchTypes]);

  const handleTypeChange = async (newType: string) => {
    setType(newType);
    const schema = schemas[newType] || (await fetchSchema(newType));
    const defaults: Record<string, any> = {};
    if (schema?.fields) {
      schema.fields.forEach(f => {
        if (f.default !== undefined) defaults[f.name] = f.default;
        else if (f.type === "boolean") defaults[f.name] = false;
        else defaults[f.name] = "";
      });
    }
    setConnection(defaults);
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
            value={name}
            onChange={e => setName(e.target.value)}
            margin="normal"
            required
            placeholder="My Database"
          />

          <FormControl fullWidth margin="normal" required>
            <InputLabel>Database Type</InputLabel>
            <Select
              value={type}
              label="Database Type"
              onChange={e => handleTypeChange(e.target.value)}
            >
              {(dbTypes || []).map(t => (
                <MenuItem key={t.type} value={t.type}>
                  {t.displayName || t.type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Dynamic schema-driven form */}
          {type && schemas[type]?.fields && (
            <>
              {schemas[type].fields.map(field => {
                const value = connection[field.name] ?? "";
                const onChangeString = (v: string) =>
                  setConnection(prev => ({ ...prev, [field.name]: v }));
                const onChangeBool = (v: boolean) =>
                  setConnection(prev => ({ ...prev, [field.name]: v }));
                const onChangeNum = (v: string) =>
                  setConnection(prev => ({
                    ...prev,
                    [field.name]: v ? Number(v) : undefined,
                  }));
                switch (field.type) {
                  case "boolean":
                    return (
                      <FormControl key={field.name} fullWidth margin="normal">
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                          <Typography sx={{ mr: 2 }}>{field.label}</Typography>
                          <input
                            type="checkbox"
                            checked={Boolean(value)}
                            onChange={e => onChangeBool(e.target.checked)}
                          />
                        </Box>
                        {field.helperText && (
                          <Typography variant="caption" color="text.secondary">
                            {field.helperText}
                          </Typography>
                        )}
                      </FormControl>
                    );
                  case "textarea":
                    return (
                      <TextField
                        key={field.name}
                        fullWidth
                        label={field.label}
                        value={value}
                        onChange={e => onChangeString(e.target.value)}
                        margin="normal"
                        required={field.required}
                        placeholder={field.placeholder}
                        helperText={field.helperText}
                        multiline
                        rows={field.rows || 3}
                      />
                    );
                  case "password":
                    return (
                      <TextField
                        key={field.name}
                        fullWidth
                        type="password"
                        label={field.label}
                        value={value}
                        onChange={e => onChangeString(e.target.value)}
                        margin="normal"
                        required={field.required}
                        placeholder={field.placeholder}
                        helperText={field.helperText}
                      />
                    );
                  case "number":
                    return (
                      <TextField
                        key={field.name}
                        fullWidth
                        type="number"
                        label={field.label}
                        value={value}
                        onChange={e => onChangeNum(e.target.value)}
                        margin="normal"
                        required={field.required}
                        placeholder={field.placeholder}
                        helperText={field.helperText}
                      />
                    );
                  case "select":
                    return (
                      <FormControl
                        key={field.name}
                        fullWidth
                        margin="normal"
                        required={field.required}
                      >
                        <InputLabel>{field.label}</InputLabel>
                        <Select
                          value={value}
                          label={field.label}
                          onChange={e => onChangeString(String(e.target.value))}
                        >
                          {(field.options || []).map(opt => (
                            <MenuItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    );
                  case "string":
                  default:
                    return (
                      <TextField
                        key={field.name}
                        fullWidth
                        label={field.label}
                        value={value}
                        onChange={e => onChangeString(e.target.value)}
                        margin="normal"
                        required={field.required}
                        placeholder={field.placeholder}
                        helperText={field.helperText}
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
          onClick={handleSubmit}
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
