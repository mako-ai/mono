import { Box, styled } from "@mui/material";
import { Routes, Route, useParams } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { useAppStore, useChatStore } from "./store";
import { useConsoleStore } from "./store/consoleStore";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import Chat3 from "./components/Chat3";
import DatabaseExplorer from "./components/DatabaseExplorer";
import ConsoleExplorer from "./components/ConsoleExplorer";
import DataSourceExplorer from "./components/DataSourceExplorer";
import Editor from "./components/Editor";
import { SyncJobsExplorer } from "./components/SyncJobsExplorer";
import { AuthWrapper } from "./components/AuthWrapper";
import { AcceptInvite } from "./components/AcceptInvite";
import { WorkspaceProvider } from "./contexts/workspace-context";

// Styled PanelResizeHandle components (moved from Databases.tsx/Consoles.tsx)
const StyledHorizontalResizeHandle = styled(PanelResizeHandle)(({ theme }) => ({
  width: "4px",
  background: theme.palette.divider,
  cursor: "col-resize",
  transition: "background-color 0.2s ease",
  "&:hover": {
    backgroundColor: theme.palette.primary.main,
  },
}));

// Component for the invite page route
function InvitePage() {
  const { token } = useParams<{ token: string }>();

  if (!token) {
    return <div>Invalid invitation link</div>;
  }

  return (
    <WorkspaceProvider>
      <AcceptInvite token={token} />
    </WorkspaceProvider>
  );
}

// Main application component (extracted from original App)
function MainApp() {
  const { activeView } = useAppStore();
  const { addConsoleTab, setActiveConsole, consoleTabs } = useConsoleStore();

  const openOrFocusConsoleTab = (
    title: string,
    content: string,
    databaseId?: string,
    extraContextItems: any[] = [],
    filePath?: string,
  ) => {
    // Try to find existing tab with same title and initial content path maybe; for simplicity match title.
    const existing = consoleTabs.find(t =>
      filePath ? t.filePath === filePath : t.title === title,
    );
    if (existing) {
      setActiveConsole(existing.id);
      useChatStore.getState().ensureContextItems([
        {
          id: existing.id,
          type: "console",
          title,
          content,
          metadata: { consoleId: existing.id, filePath },
        },
        ...extraContextItems,
      ]);
      return;
    }
    const id = addConsoleTab({
      title,
      content,
      initialContent: content,
      databaseId,
      filePath,
    });
    setActiveConsole(id);

    useChatStore.getState().ensureContextItems([
      {
        id,
        type: "console",
        title,
        content,
        metadata: { consoleId: id, filePath },
      },
      ...extraContextItems,
    ]);
  };

  // Left pane content renderer
  const renderLeftPane = () => {
    switch (activeView) {
      case "databases":
        return (
          <DatabaseExplorer
            onCollectionClick={(dbId, collection) => {
              const prefill = `db.getCollection("${collection.name}").find({}).limit(500)`;
              openOrFocusConsoleTab(collection.name, prefill, dbId, [
                {
                  id: "collection-" + collection.name,
                  type: "collection",
                  title: collection.name,
                  content: `Collection: ${collection.name}`,
                  metadata: {
                    databaseId: dbId,
                    collectionName: collection.name,
                  },
                },
              ]);
            }}
          />
        );
      case "consoles":
        return (
          <ConsoleExplorer
            onConsoleSelect={(path, content) => {
              openOrFocusConsoleTab(path, content, undefined, [], path);
            }}
          />
        );
      case "sources":
        return <DataSourceExplorer />;
      case "sync-jobs":
        return <SyncJobsExplorer />;
      // Add others as needed
      default:
        return null;
    }
  };

  return (
    <AuthWrapper>
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

        <PanelGroup
          direction="horizontal"
          style={{ height: "100%", width: "100%" }}
        >
          <Panel defaultSize={15} minSize={10}>
            <Box sx={{ height: "100%", overflow: "hidden" }}>
              {renderLeftPane()}
            </Box>
          </Panel>

          <StyledHorizontalResizeHandle />

          {/* Editor + Results vertical layout inside Editor component */}
          <Panel defaultSize={30} minSize={30}>
            <Editor />
          </Panel>

          <StyledHorizontalResizeHandle />

          <Panel defaultSize={30} minSize={10}>
            <Box
              sx={{
                height: "100%",
                overflow: "hidden",
                borderLeft: "1px solid",
                borderColor: "divider",
              }}
            >
              <Chat3 />
            </Box>
          </Panel>
        </PanelGroup>
      </Box>
    </AuthWrapper>
  );
}

function App() {
  return (
    <Routes>
      {/* Invite route - no authentication required */}
      <Route path="/invite/:token" element={<InvitePage />} />

      {/* Main app route - authentication required */}
      <Route path="/*" element={<MainApp />} />
    </Routes>
  );
}

export default App;
