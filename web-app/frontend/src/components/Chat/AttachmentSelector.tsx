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
} from "@mui/material";
import { Storage, TableView } from "@mui/icons-material";
import { Collection, View } from "./types";

interface AttachmentSelectorProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  availableCollections: Collection[];
  availableViews: View[];
  onAttachCollection: (collection: Collection) => void;
  onAttachView: (view: View) => void;
}

interface AttachmentOption {
  id: string;
  name: string;
  type: "collection" | "view";
  data: Collection | View;
}

const AttachmentSelector: React.FC<AttachmentSelectorProps> = ({
  open,
  anchorEl,
  onClose,
  availableCollections,
  availableViews,
  onAttachCollection,
  onAttachView,
}) => {
  const [inputValue, setInputValue] = useState("");

  // Combine collections and views into a single options array
  const options: AttachmentOption[] = [
    ...availableCollections.map((col) => ({
      id: col.id,
      name: col.name,
      type: "collection" as const,
      data: col,
    })),
    ...availableViews.map((view) => ({
      id: view.id,
      name: view.name,
      type: "view" as const,
      data: view,
    })),
  ];

  const handleSelect = (option: AttachmentOption | null) => {
    if (option) {
      if (option.type === "collection") {
        onAttachCollection(option.data as Collection);
      } else {
        onAttachView(option.data as View);
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
          groupBy={(option) =>
            option.type === "collection" ? "Collections" : "Views"
          }
          getOptionLabel={(option) => option.name}
          inputValue={inputValue}
          onInputChange={(_, value) => setInputValue(value)}
          onChange={(_, value) => handleSelect(value)}
          onClose={onClose}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Search collections and views..."
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
                ) : (
                  <TableView fontSize="small" color="secondary" />
                )}
              </ListItemIcon>
              <ListItemText primary={option.name} />
            </Box>
          )}
          renderGroup={(params) => (
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
      </Paper>
    </Popper>
  );
};

export default AttachmentSelector;
