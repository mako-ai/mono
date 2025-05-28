import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
} from "@mui/material";
import {
  Visibility as ViewIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";

interface ViewInfo {
  name: string;
  type: string;
  options: {
    viewOn?: string;
    pipeline?: any[];
  };
  info: any;
}

interface ViewExplorerProps {
  onViewSelect: (viewName: string, viewDefinition: any) => void;
  selectedView?: string;
}

const ViewExplorer: React.FC<ViewExplorerProps> = ({
  onViewSelect,
  selectedView,
}) => {
  const [views, setViews] = useState<ViewInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchViews();
  }, []);

  const fetchViews = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/database/views");
      const data = await response.json();

      if (data.success) {
        console.log("Raw views data from API:", data.data); // Debug log
        setViews(data.data);
      } else {
        setError(data.error || "Failed to fetch views");
      }
    } catch (err) {
      setError("Failed to connect to the database API");
      console.error("Error fetching views:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewClick = (view: ViewInfo) => {
    console.log("Selected view:", view); // Debug log

    const viewDefinition = {
      name: view.name,
      viewOn: view.options.viewOn,
      pipeline: view.options.pipeline || [],
      options: view.options,
    };

    console.log("Parsed view definition:", viewDefinition); // Debug log
    onViewSelect(view.name, viewDefinition);
  };

  const handleRefresh = () => {
    fetchViews();
  };

  if (loading) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Box sx={{ textAlign: "center" }}>
          <IconButton onClick={handleRefresh} color="primary">
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography variant="h6">Database Views</Typography>
          <IconButton size="small" onClick={handleRefresh} color="primary">
            <RefreshIcon />
          </IconButton>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {views.length} view{views.length !== 1 ? "s" : ""} found
        </Typography>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        {views.length === 0 ? (
          <Box
            sx={{
              p: 3,
              textAlign: "center",
              color: "text.secondary",
            }}
          >
            <Typography variant="body2">
              No views found in the database
            </Typography>
          </Box>
        ) : (
          <List dense>
            {views.map((view) => (
              <ListItem key={view.name} disablePadding>
                <ListItemButton
                  selected={selectedView === view.name}
                  onClick={() => handleViewClick(view)}
                  sx={{
                    "&.Mui-selected": {
                      backgroundColor: "primary.main",
                      color: "primary.contrastText",
                      "&:hover": {
                        backgroundColor: "primary.dark",
                      },
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color:
                        selectedView === view.name ? "inherit" : "primary.main",
                    }}
                  >
                    <ViewIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary={view.name}
                    secondary={
                      <Box sx={{ mt: 0.5 }}>
                        {view.options.viewOn && (
                          <Chip
                            label={`Based on: ${view.options.viewOn}`}
                            size="small"
                            variant="outlined"
                            sx={{
                              fontSize: "0.7rem",
                              height: "20px",
                              color:
                                selectedView === view.name
                                  ? "inherit"
                                  : undefined,
                              borderColor:
                                selectedView === view.name
                                  ? "currentColor"
                                  : undefined,
                            }}
                          />
                        )}
                      </Box>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
};

export default ViewExplorer;
