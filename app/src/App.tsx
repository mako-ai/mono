import { Box, styled } from "@mui/material";
// import { Routes, Route } from "react-router-dom"; // Remove react-router-dom imports
import Sidebar from "./components/Sidebar";
import { useAppStore } from "./store"; // Import the new store
import { useConsoleStore } from "./store/consoleStore";
import { useChatStore } from "./store";
// @ts-ignore – types will be available once the package is installed
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import Chat from "./components/Chat/Chat";
import DatabaseExplorer from "./components/DatabaseExplorer";
import ConsoleExplorer from "./components/ConsoleExplorer";
// @ts-ignore file exists
import DataSourceExplorer from "./components/DataSourceExplorer";
// @ts-ignore file exists
import Editor from "./components/Editor";

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

function App() {
  const { activeView, activeEditorContent } = useAppStore();
  const { addConsoleTab, setActiveConsole, consoleTabs } = useConsoleStore();

  const openOrFocusConsoleTab = (
    title: string,
    content: string,
    databaseId?: string,
    extraContextItems: any[] = [],
    filePath?: string
  ) => {
    // Try to find existing tab with same title and initial content path maybe; for simplicity match title.
    const existing = consoleTabs.find((t) =>
      filePath ? t.filePath === filePath : t.title === title
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
              const prefill = `db.${collection.name}.find({})`;
              const collectionContext = {
                id: `${dbId}-${collection.name}`,
                type: "collection",
                title: collection.name,
                content: JSON.stringify(collection, null, 2),
                metadata: { collectionName: collection.name },
              };
              openOrFocusConsoleTab(
                `Console - ${collection.name}`,
                prefill,
                dbId,
                [collectionContext]
              );
            }}
          />
        );
      case "consoles":
        return (
          <ConsoleExplorer
            onConsoleSelect={(path, content) => {
              openOrFocusConsoleTab(
                `Console: ${path}`,
                content,
                undefined,
                [],
                path
              );
            }}
          />
        );
      case "sources":
        return <DataSourceExplorer />;
      // Add others as needed
      default:
        return null;
    }
  };

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
        <Panel defaultSize={65} minSize={30}>
          <Editor />
        </Panel>

        <StyledHorizontalResizeHandle />

        <Panel defaultSize={20} minSize={10}>
          <Box
            sx={{
              height: "100%",
              overflow: "hidden",
              borderLeft: "1px solid",
              borderColor: "divider",
            }}
          >
            <Chat currentEditorContent={activeEditorContent} />
          </Box>
        </Panel>
      </PanelGroup>
    </Box>
  );
}

export default App;
