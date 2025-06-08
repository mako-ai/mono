import {
  Box,
  IconButton,
  Tooltip,
  styled,
  Menu,
  MenuItem,
  Typography,
  Divider,
} from "@mui/material";
import {
  VisibilityOutlined as ViewIcon,
  SettingsOutlined as SettingsIcon,
  CloudUploadOutlined as DataSourceIcon,
  AccountCircleOutlined as UserIcon,
  Logout as LogoutIcon,
} from "@mui/icons-material";
import {
  SquareChevronRight as ConsoleIcon,
  Database as DatabaseIcon,
} from "lucide-react";
import { useAppStore, AppView } from "../store";
import { useConsoleStore } from "../store/consoleStore";
import { useAuth } from "../hooks/useAuth";
import { useState } from "react";

const NavButton = styled(IconButton, {
  shouldForwardProp: (prop) => prop !== "isActive",
})<{ isActive?: boolean }>(({ theme, isActive }) => ({
  p: 1,
  borderRadius: 8,
  backgroundColor: isActive ? theme.palette.action.selected : "transparent",
  color: isActive ? theme.palette.text.primary : theme.palette.text.secondary,
  "&:hover": {
    backgroundColor: isActive
      ? theme.palette.action.selected
      : theme.palette.action.hover,
  },
  transition: "all 0.2s ease",
}));

// Views that can appear in the sidebar navigation. Extends the core AppView
// union with additional sidebar-specific entries that don't directly map to
// a left-pane view managed by the app store.
type NavigationView = AppView | "views" | "settings";

const topNavigationItems: { view: NavigationView; icon: any; label: string }[] =
  [
    { view: "databases", icon: DatabaseIcon, label: "Databases" },
    { view: "consoles", icon: ConsoleIcon, label: "Consoles" },
    { view: "views", icon: ViewIcon, label: "Views" },
    { view: "sources", icon: DataSourceIcon, label: "Data Sources" },
  ];

const bottomNavigationItems: {
  view: NavigationView;
  icon: any;
  label: string;
}[] = [{ view: "settings", icon: SettingsIcon, label: "Settings" }];

function Sidebar() {
  const { activeView, setActiveView } = useAppStore();
  const { user, logout } = useAuth();
  const [userMenuAnchorEl, setUserMenuAnchorEl] = useState<null | HTMLElement>(
    null
  );
  const isUserMenuOpen = Boolean(userMenuAnchorEl);

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchorEl(null);
  };

  const handleLogout = async () => {
    handleUserMenuClose();
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleNavigation = (view: NavigationView) => {
    // Update the left pane only for views that the store recognises.
    if (view === "databases" || view === "consoles" || view === "sources") {
      setActiveView(view);
    }

    // Views that should open (or focus) a tab in the editor
    if (view === "settings" || view === "sources") {
      const { findTabByKind, addConsoleTab, setActiveConsole } =
        useConsoleStore.getState();

      const existing = findTabByKind(
        view === "settings" ? "settings" : "sources"
      );
      if (existing) {
        setActiveConsole(existing.id);
      } else {
        const id = addConsoleTab({
          title: view === "settings" ? "Settings" : "Data Sources",
          content: "", // Will be replaced with actual forms later
          initialContent: "",
          kind: view === "settings" ? "settings" : "sources",
        });
        setActiveConsole(id);
      }
    }
  };

  return (
    <Box
      sx={{
        height: "100vh",
        borderRight: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: 0.5,
          gap: 0.5,
        }}
      >
        {topNavigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.view;

          return (
            <Tooltip key={item.view} title={item.label} placement="right">
              <NavButton
                isActive={isActive}
                onClick={() => handleNavigation(item.view as NavigationView)}
              >
                <Icon />
              </NavButton>
            </Tooltip>
          );
        })}
      </Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        {/* User Menu */}
        <Tooltip title={user?.email || "User"} placement="right">
          <NavButton onClick={handleUserMenuOpen}>
            <UserIcon />
          </NavButton>
        </Tooltip>

        <Menu
          anchorEl={userMenuAnchorEl}
          open={isUserMenuOpen}
          onClose={handleUserMenuClose}
          anchorOrigin={{
            vertical: "center",
            horizontal: "right",
          }}
          transformOrigin={{
            vertical: "center",
            horizontal: "left",
          }}
        >
          <Box sx={{ px: 2, py: 1, minWidth: 200 }}>
            <Typography variant="body2" color="text.secondary">
              Signed in as
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {user?.email}
            </Typography>
          </Box>
          <Divider />
          <MenuItem onClick={handleLogout}>
            <LogoutIcon sx={{ mr: 1, fontSize: 20 }} />
            Sign out
          </MenuItem>
        </Menu>

        {bottomNavigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.view;

          return (
            <Tooltip key={item.view} title={item.label} placement="right">
              <NavButton
                isActive={isActive}
                onClick={() => handleNavigation(item.view as NavigationView)}
              >
                <Icon />
              </NavButton>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
}

export default Sidebar;
