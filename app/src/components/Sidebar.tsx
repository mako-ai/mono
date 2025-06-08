import {
  Box,
  Button,
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
  Group as GroupIcon,
} from "@mui/icons-material";
import {
  SquareChevronRight as ConsoleIcon,
  Database as DatabaseIcon,
} from "lucide-react";
import { useAppStore, AppView } from "../store";
import { useConsoleStore } from "../store/consoleStore";
import { useAuth } from "../contexts/auth-context";
import { useState } from "react";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useWorkspace } from "../contexts/workspace-context";

const NavButton = styled(Button, {
  shouldForwardProp: (prop) => prop !== "isActive",
})<{ isActive?: boolean }>(({ theme, isActive }) => ({
  minWidth: 40,
  width: 40,
  height: 40,
  padding: 0,
  borderRadius: theme.shape.borderRadius,
  backgroundColor: isActive ? theme.palette.action.selected : "transparent",
  color: isActive ? theme.palette.primary.main : theme.palette.text.secondary,
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
type NavigationView = AppView | "views" | "settings" | "members";

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
  const { currentWorkspace } = useWorkspace();
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
    if (view === "settings" || view === "sources" || view === "members") {
      const { findTabByKind, addConsoleTab, setActiveConsole } =
        useConsoleStore.getState();

      const existing = findTabByKind(
        view === "settings"
          ? "settings"
          : view === "sources"
            ? "sources"
            : "members"
      );
      if (existing) {
        setActiveConsole(existing.id);
      } else {
        const id = addConsoleTab({
          title:
            view === "settings"
              ? "Settings"
              : view === "sources"
                ? "Data Sources"
                : "Members",
          content: "", // Will be replaced with actual forms later
          initialContent: "",
          kind:
            view === "settings"
              ? "settings"
              : view === "sources"
                ? "sources"
                : "members",
        });
        setActiveConsole(id);
      }
    }
  };

  // Add members navigation if user has admin/owner role
  const userCanManageMembers =
    currentWorkspace &&
    (currentWorkspace.role === "owner" || currentWorkspace.role === "admin");

  return (
    <Box
      sx={{
        width: 52,
        height: "100vh",
        borderRight: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* Navigation Items */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            p: 0.5,
            gap: 0.5,
            alignItems: "center",
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
                  <Icon size={20} />
                </NavButton>
              </Tooltip>
            );
          })}

          {/* Members navigation - only show if user has permission */}
          {userCanManageMembers && (
            <Tooltip title="Workspace Members" placement="right">
              <NavButton onClick={() => handleNavigation("members")}>
                <GroupIcon />
              </NavButton>
            </Tooltip>
          )}
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            p: 0.25,
            gap: 0.25,
            alignItems: "center",
          }}
        >
          {/* Settings */}
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

          {/* User Menu */}
          <Tooltip title="User Menu" placement="right">
            <NavButton onClick={handleUserMenuOpen}>
              <UserIcon />
            </NavButton>
          </Tooltip>

          <Menu
            anchorEl={userMenuAnchorEl}
            open={isUserMenuOpen}
            onClose={handleUserMenuClose}
            anchorOrigin={{
              vertical: "top",
              horizontal: "right",
            }}
            transformOrigin={{
              vertical: "bottom",
              horizontal: "right",
            }}
          >
            {/* Workspace Switcher in User Menu */}
            <Box sx={{ px: 2, py: 1, minWidth: 250 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Workspace
              </Typography>
              <WorkspaceSwitcher />
            </Box>
            <Divider />

            <Box sx={{ px: 2, py: 1 }}>
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
        </Box>
      </Box>
    </Box>
  );
}

export default Sidebar;
