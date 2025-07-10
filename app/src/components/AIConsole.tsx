import React, { useRef, useState } from "react";
import { Box, Paper, Dialog, DialogTitle, DialogContent, List, ListItem, ListItemText, ListItemIcon, IconButton, Typography, Chip, ListItemButton } from "@mui/material";
import { Close, Computer, SmartToy } from "@mui/icons-material";
import Console, { ConsoleRef } from "./Console";
import Chat3 from "./Chat3";
import { ConsoleModification } from "../hooks/useMonacoConsole";

interface Database {
  id: string;
  name: string;
  description: string;
  database: string;
  type: string;
  active: boolean;
  lastConnectedAt?: string;
  displayName: string;
  hostKey: string;
  hostName: string;
}

interface AIConsoleProps {
  initialContent: string;
  title?: string;
  onExecute: (content: string, databaseId?: string) => void;
  onSave?: (content: string, currentPath?: string) => Promise<boolean>;
  isExecuting: boolean;
  isSaving?: boolean;
  onContentChange?: (content: string) => void;
  databases?: Database[];
  initialDatabaseId?: string;
  onDatabaseChange?: (databaseId: string) => void;
  filePath?: string;
}

const AIConsole: React.FC<AIConsoleProps> = (props) => {
  const consoleRef = useRef<ConsoleRef>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versionHistory, setVersionHistory] = useState<any[]>([]);

  // Handle console modification from AI
  const handleConsoleModification = (modification: ConsoleModification) => {
    if (consoleRef.current) {
      consoleRef.current.applyModification(modification);
    }
  };

  // Handle history dialog
  const handleHistoryClick = () => {
    // In a real implementation, you would get this from the console ref
    // For now, we'll just show the dialog
    setHistoryOpen(true);
  };

  const handleHistoryClose = () => {
    setHistoryOpen(false);
  };

  return (
    <Box sx={{ display: "flex", height: "100%", gap: 2 }}>
      {/* Console Panel */}
      <Paper
        elevation={0}
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: 1,
          borderColor: "divider",
        }}
      >
        <Console
          ref={consoleRef}
          {...props}
          enableVersionControl={true}
          onHistoryClick={handleHistoryClick}
        />
      </Paper>

      {/* Chat Panel */}
      <Paper
        elevation={0}
        sx={{
          width: 400,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: 1,
          borderColor: "divider",
        }}
      >
        <Chat3 onConsoleModification={handleConsoleModification} />
      </Paper>

      {/* Version History Dialog */}
      <Dialog
        open={historyOpen}
        onClose={handleHistoryClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography variant="h6">Version History</Typography>
            <IconButton size="small" onClick={handleHistoryClose}>
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <List>
            {versionHistory.length === 0 ? (
              <ListItem>
                <ListItemText 
                  primary="No version history yet"
                  secondary="Versions will appear here as you make changes"
                />
              </ListItem>
            ) : (
              versionHistory.map((version) => (
                <ListItemButton
                  key={version.id}
                  onClick={() => {
                    // Restore version logic here
                    handleHistoryClose();
                  }}
                >
                  <ListItemIcon>
                    {version.source === "ai" ? (
                      <SmartToy color="primary" />
                    ) : (
                      <Computer color="action" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={version.description || `${version.source === "ai" ? "AI" : "User"} edit`}
                    secondary={new Date(version.timestamp).toLocaleString()}
                  />
                  {version.isCurrent && (
                    <Chip label="Current" size="small" color="primary" />
                  )}
                </ListItemButton>
              ))
            )}
          </List>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default AIConsole;