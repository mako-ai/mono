import React, { useState, useEffect } from "react";
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
  Alert,
  Snackbar,
} from "@mui/material";
import { Save as SaveIcon, Refresh as RefreshIcon } from "@mui/icons-material";
import ThemeSelector from "../components/ThemeSelector";
import { useCustomPrompt } from "../components/Chat/CustomPrompt";
import { WorkspaceMembers } from "../components/WorkspaceMembers";
import { useWorkspace } from "../contexts/workspace-context";

function Settings() {
  const { currentWorkspace } = useWorkspace();
  const [openaiApiKey, setOpenaiApiKey] = useState(
    localStorage.getItem("openai_api_key") || "",
  );

  // Custom prompt state
  const {
    content: customPromptContent,
    isLoading: customPromptLoading,
    error: customPromptError,
    updateCustomPrompt,
    fetchCustomPrompt,
  } = useCustomPrompt();

  const [localCustomPrompt, setLocalCustomPrompt] = useState("");
  const [customPromptModified, setCustomPromptModified] = useState(false);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  // Update local state when custom prompt content changes
  useEffect(() => {
    setLocalCustomPrompt(customPromptContent);
    setCustomPromptModified(false);
  }, [customPromptContent]);

  const handleSaveSettings = () => {
    // Save OpenAI API key to localStorage
    localStorage.setItem("openai_api_key", openaiApiKey);

    setSnackbarMessage("Settings saved successfully!");
    setShowSnackbar(true);
  };

  const handleCustomPromptChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setLocalCustomPrompt(event.target.value);
    setCustomPromptModified(event.target.value !== customPromptContent);
  };

  const handleSaveCustomPrompt = async () => {
    const success = await updateCustomPrompt(localCustomPrompt);
    if (success) {
      setCustomPromptModified(false);
      setSnackbarMessage("Custom prompt saved successfully!");
      setShowSnackbar(true);
    }
  };

  const handleResetCustomPrompt = async () => {
    if (!currentWorkspace?.id) {
      setSnackbarMessage("No workspace selected");
      setShowSnackbar(true);
      return;
    }

    try {
      const response = await fetch(
        `/api/workspaces/${currentWorkspace.id}/custom-prompt/reset`,
        {
          method: "POST",
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          await fetchCustomPrompt(); // Refresh the content
          setSnackbarMessage("Custom prompt reset to default!");
          setShowSnackbar(true);
        }
      }
    } catch (error) {
      console.error("Error resetting custom prompt:", error);
    }
  };

  return (
    <Box sx={{ height: "100%", p: 2, overflow: "auto" }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 2 }}>
        Workspace Settings
      </Typography>

      <Box
        sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 800 }}
      >
        {/* OpenAI Configuration */}
        <Card>
          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
            <Typography
              variant="subtitle1"
              gutterBottom
              sx={{ fontWeight: 600 }}
            >
              OpenAI Configuration
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <TextField
                label="OpenAI API Key"
                value={openaiApiKey}
                onChange={e => setOpenaiApiKey(e.target.value)}
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

        {/* Custom Prompt Configuration */}
        <Card>
          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
            <Typography
              variant="subtitle1"
              gutterBottom
              sx={{ fontWeight: 600 }}
            >
              Custom Prompt Configuration
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Customize the AI assistant's behavior by adding context about your
              business, data relationships, and common query patterns.
            </Typography>

            {customPromptError && (
              <Alert severity="error" sx={{ mb: 1.5 }}>
                {customPromptError}
              </Alert>
            )}

            <TextField
              fullWidth
              multiline
              rows={10}
              value={localCustomPrompt}
              onChange={handleCustomPromptChange}
              placeholder="Enter your custom prompt content here..."
              disabled={customPromptLoading}
              sx={{ mb: 1.5 }}
            />

            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<SaveIcon />}
                onClick={handleSaveCustomPrompt}
                disabled={!customPromptModified || customPromptLoading}
              >
                Save Custom Prompt
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={handleResetCustomPrompt}
                disabled={customPromptLoading}
              >
                Reset to Default
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Workspace Members */}
        <Card>
          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
            <WorkspaceMembers />
          </CardContent>
        </Card>

        {/* Appearance Settings */}
        <Card>
          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
            <Typography
              variant="subtitle1"
              gutterBottom
              sx={{ fontWeight: 600 }}
            >
              Appearance
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Typography variant="body2">Theme</Typography>
                <ThemeSelector />
              </Box>
              <FormControlLabel
                control={<Switch defaultChecked size="small" />}
                label={
                  <Typography variant="body2">
                    Show line numbers in editor
                  </Typography>
                }
              />
              <FormControlLabel
                control={<Switch defaultChecked size="small" />}
                label={
                  <Typography variant="body2">
                    Enable syntax highlighting
                  </Typography>
                }
              />
              <FormControlLabel
                control={<Switch size="small" />}
                label={
                  <Typography variant="body2">Word wrap in editor</Typography>
                }
              />
            </Box>
          </CardContent>
        </Card>

        {/* Query Execution Settings */}
        <Card>
          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
            <Typography
              variant="subtitle1"
              gutterBottom
              sx={{ fontWeight: 600 }}
            >
              Query Execution
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
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
                control={<Switch defaultChecked size="small" />}
                label={
                  <Typography variant="body2">Auto-save queries</Typography>
                }
              />
              <FormControlLabel
                control={<Switch size="small" />}
                label={
                  <Typography variant="body2">
                    Confirm before executing destructive queries
                  </Typography>
                }
              />
            </Box>
          </CardContent>
        </Card>

        {/* Database Connection */}
        <Card>
          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
            <Typography
              variant="subtitle1"
              gutterBottom
              sx={{ fontWeight: 600 }}
            >
              Database Connection
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
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
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            size="medium"
            onClick={handleSaveSettings}
            disableElevation
          >
            Save Settings
          </Button>
        </Box>
      </Box>

      <Snackbar
        open={showSnackbar}
        autoHideDuration={6000}
        onClose={() => setShowSnackbar(false)}
      >
        <Alert onClose={() => setShowSnackbar(false)} severity="success">
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default Settings;
