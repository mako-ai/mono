import {
  Box,
  Typography,
  Card,
  CardContent,
  IconButton,
  Chip,
} from "@mui/material";
import {
  Add as AddIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
} from "@mui/icons-material";

function Views() {
  return (
    <Box sx={{ height: "100%", p: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1">
          Views
        </Typography>
        <IconButton
          color="primary"
          sx={{
            backgroundColor: "primary.main",
            color: "white",
            "&:hover": {
              backgroundColor: "primary.dark",
            },
          }}
        >
          <AddIcon />
        </IconButton>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {/* Sample view cards */}
        {[
          {
            name: "Customer Analytics",
            type: "Materialized",
            rows: "1.2M",
            lastRefresh: "2 hours ago",
          },
          {
            name: "Sales Summary",
            type: "Standard",
            rows: "45K",
            lastRefresh: "Real-time",
          },
          {
            name: "Product Performance",
            type: "Materialized",
            rows: "890K",
            lastRefresh: "1 hour ago",
          },
          {
            name: "User Engagement",
            type: "Standard",
            rows: "2.1M",
            lastRefresh: "Real-time",
          },
          {
            name: "Revenue Trends",
            type: "Materialized",
            rows: "156K",
            lastRefresh: "30 minutes ago",
          },
        ].map((view, index) => (
          <Card
            key={index}
            sx={{
              cursor: "pointer",
              transition: "all 0.2s ease",
              "&:hover": {
                transform: "translateY(-1px)",
                boxShadow: 2,
              },
            }}
          >
            <CardContent>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", flex: 1 }}>
                  <ViewIcon color="primary" sx={{ mr: 2 }} />
                  <Box>
                    <Typography variant="h6" component="h3" gutterBottom>
                      {view.name}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
                      <Chip
                        label={view.type}
                        size="small"
                        color={
                          view.type === "Materialized" ? "primary" : "default"
                        }
                        variant="outlined"
                      />
                      <Chip
                        label={`${view.rows} rows`}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      Last refresh: {view.lastRefresh}
                    </Typography>
                  </Box>
                </Box>
                <IconButton size="small" color="primary">
                  <EditIcon />
                </IconButton>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}

export default Views;
