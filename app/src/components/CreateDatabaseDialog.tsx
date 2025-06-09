import React, { useState } from "react";
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControlLabel,
  Switch,
} from "@mui/material";
import { ExpandMore as ExpandMoreIcon } from "@mui/icons-material";
import { useWorkspace } from "../contexts/workspace-context";

interface CreateDatabaseDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface DatabaseConnection {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  connectionString?: string;
  authSource?: string;
  replicaSet?: string;
  ssl?: boolean;
}

const CreateDatabaseDialog: React.FC<CreateDatabaseDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const { currentWorkspace } = useWorkspace();
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("");
  const [connection, setConnection] = useState<DatabaseConnection>({
    ssl: false,
  });
  const [useConnectionString, setUseConnectionString] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setType("");
    setConnection({
      ssl: false,
    });
    setUseConnectionString(false);
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

    if (!useConnectionString) {
      if (!connection.host || !connection.database) {
        setError("Host and database name are required");
        return;
      }
    } else {
      if (!connection.connectionString) {
        setError("Connection string is required");
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/workspaces/${currentWorkspace.id}/databases`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            type,
            connection: useConnectionString
              ? { connectionString: connection.connectionString }
              : connection,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create database");
      }

      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  const getDefaultPort = (dbType: string): number => {
    switch (dbType) {
      case "mongodb":
        return 27017;
      case "postgresql":
        return 5432;
      case "mysql":
        return 3306;
      case "mssql":
        return 1433;
      case "sqlite":
        return 0;
      default:
        return 0;
    }
  };

  const handleTypeChange = (newType: string) => {
    setType(newType);
    setConnection((prev) => ({
      ...prev,
      port: getDefaultPort(newType),
    }));
    setUseConnectionString(newType === "mongodb");
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
            onChange={(e) => setName(e.target.value)}
            margin="normal"
            required
            placeholder="My Database"
          />

          <FormControl fullWidth margin="normal" required>
            <InputLabel>Database Type</InputLabel>
            <Select
              value={type}
              label="Database Type"
              onChange={(e) => handleTypeChange(e.target.value)}
            >
              <MenuItem value="mongodb">MongoDB</MenuItem>
              <MenuItem value="postgresql">PostgreSQL</MenuItem>
              <MenuItem value="mysql">MySQL</MenuItem>
              <MenuItem value="sqlite">SQLite</MenuItem>
              <MenuItem value="mssql">SQL Server</MenuItem>
            </Select>
          </FormControl>

          {type && type !== "sqlite" && (
            <>
              {type === "mongodb" && (
                <Box sx={{ mt: 2 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={useConnectionString}
                        onChange={(e) =>
                          setUseConnectionString(e.target.checked)
                        }
                      />
                    }
                    label="Use Connection String"
                  />
                  <Typography
                    variant="caption"
                    display="block"
                    color="text.secondary"
                  >
                    Recommended for MongoDB Atlas or replica sets
                  </Typography>
                </Box>
              )}

              {useConnectionString ? (
                <TextField
                  fullWidth
                  label="Connection String"
                  value={connection.connectionString || ""}
                  onChange={(e) =>
                    setConnection((prev) => ({
                      ...prev,
                      connectionString: e.target.value,
                    }))
                  }
                  margin="normal"
                  required
                  placeholder="mongodb+srv://username:password@cluster.mongodb.net/database"
                  multiline
                  rows={2}
                />
              ) : (
                <>
                  <TextField
                    fullWidth
                    label="Host"
                    value={connection.host || ""}
                    onChange={(e) =>
                      setConnection((prev) => ({
                        ...prev,
                        host: e.target.value,
                      }))
                    }
                    margin="normal"
                    required
                    placeholder="localhost"
                  />

                  <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
                    <TextField
                      label="Port"
                      type="number"
                      value={connection.port || ""}
                      onChange={(e) =>
                        setConnection((prev) => ({
                          ...prev,
                          port: parseInt(e.target.value) || undefined,
                        }))
                      }
                      sx={{ width: "30%" }}
                      placeholder={getDefaultPort(type).toString()}
                    />

                    <TextField
                      fullWidth
                      label="Database Name"
                      value={connection.database || ""}
                      onChange={(e) =>
                        setConnection((prev) => ({
                          ...prev,
                          database: e.target.value,
                        }))
                      }
                      required
                      placeholder="myapp"
                    />
                  </Box>

                  <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
                    <TextField
                      fullWidth
                      label="Username"
                      value={connection.username || ""}
                      onChange={(e) =>
                        setConnection((prev) => ({
                          ...prev,
                          username: e.target.value,
                        }))
                      }
                      placeholder="admin"
                    />

                    <TextField
                      fullWidth
                      label="Password"
                      type="password"
                      value={connection.password || ""}
                      onChange={(e) =>
                        setConnection((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      placeholder="••••••••"
                    />
                  </Box>
                </>
              )}

              {/* Advanced Options */}
              <Accordion sx={{ mt: 2 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Advanced Options</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={connection.ssl || false}
                          onChange={(e) =>
                            setConnection((prev) => ({
                              ...prev,
                              ssl: e.target.checked,
                            }))
                          }
                        />
                      }
                      label="Use SSL/TLS"
                    />

                    {type === "mongodb" && !useConnectionString && (
                      <>
                        <TextField
                          fullWidth
                          label="Auth Source"
                          value={connection.authSource || ""}
                          onChange={(e) =>
                            setConnection((prev) => ({
                              ...prev,
                              authSource: e.target.value,
                            }))
                          }
                          margin="normal"
                          placeholder="admin"
                        />

                        <TextField
                          fullWidth
                          label="Replica Set"
                          value={connection.replicaSet || ""}
                          onChange={(e) =>
                            setConnection((prev) => ({
                              ...prev,
                              replicaSet: e.target.value,
                            }))
                          }
                          margin="normal"
                          placeholder="rs0"
                        />
                      </>
                    )}
                  </Box>
                </AccordionDetails>
              </Accordion>
            </>
          )}

          {type === "sqlite" && (
            <TextField
              fullWidth
              label="Database File Path"
              value={connection.database || ""}
              onChange={(e) =>
                setConnection((prev) => ({
                  ...prev,
                  database: e.target.value,
                }))
              }
              margin="normal"
              required
              placeholder="/path/to/database.db"
            />
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
