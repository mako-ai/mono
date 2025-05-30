import {
  Box,
  Typography,
  Card,
  CardContent,
  Switch,
  FormControlLabel,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import { Save as SaveIcon } from "@mui/icons-material";
import { useState } from "react";
import ThemeSelector from "../components/ThemeSelector";

function Settings() {
  const [openaiApiKey, setOpenaiApiKey] = useState(
    localStorage.getItem("openai_api_key") || ""
  );

  const handleSaveSettings = () => {
    // Save OpenAI API key to localStorage
    localStorage.setItem("openai_api_key", openaiApiKey);

    // Here you could also show a success notification
    console.log("Settings saved successfully");
  };

  return (
    <Box sx={{ height: "100%", p: 3, overflow: "auto" }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Settings
      </Typography>

      <Box
        sx={{ display: "flex", flexDirection: "column", gap: 3, maxWidth: 600 }}
      >
        {/* OpenAI Configuration */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              OpenAI Configuration
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                label="OpenAI API Key"
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                type="password"
                size="small"
                fullWidth
                placeholder="sk-..."
                helperText="Enter your OpenAI API key to enable AI chat functionality"
              />
              <Button
                variant="outlined"
                size="small"
                sx={{ alignSelf: "flex-start" }}
                disabled={!openaiApiKey.trim()}
              >
                Test API Key
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Appearance Settings */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Appearance
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Typography variant="body1">Theme</Typography>
                <ThemeSelector />
              </Box>
              <FormControlLabel
                control={<Switch defaultChecked />}
                label="Show line numbers in editor"
              />
              <FormControlLabel
                control={<Switch defaultChecked />}
                label="Enable syntax highlighting"
              />
              <FormControlLabel
                control={<Switch />}
                label="Word wrap in editor"
              />
            </Box>
          </CardContent>
        </Card>

        {/* Query Execution Settings */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Query Execution
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Default result limit</InputLabel>
                <Select defaultValue={1000} label="Default result limit">
                  <MenuItem value={100}>100 rows</MenuItem>
                  <MenuItem value={500}>500 rows</MenuItem>
                  <MenuItem value={1000}>1,000 rows</MenuItem>
                  <MenuItem value={5000}>5,000 rows</MenuItem>
                  <MenuItem value={10000}>10,000 rows</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Query timeout</InputLabel>
                <Select defaultValue={30} label="Query timeout">
                  <MenuItem value={10}>10 seconds</MenuItem>
                  <MenuItem value={30}>30 seconds</MenuItem>
                  <MenuItem value={60}>1 minute</MenuItem>
                  <MenuItem value={300}>5 minutes</MenuItem>
                  <MenuItem value={600}>10 minutes</MenuItem>
                </Select>
              </FormControl>
              <FormControlLabel
                control={<Switch defaultChecked />}
                label="Auto-save queries"
              />
              <FormControlLabel
                control={<Switch />}
                label="Confirm before executing destructive queries"
              />
            </Box>
          </CardContent>
        </Card>

        {/* Database Connection */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Database Connection
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                label="Connection Name"
                defaultValue="Production Database"
                size="small"
                fullWidth
              />
              <TextField
                label="Host"
                defaultValue="localhost"
                size="small"
                fullWidth
              />
              <TextField
                label="Port"
                defaultValue="5432"
                size="small"
                type="number"
                fullWidth
              />
              <TextField
                label="Database"
                defaultValue="revops_db"
                size="small"
                fullWidth
              />
              <Button
                variant="outlined"
                size="small"
                sx={{ alignSelf: "flex-start" }}
              >
                Test Connection
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Save Button */}
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            size="large"
            onClick={handleSaveSettings}
            disableElevation
          >
            Save Settings
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

export default Settings;
