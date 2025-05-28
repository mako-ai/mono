import { Box, Typography } from "@mui/material";

function Collections() {
  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "text.secondary",
      }}
    >
      <Typography variant="h4">Collections Management</Typography>
      <Typography variant="body1" sx={{ mt: 2 }}>
        Collection management functionality will be implemented here.
      </Typography>
    </Box>
  );
}

export default Collections;
