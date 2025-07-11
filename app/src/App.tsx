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
import { ConsoleModification } from "./hooks/useMonacoConsole";

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
  const { addConsoleTab, setActiveConsole, consoleTabs, activeConsoleId } =
    useConsoleStore();

  // Handle console modification from AI
  const handleConsoleModification = async (
    modification: ConsoleModification,
  ) => {
    console.log("App handleConsoleModification called with:", modification);

    // Always use the active console - this is what users expect
    // When they ask the AI to modify a console, they mean the one they're looking at
    let targetConsoleId = activeConsoleId;
    let isNewConsole = false;

    if (!targetConsoleId) {
      // If no active console, try to open one
      if (consoleTabs.length > 0) {
        // Focus the first available console
        targetConsoleId = consoleTabs[0].id;
        setActiveConsole(targetConsoleId);
      } else {
        // Create a new console if none exist
        isNewConsole = true;
        const id = addConsoleTab({
          title: "AI Query",
          content: "",
          initialContent: "",
        });
        targetConsoleId = id;
        setActiveConsole(id);
      }
    }

    // If we just created a new console, wait a bit for it to mount
    if (isNewConsole) {
      console.log("New console created, waiting for mount...");
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log("Using console ID for modification:", targetConsoleId);

    // Dispatch a custom event that the Editor component can listen to
    const event = new CustomEvent("console-modification", {
      detail: { consoleId: targetConsoleId, modification },
    });
    window.dispatchEvent(event);
  };

  const openOrFocusConsoleTab = (
    title: string,
    content: string,
    databaseId?: string,
    extraContextItems: any[] = [],
    filePath?: string,
    consoleId?: string, // Add optional consoleId parameter
  ) => {
    // Try to find existing tab by ID (for saved consoles) or by title (for new ones)
    const existing = consoleTabs.find(t =>
      consoleId ? t.id === consoleId : t.title === title,
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

    // Use provided consoleId or generate a new one
    const id =
      consoleId ||
      addConsoleTab({
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
            onConsoleSelect={(path, content, databaseId, consoleId) => {
              openOrFocusConsoleTab(
                path,
                content,
                databaseId,
                [],
                path,
                consoleId,
              );
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
              <Chat3 onConsoleModification={handleConsoleModification} />
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
