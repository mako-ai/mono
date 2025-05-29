import { Box, IconButton, Tooltip, styled } from "@mui/material";
import {
  ArticleOutlined as FileIcon,
  FolderOutlined as CollectionIcon,
  VisibilityOutlined as ViewIcon,
  SettingsOutlined as SettingsIcon,
  CloudUploadOutlined as DataSourceIcon,
} from "@mui/icons-material";
import { useNavigate, useLocation } from "react-router-dom";

const SidebarContainer = styled(Box)(({ theme }) => ({
  height: "100vh",
  borderRight: `1px solid ${theme.palette.divider}`,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: theme.spacing(0.5),
  gap: theme.spacing(0.5),
}));

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

const navigationItems = [
  { path: "/", icon: FileIcon, label: "Queries" },
  { path: "/views", icon: ViewIcon, label: "Views" },
  { path: "/collections", icon: CollectionIcon, label: "Collections" },
  { path: "/sources", icon: DataSourceIcon, label: "Data Sources" },
  { path: "/settings", icon: SettingsIcon, label: "Settings" },
];

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  return (
    <SidebarContainer>
      {navigationItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;

        return (
          <Tooltip key={item.path} title={item.label} placement="right">
            <NavButton
              isActive={isActive}
              onClick={() => handleNavigation(item.path)}
            >
              <Icon />
            </NavButton>
          </Tooltip>
        );
      })}
    </SidebarContainer>
  );
}

export default Sidebar;
