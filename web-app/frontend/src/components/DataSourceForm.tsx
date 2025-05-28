import { useState, useEffect } from "react";
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
} from "@mui/material";
import {
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
} from "@mui/icons-material";

interface DataSource {
  _id?: string;
  name: string;
  description?: string;
  source: string;
  enabled: boolean;
  config: {
    api_key?: string;
    api_base_url?: string;
    username?: string;
    password?: string;
    host?: string;
    port?: number;
    database?: string;
    [key: string]: any;
  };
  settings: {
    sync_batch_size: number;
    rate_limit_delay_ms: number;
    max_retries?: number;
    timeout_ms?: number;
  };
  tenant?: string;
}

interface DataSourceFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  dataSource?: DataSource | null;
}

const sourceTypes = [
  { value: "close", label: "Close CRM" },
  { value: "stripe", label: "Stripe" },
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "graphql", label: "GraphQL API" },
  { value: "rest", label: "REST API" },
  { value: "api", label: "Generic API" },
];

function DataSourceForm({
  open,
  onClose,
  onSubmit,
  dataSource,
}: DataSourceFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    source: "",
    enabled: true,
    config: {
      api_key: "",
      api_base_url: "",
      username: "",
      password: "",
      host: "",
      port: "",
      database: "",
    },
    settings: {
      sync_batch_size: 100,
      rate_limit_delay_ms: 200,
      max_retries: 3,
      timeout_ms: 30000,
    },
    tenant: "",
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (dataSource) {
      setFormData({
        name: dataSource.name || "",
        description: dataSource.description || "",
        source: dataSource.source || "",
        enabled: dataSource.enabled ?? true,
        config: {
          api_key: dataSource.config?.api_key || "",
          api_base_url: dataSource.config?.api_base_url || "",
          username: dataSource.config?.username || "",
          password: dataSource.config?.password || "",
          host: dataSource.config?.host || "",
          port: dataSource.config?.port?.toString() || "",
          database: dataSource.config?.database || "",
        },
        settings: {
          sync_batch_size: dataSource.settings?.sync_batch_size || 100,
          rate_limit_delay_ms: dataSource.settings?.rate_limit_delay_ms || 200,
          max_retries: dataSource.settings?.max_retries || 3,
          timeout_ms: dataSource.settings?.timeout_ms || 30000,
        },
        tenant: dataSource.tenant || "",
      });
    } else {
      // Reset form for new data source
      setFormData({
        name: "",
        description: "",
        source: "",
        enabled: true,
        config: {
          api_key: "",
          api_base_url: "",
          username: "",
          password: "",
          host: "",
          port: "",
          database: "",
        },
        settings: {
          sync_batch_size: 100,
          rate_limit_delay_ms: 200,
          max_retries: 3,
          timeout_ms: 30000,
        },
        tenant: "",
      });
    }
    setErrors({});
  }, [dataSource, open]);

  const handleInputChange = (field: string, value: any) => {
    if (field.startsWith("config.")) {
      const configField = field.replace("config.", "");
      setFormData((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          [configField]: value,
        },
      }));
    } else if (field.startsWith("settings.")) {
      const settingsField = field.replace("settings.", "");
      setFormData((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          [settingsField]: value,
        },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));
    }

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: "",
      }));
    }
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.source) {
      newErrors.source = "Source type is required";
    }

    // Source-specific validation
    switch (formData.source) {
      case "close":
      case "stripe":
        if (!formData.config.api_key.trim()) {
          newErrors["config.api_key"] = "API key is required";
        }
        break;
      case "postgres":
      case "mysql":
        if (!formData.config.host.trim()) {
          newErrors["config.host"] = "Host is required";
        }
        if (!formData.config.database.trim()) {
          newErrors["config.database"] = "Database name is required";
        }
        break;
      case "graphql":
      case "rest":
      case "api":
        if (!formData.config.api_base_url.trim()) {
          newErrors["config.api_base_url"] = "Base URL is required";
        }
        break;
    }

    // Settings validation
    if (formData.settings.sync_batch_size < 1) {
      newErrors["settings.sync_batch_size"] = "Batch size must be at least 1";
    }

    if (formData.settings.rate_limit_delay_ms < 0) {
      newErrors["settings.rate_limit_delay_ms"] =
        "Rate limit delay cannot be negative";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) {
      return;
    }

    // Prepare data for submission
    const submitData: any = {
      ...formData,
      config: {
        ...formData.config,
        port: formData.config.port ? parseInt(formData.config.port) : undefined,
      },
    };

    // Remove empty strings from config
    const cleanConfig: { [key: string]: any } = {};
    Object.entries(submitData.config).forEach(([key, value]) => {
      if (value !== "" && value !== undefined) {
        cleanConfig[key] = value;
      }
    });
    submitData.config = cleanConfig;

    // Remove empty tenant
    if (!submitData.tenant?.trim()) {
      delete submitData.tenant;
    }

    onSubmit(submitData);
  };

  const renderConfigFields = () => {
    switch (formData.source) {
      case "close":
      case "stripe":
        return (
          <>
            <TextField
              fullWidth
              label="API Key"
              type="password"
              value={formData.config.api_key}
              onChange={(e) =>
                handleInputChange("config.api_key", e.target.value)
              }
              error={!!errors["config.api_key"]}
              helperText={errors["config.api_key"]}
              margin="normal"
            />
            {formData.source === "close" && (
              <TextField
                fullWidth
                label="API Base URL"
                value={
                  formData.config.api_base_url || "https://api.close.com/api/v1"
                }
                onChange={(e) =>
                  handleInputChange("config.api_base_url", e.target.value)
                }
                margin="normal"
              />
            )}
          </>
        );

      case "postgres":
      case "mysql":
        return (
          <>
            <Grid container spacing={2}>
              <Grid size={8}>
                <TextField
                  fullWidth
                  label="Host"
                  value={formData.config.host}
                  onChange={(e) =>
                    handleInputChange("config.host", e.target.value)
                  }
                  error={!!errors["config.host"]}
                  helperText={errors["config.host"]}
                  margin="normal"
                />
              </Grid>
              <Grid size={4}>
                <TextField
                  fullWidth
                  label="Port"
                  type="number"
                  value={formData.config.port}
                  onChange={(e) =>
                    handleInputChange("config.port", e.target.value)
                  }
                  margin="normal"
                  placeholder={formData.source === "postgres" ? "5432" : "3306"}
                />
              </Grid>
            </Grid>
            <TextField
              fullWidth
              label="Database Name"
              value={formData.config.database}
              onChange={(e) =>
                handleInputChange("config.database", e.target.value)
              }
              error={!!errors["config.database"]}
              helperText={errors["config.database"]}
              margin="normal"
            />
            <Grid container spacing={2}>
              <Grid size={6}>
                <TextField
                  fullWidth
                  label="Username"
                  value={formData.config.username}
                  onChange={(e) =>
                    handleInputChange("config.username", e.target.value)
                  }
                  margin="normal"
                />
              </Grid>
              <Grid size={6}>
                <TextField
                  fullWidth
                  label="Password"
                  type="password"
                  value={formData.config.password}
                  onChange={(e) =>
                    handleInputChange("config.password", e.target.value)
                  }
                  margin="normal"
                />
              </Grid>
            </Grid>
          </>
        );

      case "graphql":
      case "rest":
      case "api":
        return (
          <>
            <TextField
              fullWidth
              label="Base URL"
              value={formData.config.api_base_url}
              onChange={(e) =>
                handleInputChange("config.api_base_url", e.target.value)
              }
              error={!!errors["config.api_base_url"]}
              helperText={errors["config.api_base_url"]}
              margin="normal"
              placeholder="https://api.example.com"
            />
            <TextField
              fullWidth
              label="API Key (optional)"
              type="password"
              value={formData.config.api_key}
              onChange={(e) =>
                handleInputChange("config.api_key", e.target.value)
              }
              margin="normal"
            />
            <Grid container spacing={2}>
              <Grid size={6}>
                <TextField
                  fullWidth
                  label="Username (optional)"
                  value={formData.config.username}
                  onChange={(e) =>
                    handleInputChange("config.username", e.target.value)
                  }
                  margin="normal"
                />
              </Grid>
              <Grid size={6}>
                <TextField
                  fullWidth
                  label="Password (optional)"
                  type="password"
                  value={formData.config.password}
                  onChange={(e) =>
                    handleInputChange("config.password", e.target.value)
                  }
                  margin="normal"
                />
              </Grid>
            </Grid>
          </>
        );

      default:
        return (
          <Typography color="text.secondary" sx={{ mt: 2 }}>
            Select a source type to configure connection settings
          </Typography>
        );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {dataSource ? "Edit Data Source" : "Add Data Source"}
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mt: 1 }}>
          {/* Basic Information */}
          <Typography variant="h6" gutterBottom>
            Basic Information
          </Typography>

          <TextField
            fullWidth
            label="Name"
            value={formData.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
            error={!!errors.name}
            helperText={errors.name}
            margin="normal"
          />

          <TextField
            fullWidth
            label="Description (optional)"
            multiline
            rows={2}
            value={formData.description}
            onChange={(e) => handleInputChange("description", e.target.value)}
            margin="normal"
          />

          <FormControl fullWidth margin="normal" error={!!errors.source}>
            <InputLabel>Source Type</InputLabel>
            <Select
              value={formData.source}
              onChange={(e) => handleInputChange("source", e.target.value)}
              label="Source Type"
            >
              {sourceTypes.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </Select>
            {errors.source && (
              <Typography variant="caption" color="error" sx={{ ml: 2 }}>
                {errors.source}
              </Typography>
            )}
          </FormControl>

          <TextField
            fullWidth
            label="Tenant (optional)"
            value={formData.tenant}
            onChange={(e) => handleInputChange("tenant", e.target.value)}
            margin="normal"
            helperText="Associate this data source with a specific tenant"
          />

          <FormControlLabel
            control={
              <Switch
                checked={formData.enabled}
                onChange={(e) => handleInputChange("enabled", e.target.checked)}
              />
            }
            label="Enabled"
            sx={{ mt: 2 }}
          />

          {/* Connection Configuration */}
          <Divider sx={{ my: 3 }} />
          <Typography variant="h6" gutterBottom>
            Connection Configuration
          </Typography>

          {renderConfigFields()}

          {/* Advanced Settings */}
          <Accordion sx={{ mt: 3 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Advanced Settings</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid size={6}>
                  <TextField
                    fullWidth
                    label="Sync Batch Size"
                    type="number"
                    value={formData.settings.sync_batch_size}
                    onChange={(e) =>
                      handleInputChange(
                        "settings.sync_batch_size",
                        parseInt(e.target.value) || 0
                      )
                    }
                    error={!!errors["settings.sync_batch_size"]}
                    helperText={
                      errors["settings.sync_batch_size"] ||
                      "Number of records to process at once"
                    }
                    margin="normal"
                    inputProps={{ min: 1 }}
                  />
                </Grid>
                <Grid size={6}>
                  <TextField
                    fullWidth
                    label="Rate Limit Delay (ms)"
                    type="number"
                    value={formData.settings.rate_limit_delay_ms}
                    onChange={(e) =>
                      handleInputChange(
                        "settings.rate_limit_delay_ms",
                        parseInt(e.target.value) || 0
                      )
                    }
                    error={!!errors["settings.rate_limit_delay_ms"]}
                    helperText={
                      errors["settings.rate_limit_delay_ms"] ||
                      "Delay between API calls"
                    }
                    margin="normal"
                    inputProps={{ min: 0 }}
                  />
                </Grid>
                <Grid size={6}>
                  <TextField
                    fullWidth
                    label="Max Retries"
                    type="number"
                    value={formData.settings.max_retries}
                    onChange={(e) =>
                      handleInputChange(
                        "settings.max_retries",
                        parseInt(e.target.value) || 0
                      )
                    }
                    margin="normal"
                    inputProps={{ min: 0 }}
                  />
                </Grid>
                <Grid size={6}>
                  <TextField
                    fullWidth
                    label="Timeout (ms)"
                    type="number"
                    value={formData.settings.timeout_ms}
                    onChange={(e) =>
                      handleInputChange(
                        "settings.timeout_ms",
                        parseInt(e.target.value) || 0
                      )
                    }
                    margin="normal"
                    inputProps={{ min: 1000 }}
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">
          {dataSource ? "Update" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default DataSourceForm;
