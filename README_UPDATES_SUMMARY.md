# README Files Update Summary

This document summarizes all the corrections and updates made to README files after the sync scripts refactoring.

## Files Updated

### 1. `/README.md` (Main Project README)

**Key Changes:**
- **Sync Commands**: Updated to use database-generated data source IDs instead of hardcoded names
  - Changed from `pnpm run sync close_spain` to `pnpm run sync <data_source_id>`
  - Added note about finding data source IDs in the web interface
- **Query Runner**: Updated to reference database IDs from web interface
- **Setup Instructions**: 
  - Added step to start development servers with `pnpm run dev`
  - Added step to configure data sources through web interface before syncing
- **Querying Data**: 
  - Removed Mongo Express references (not used)
  - Updated MongoDB connection string to `mongodb://localhost:27017/mako`
  - Added web interface as primary query method
- **Sample Queries**: Updated to reference `consoles/` folder instead of non-existent `queries/` folder
- **Project Structure**: 
  - Updated to reflect new `sync/` folder structure
  - Added detailed subdirectory structure including all actual folders
  - Removed references to obsolete files

### 2. `/api/src/connectors/README.md` (Connectors README)

**Key Changes:**
- **Directory Structure**: Updated to show complete structure including:
  - Sync service files (`*SyncService.ts`)
  - Module exports (`index.ts`)
  - Icon files (`icon.svg`) for web interface
- **Creating New Connectors**: Added steps for:
  - Creating sync service classes
  - Adding module exports
  - Including icon files for web interface

### 3. `/AUTH_README.md` (Authentication README)

**Key Changes:**
- **Environment Variables**: 
  - Updated database URL to `mongodb://localhost:27017/mako`
  - Updated application URLs to correct ports (3001 for API, 3000 for frontend)
- **OAuth Setup**: Updated redirect URIs to use correct API port (3001)
- **Database Setup**: Added Docker Compose as recommended method
- **Dependencies**: Fixed installation command from `pnpm install:all` to `pnpm install`

## Key Modernizations Applied

### 1. Database-Driven Architecture
- Removed all references to hardcoded configuration names
- Updated to use web interface-generated IDs for data sources and databases
- Emphasized the web interface as the primary configuration method

### 2. Correct File Paths
- Updated all folder references to match actual structure after refactoring
- Fixed references to moved files (sync scripts now in `sync/` folder)
- Updated query examples to use existing `consoles/` folder

### 3. Accurate Port Numbers
- API server: 3001 (was incorrectly listed as 8080 in some places)
- Frontend: 3000 (was incorrectly listed as 5173)
- MongoDB: 27017 (standard MongoDB port)

### 4. Modern Development Workflow
- Emphasized web interface for configuration
- Updated Docker Compose usage
- Corrected package manager commands

## Impact of Updates

These updates ensure that:

✅ **New users** can follow the README instructions successfully
✅ **All commands** reference actual existing files and folders  
✅ **Configuration examples** match the current database-driven architecture
✅ **Port numbers** are consistent throughout all documentation
✅ **File paths** are accurate after the refactoring
✅ **Development workflow** reflects the modern web interface approach

## Notes for Future Updates

When making changes to the codebase, remember to update:
1. Port numbers in all README files if they change
2. Folder structure diagrams when directories are added/removed
3. Command examples when CLI interfaces change
4. Configuration examples when moving between config systems