import { Box } from "@mui/material";
import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Queries from "./pages/Queries";
import Databases from "./pages/Databases";
import Views from "./pages/Views";
import Settings from "./pages/Settings";
import DataSources from "./pages/DataSources";

function App() {
  return (
    <Box
      sx={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        maxWidth: "100vw",
        overflow: "hidden",
      }}
    >
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <Box
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <Routes>
          <Route path="/" element={<Queries />} />
          <Route path="/sources" element={<DataSources />} />
          <Route path="/databases" element={<Databases />} />
          <Route path="/views" element={<Views />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Box>
    </Box>
  );
}

export default App;
