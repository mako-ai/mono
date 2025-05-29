import React from "react";
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  Button,
  Typography,
  Box,
  Paper,
  Chip,
} from "@mui/material";
import { Storage, Code, TableView, Description } from "@mui/icons-material";
import { Collection, Definition, View } from "./types";

interface AttachmentSelectorProps {
  contextMenuAnchor: HTMLElement | null;
  onClose: () => void;
  collectionsDialogOpen: boolean;
  setCollectionsDialogOpen: (open: boolean) => void;
  definitionsDialogOpen: boolean;
  setDefinitionsDialogOpen: (open: boolean) => void;
  viewsDialogOpen: boolean;
  setViewsDialogOpen: (open: boolean) => void;
  availableCollections: Collection[];
  availableDefinitions: Definition[];
  availableViews: View[];
  onAttachCollection: (collection: Collection) => void;
  onAttachDefinition: (definition: Definition) => void;
  onAttachView: (view: View) => void;
  onAttachEditorContent: () => void;
}

const AttachmentSelector: React.FC<AttachmentSelectorProps> = ({
  contextMenuAnchor,
  onClose,
  collectionsDialogOpen,
  setCollectionsDialogOpen,
  definitionsDialogOpen,
  setDefinitionsDialogOpen,
  viewsDialogOpen,
  setViewsDialogOpen,
  availableCollections,
  availableDefinitions,
  availableViews,
  onAttachCollection,
  onAttachDefinition,
  onAttachView,
  onAttachEditorContent,
}) => {
  return (
    <>
      {/* Context Menu */}
      <Menu
        anchorEl={contextMenuAnchor}
        open={Boolean(contextMenuAnchor)}
        onClose={onClose}
      >
        <MenuItem onClick={() => setCollectionsDialogOpen(true)}>
          <ListItemIcon>
            <Storage fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Add Collection" />
        </MenuItem>
        <MenuItem onClick={() => setDefinitionsDialogOpen(true)}>
          <ListItemIcon>
            <Code fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Add Definition" />
        </MenuItem>
        <MenuItem onClick={() => setViewsDialogOpen(true)}>
          <ListItemIcon>
            <TableView fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Add View" />
        </MenuItem>
        <MenuItem onClick={onAttachEditorContent}>
          <ListItemIcon>
            <Description fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Add Editor Content" />
        </MenuItem>
      </Menu>

      {/* Collections Dialog */}
      <Dialog
        open={collectionsDialogOpen}
        onClose={() => setCollectionsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Select Collection to Attach</DialogTitle>
        <DialogContent>
          <List>
            {availableCollections.map((collection) => (
              <ListItem key={collection.id} divider>
                <ListItemIcon>
                  <Storage />
                </ListItemIcon>
                <ListItemText
                  primary={collection.name}
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {collection.description}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        {collection.documentCount.toLocaleString()} documents
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ mt: 1, display: "block" }}
                      >
                        Sample Document:
                      </Typography>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 1,
                          mt: 0.5,
                          bgcolor: "grey.50",
                          maxHeight: 100,
                          overflow: "auto",
                        }}
                      >
                        <Typography
                          variant="caption"
                          component="pre"
                          sx={{
                            fontFamily: "monospace",
                            fontSize: "0.7rem",
                          }}
                        >
                          {JSON.stringify(collection.sampleDocument, null, 2)}
                        </Typography>
                      </Paper>
                    </Box>
                  }
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => onAttachCollection(collection)}
                >
                  Attach
                </Button>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCollectionsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Definitions Dialog */}
      <Dialog
        open={definitionsDialogOpen}
        onClose={() => setDefinitionsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Select Definition to Attach</DialogTitle>
        <DialogContent>
          <List>
            {availableDefinitions.map((definition) => (
              <ListItem key={definition.id} divider>
                <ListItemIcon>
                  <Code />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="subtitle2">
                        {definition.name}
                      </Typography>
                      <Chip
                        label={definition.type}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: "0.7rem" }}
                      />
                      <Chip
                        label={`${definition.fileName}:${definition.lineNumbers}`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: "0.7rem" }}
                      />
                    </Box>
                  }
                  secondary={
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 1,
                        mt: 1,
                        bgcolor: "grey.50",
                        maxHeight: 100,
                        overflow: "auto",
                      }}
                    >
                      <Typography
                        variant="caption"
                        component="pre"
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "0.75rem",
                        }}
                      >
                        {definition.content}
                      </Typography>
                    </Paper>
                  }
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => onAttachDefinition(definition)}
                >
                  Attach
                </Button>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDefinitionsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Views Dialog */}
      <Dialog
        open={viewsDialogOpen}
        onClose={() => setViewsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Select View to Attach</DialogTitle>
        <DialogContent>
          <List>
            {availableViews.map((view) => (
              <ListItem key={view.id} divider>
                <ListItemIcon>
                  <TableView />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="subtitle2">{view.name}</Typography>
                      <Chip
                        label={`View on ${view.viewOn}`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: "0.7rem" }}
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 1 }}
                      >
                        {view.description}
                      </Typography>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 1,
                          bgcolor: "grey.50",
                          maxHeight: 150,
                          overflow: "auto",
                        }}
                      >
                        <Typography
                          variant="caption"
                          component="pre"
                          sx={{
                            fontFamily: "monospace",
                            fontSize: "0.75rem",
                          }}
                        >
                          {JSON.stringify(view.pipeline, null, 2)}
                        </Typography>
                      </Paper>
                    </Box>
                  }
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => onAttachView(view)}
                >
                  Attach
                </Button>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AttachmentSelector;
