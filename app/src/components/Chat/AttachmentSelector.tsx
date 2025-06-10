import React, { useState } from "react";
import {
  Autocomplete,
  TextField,
  Box,
  Typography,
  ListItemIcon,
  ListItemText,
  Paper,
  Popper,
  Button,
  Divider,
} from "@mui/material";
import { Storage, TableView, Code, Add } from "@mui/icons-material";
import { Collection, View } from "./types";
import { useConsoleStore } from "../../store/consoleStore";

interface AttachmentSelectorProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  availableCollections: Collection[];
  availableViews: View[];
  onAttachCollection: (collection: Collection) => void;
  onAttachView: (view: View) => void;
  onAttachConsole: (consoleId: string, content: string, title: string) => void;
  onCreateNewConsole: () => void;
}

interface AttachmentOption {
  id: string;
  name: string;
  type: "collection" | "view" | "console";
  data: Collection | View | { id: string; content: string; title: string };
}

// Helper to escape regex special characters when building the dynamic pattern
const escapeRegExp = (str: string): string =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const AttachmentSelector: React.FC<AttachmentSelectorProps> = ({
  open,
  anchorEl,
  onClose,
  availableCollections,
  availableViews,
  onAttachCollection,
  onAttachView,
  onAttachConsole,
  onCreateNewConsole,
}) => {
  const [inputValue, setInputValue] = useState("");
  const { consoleTabs } = useConsoleStore();

  // Combine collections, views, and consoles into a single options array
  const options: AttachmentOption[] = [
    ...availableCollections.map(col => ({
      id: col.id,
      name: col.name,
      type: "collection" as const,
      data: col,
    })),
    ...availableViews.map(view => ({
      id: view.id,
      name: view.name,
      type: "view" as const,
      data: view,
    })),
    ...consoleTabs.map(console => ({
      id: console.id,
      name: console.title,
      type: "console" as const,
      data: { id: console.id, content: console.content, title: console.title },
    })),
  ];

  const handleSelect = (option: AttachmentOption | null) => {
    if (option) {
      if (option.type === "collection") {
        onAttachCollection(option.data as Collection);
      } else if (option.type === "view") {
        onAttachView(option.data as View);
      } else {
        const consoleData = option.data as {
          id: string;
          content: string;
          title: string;
        };
        onAttachConsole(consoleData.id, consoleData.content, consoleData.title);
      }
      setInputValue("");
      onClose();
    }
  };

  if (!open) return null;

  return (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement="top-start"
      style={{ zIndex: 1300 }}
    >
      <Paper elevation={8} sx={{ p: 1, minWidth: 300 }}>
        <Autocomplete
          autoFocus
          size="small"
          options={options}
          filterOptions={(opts, { inputValue }) => {
            // Allow users to separate search terms by spaces – each term can appear anywhere in the string
            if (!inputValue?.trim()) return opts;

            // Build a dynamic, case-insensitive regex where every whitespace becomes a ".*" wildcard
            const pattern = inputValue
              .trim()
              .split(/\s+/)
              .map(escapeRegExp)
              .join(".*");

            const regex = new RegExp(pattern, "i");
            return opts.filter(opt => regex.test(opt.name));
          }}
          groupBy={option =>
            option.type === "collection"
              ? "Collections"
              : option.type === "view"
                ? "Views"
                : "Consoles"
          }
          getOptionLabel={option => option.name}
          inputValue={inputValue}
          onInputChange={(_, value) => setInputValue(value)}
          onChange={(_, value) => handleSelect(value)}
          onClose={onClose}
          renderInput={params => (
            <TextField
              {...params}
              placeholder="Search collections, views, or consoles..."
              variant="outlined"
              size="small"
              autoFocus
            />
          )}
          renderOption={(props, option) => (
            <Box component="li" {...props}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                {option.type === "collection" ? (
                  <Storage fontSize="small" color="primary" />
                ) : option.type === "view" ? (
                  <TableView fontSize="small" color="secondary" />
                ) : (
                  <Code fontSize="small" color="action" />
                )}
              </ListItemIcon>
              <ListItemText primary={option.name} />
            </Box>
          )}
          renderGroup={params => (
            <Box key={params.key}>
              <Typography
                variant="caption"
                sx={{
                  px: 2,
                  py: 0.5,
                  display: "block",
                  fontWeight: 600,
                  color: "text.secondary",
                  backgroundColor: "grey.100",
                }}
              >
                {params.group}
              </Typography>
              {params.children}
            </Box>
          )}
          sx={{
            "& .MuiAutocomplete-listbox": {
              maxHeight: 300,
            },
          }}
        />
        <Divider sx={{ my: 1 }} />
        <Button
          fullWidth
          size="small"
          startIcon={<Add />}
          onClick={() => {
            onCreateNewConsole();
            setInputValue("");
            onClose();
          }}
          sx={{ justifyContent: "flex-start", textTransform: "none" }}
        >
          Create New Console
        </Button>
      </Paper>
    </Popper>
  );
};

export default AttachmentSelector;
