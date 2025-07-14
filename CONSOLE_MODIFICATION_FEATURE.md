# MongoDB AI Client - Console Modification Feature

## Overview

This feature allows the AI agent to directly modify the MongoDB query console, similar to how Cursor AI or GitHub Copilot can modify code. The agent can replace, append, or insert queries directly into the user's console editor.

## Architecture

### Backend Components

1. **Tool Definition** (`/api/src/routes/agent.ts`)

   - Added `modify_console` tool to the Agent SDK implementation
   - Tool supports three actions: `replace`, `append`, and `insert`
   - Emits special SSE event `console_modification` when executed

2. **System Prompt**
   - Guides the agent on when to use the console modification tool
   - Provides clear instructions for different user requests

### Frontend Components

1. **ConsoleVersionManager** (`/app/src/utils/ConsoleVersionManager.ts`)

   - Manages version history with undo/redo functionality
   - Persists versions to localStorage
   - Tracks source (user/ai) for each version
   - Limits history to 50 versions

2. **useMonacoConsole Hook** (`/app/src/hooks/useMonacoConsole.ts`)

   - Integrates Monaco editor with version management
   - Handles console modifications with visual feedback
   - Provides keyboard shortcuts for undo/redo
   - Manages user edit debouncing

3. **Console Component** (`/app/src/components/Console.tsx`)

   - Enhanced with version control UI
   - Exposes modification methods through ref
   - Shows undo/redo buttons and history badge

4. **Chat3 Component** (`/app/src/components/Chat3.tsx`)

   - Handles `console_modification` SSE events
   - Passes modifications to parent component

5. **AIConsole Component** (`/app/src/components/AIConsole.tsx`)
   - Integrates Console and Chat3 components
   - Manages console modifications
   - Provides version history dialog

## Usage

### Basic Integration

```tsx
import AIConsole from "./components/AIConsole";

function App() {
  const handleExecute = (query: string, databaseId?: string) => {
    // Execute the MongoDB query
  };

  return (
    <AIConsole
      initialContent=""
      onExecute={handleExecute}
      databases={databases}
      isExecuting={false}
    />
  );
}
```

### Standalone Console with Version Control

```tsx
import Console from "./components/Console";

function MyConsole() {
  const consoleRef = useRef<ConsoleRef>(null);

  const handleModification = () => {
    consoleRef.current?.applyModification({
      action: "replace",
      content: "db.users.find({ age: { $gt: 25 } }).limit(10)",
    });
  };

  return (
    <Console
      ref={consoleRef}
      enableVersionControl={true}
      onHistoryClick={() => console.log("Show history")}
      // ... other props
    />
  );
}
```

## User Interactions

### AI Commands

Users can ask the AI to:

1. **"Write a query to find all users over 25"**

   - AI uses `replace` action to set the entire console content
   - Console shows the query: `db.users.find({ age: { $gt: 25 } })`

2. **"Add a limit of 10 to my query"**

   - AI uses `append` action to add to existing content
   - Adds `.limit(10)` to the existing query

3. **"Fix the syntax error in my query"**
   - AI analyzes current console content
   - Uses `replace` action with corrected query

### Version Control

- **Undo**: Ctrl/Cmd + Z
- **Redo**: Ctrl/Cmd + Shift + Z
- **History**: Click the history button to see all versions
- **Restore**: Click on any version in history to restore it

## Visual Feedback

1. **Flash Animation**: Console flashes blue when AI modifies content
2. **Version Badges**: Shows count of versions in history
3. **Source Icons**: Different icons for user vs AI edits
4. **Current Version**: Highlighted in history dialog

## Technical Details

### SSE Event Format

```json
{
  "type": "console_modification",
  "modification": {
    "action": "replace",
    "content": "db.collection.find({})",
    "position": {
      "line": 1,
      "column": 1
    }
  }
}
```

### Version Storage Format

```typescript
{
  id: "v_1234567890_abc123",
  content: "db.users.find({})",
  timestamp: "2024-01-01T12:00:00Z",
  source: "ai",
  description: "AI replace",
  aiPrompt: "Find all users"
}
```

## Testing Scenarios

1. **Basic Modification**

   - Ask: "Write a query to count all documents in the orders collection"
   - Expected: Console updates with `db.orders.count()`

2. **Append Operation**

   - Start with: `db.users.find({ active: true })`
   - Ask: "Add sorting by created date"
   - Expected: `.sort({ createdAt: -1 })` appended

3. **Version History**

   - Make several modifications
   - Test undo/redo functionality
   - Verify history persistence across page reloads

4. **Error Handling**
   - Test with invalid modifications
   - Verify graceful handling of SSE failures
   - Check version limit enforcement

## Configuration

### Environment Variables

No additional environment variables required. Uses existing OpenAI configuration.

### Feature Flags

- `enableVersionControl`: Enable/disable version control UI
- `MAX_VERSIONS`: Maximum number of versions to keep (default: 50)

## Future Enhancements

1. **Diff View**: Show changes between versions
2. **Collaborative Editing**: Multi-user version tracking
3. **Export/Import**: Save and share version histories
4. **Smart Merge**: Merge AI suggestions with user edits
5. **Inline Suggestions**: Show AI modifications as overlays
