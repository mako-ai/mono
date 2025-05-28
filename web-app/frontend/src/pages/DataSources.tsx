import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Tooltip,
  CircularProgress,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as TestIcon,
  Pause as DisableIcon,
  CheckCircle as EnableIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import DataSourceForm from "../components/DataSourceForm";

interface DataSource {
  _id: string;
  name: string;
  description?: string;
  source: string;
  enabled: boolean;
  config: {
    api_key?: string;
    api_base_url?: string;
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
  created_at: string;
  updated_at: string;
}

function DataSources() {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingDataSource, setEditingDataSource] = useState<DataSource | null>(
    null
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dataSourceToDelete, setDataSourceToDelete] =
    useState<DataSource | null>(null);
  const [error, setError] = useState<string>("");
  const [testingId, setTestingId] = useState<string>("");

  useEffect(() => {
    fetchDataSources();
  }, []);

  const fetchDataSources = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/sources");
      const data = await response.json();

      if (data.success) {
        setDataSources(data.data);
      } else {
        setError(data.error || "Failed to fetch data sources");
      }
    } catch (err) {
      setError("Failed to fetch data sources");
      console.error("Error fetching data sources:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDataSource = () => {
    setEditingDataSource(null);
    setFormOpen(true);
  };

  const handleEditDataSource = (dataSource: DataSource) => {
    setEditingDataSource(dataSource);
    setFormOpen(true);
  };

  const handleDeleteClick = (dataSource: DataSource) => {
    setDataSourceToDelete(dataSource);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!dataSourceToDelete) return;

    try {
      const response = await fetch(`/api/sources/${dataSourceToDelete._id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (data.success) {
        setDataSources((prev) =>
          prev.filter((ds) => ds._id !== dataSourceToDelete._id)
        );
        setDeleteDialogOpen(false);
        setDataSourceToDelete(null);
      } else {
        setError(data.error || "Failed to delete data source");
      }
    } catch (err) {
      setError("Failed to delete data source");
      console.error("Error deleting data source:", err);
    }
  };

  const handleToggleEnabled = async (dataSource: DataSource) => {
    try {
      const response = await fetch(`/api/sources/${dataSource._id}/enable`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: !dataSource.enabled }),
      });
      const data = await response.json();

      if (data.success) {
        setDataSources((prev) =>
          prev.map((ds) =>
            ds._id === dataSource._id ? { ...ds, enabled: !ds.enabled } : ds
          )
        );
      } else {
        setError(data.error || "Failed to update data source");
      }
    } catch (err) {
      setError("Failed to update data source");
      console.error("Error updating data source:", err);
    }
  };

  const handleTestConnection = async (dataSource: DataSource) => {
    setTestingId(dataSource._id);
    try {
      const response = await fetch(`/api/sources/${dataSource._id}/test`, {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        const result = data.data;
        setError(result.success ? "" : result.message);
        // You could show a success message here instead
      } else {
        setError(data.error || "Failed to test connection");
      }
    } catch (err) {
      setError("Failed to test connection");
      console.error("Error testing connection:", err);
    } finally {
      setTestingId("");
    }
  };

  const handleFormSubmit = async (formData: any) => {
    try {
      const url = editingDataSource
        ? `/api/sources/${editingDataSource._id}`
        : "/api/sources";

      const method = editingDataSource ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        if (editingDataSource) {
          setDataSources((prev) =>
            prev.map((ds) =>
              ds._id === editingDataSource._id ? data.data : ds
            )
          );
        } else {
          setDataSources((prev) => [...prev, data.data]);
        }
        setFormOpen(false);
        setEditingDataSource(null);
      } else {
        setError(data.error || "Failed to save data source");
      }
    } catch (err) {
      setError("Failed to save data source");
      console.error("Error saving data source:", err);
    }
  };

  const getSourceChipColor = (source: string) => {
    const colors: {
      [key: string]: "primary" | "secondary" | "success" | "warning" | "error";
    } = {
      close: "primary",
      stripe: "secondary",
      postgres: "success",
      mysql: "success",
      graphql: "warning",
      rest: "warning",
      api: "warning",
    };
    return colors[source] || "default";
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="400px"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, height: "100%", overflow: "auto" }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1">
          Data Sources
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateDataSource}
        >
          Add Data Source
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {dataSources.map((dataSource) => (
          <Grid
            size={{ xs: 12, sm: 6, md: 4, lg: 3, xl: 2 }}
            key={dataSource._id}
          >
            <Card
              sx={{ height: "100%", display: "flex", flexDirection: "column" }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    mb: 2,
                  }}
                >
                  <Typography variant="h6" component="h2" noWrap>
                    {dataSource.name}
                  </Typography>
                  <Chip
                    label={dataSource.source}
                    color={getSourceChipColor(dataSource.source)}
                    size="small"
                  />
                </Box>

                {dataSource.description && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 2 }}
                  >
                    {dataSource.description}
                  </Typography>
                )}

                <Box sx={{ mb: 2 }}>
                  <Chip
                    label={dataSource.enabled ? "Enabled" : "Disabled"}
                    color={dataSource.enabled ? "success" : "default"}
                    size="small"
                    sx={{ mr: 1 }}
                  />
                  {dataSource.tenant && (
                    <Chip
                      label={`Tenant: ${dataSource.tenant}`}
                      variant="outlined"
                      size="small"
                    />
                  )}
                </Box>

                <Typography variant="caption" color="text.secondary">
                  Batch Size: {dataSource.settings.sync_batch_size} | Rate
                  Limit: {dataSource.settings.rate_limit_delay_ms}ms
                </Typography>
              </CardContent>

              <CardActions
                sx={{ justifyContent: "space-between", px: 2, pb: 2 }}
              >
                <Box>
                  <Tooltip title="Edit">
                    <IconButton
                      size="small"
                      onClick={() => handleEditDataSource(dataSource)}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={dataSource.enabled ? "Disable" : "Enable"}>
                    <IconButton
                      size="small"
                      onClick={() => handleToggleEnabled(dataSource)}
                      color={dataSource.enabled ? "warning" : "success"}
                    >
                      {dataSource.enabled ? <DisableIcon /> : <EnableIcon />}
                    </IconButton>
                  </Tooltip>
                </Box>

                <Box>
                  <Tooltip title="Test Connection">
                    <IconButton
                      size="small"
                      onClick={() => handleTestConnection(dataSource)}
                      disabled={testingId === dataSource._id}
                    >
                      {testingId === dataSource._id ? (
                        <CircularProgress size={20} />
                      ) : (
                        <TestIcon />
                      )}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteClick(dataSource)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {dataSources.length === 0 && !loading && (
        <Box sx={{ textAlign: "center", mt: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No data sources configured
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Get started by adding your first data source
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateDataSource}
          >
            Add Data Source
          </Button>
        </Box>
      )}

      {/* Form Dialog */}
      <DataSourceForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingDataSource(null);
        }}
        onSubmit={handleFormSubmit}
        dataSource={editingDataSource}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            Delete Data Source
            <IconButton onClick={() => setDeleteDialogOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{dataSourceToDelete?.name}"? This
            action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default DataSources;
