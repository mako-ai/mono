# Chunked Sync Architecture

## Overview

This document describes the chunked sync architecture implemented to handle long-running sync jobs that may exceed Cloud Run's timeout limits. The architecture allows sync jobs to be broken down into smaller chunks that execute as separate Inngest steps, preventing timeouts while maintaining state between chunks.

## Problem Statement

- Cloud Run has a maximum request timeout (typically 60 minutes)
- Some sync jobs may need to fetch millions of records, taking several hours
- Running the entire sync in a single step risks timeout failures
- Need to maintain progress and resume capability

## Solution

The solution implements resumable fetching at the connector level, allowing Inngest to:

1. Execute sync operations in chunks of ~10 API calls per step
2. Maintain state between chunks to resume where it left off
3. Create new Inngest steps for each chunk, resetting the timeout

## Architecture Components

### 1. BaseConnector Enhancement

Added new interfaces and methods to `BaseConnector`:

```typescript
interface FetchState {
  offset?: number;          // For offset-based pagination
  cursor?: string;          // For cursor-based pagination
  totalProcessed: number;   // Total records processed so far
  hasMore: boolean;         // Whether more data exists
  iterationsInChunk: number;// API calls made in this chunk
  metadata?: any;           // Connector-specific state
}

interface ResumableFetchOptions extends FetchOptions {
  maxIterations?: number;   // Max API calls per chunk (default: 10)
  state?: FetchState;       // Resume from previous state
}

// New methods
supportsResumableFetching(): boolean
fetchEntityChunk(options: ResumableFetchOptions): Promise<FetchState>
```

### 2. Connector Implementations

Each connector implements chunked fetching based on its pagination model:

#### Close Connector (Offset-based)

- Uses `_skip` parameter for pagination
- Tracks offset in state
- Handles special cases (custom_fields, users)

#### GraphQL Connector (Flexible)

- Supports both offset and cursor pagination
- Detects pagination type from query
- Maintains appropriate state

#### Stripe Connector (Cursor-based)

- Uses `starting_after` parameter
- Tracks last record ID as cursor
- Works with all Stripe entities

### 3. Sync Orchestrator

New `performSyncChunk` function that:

- Executes a single chunk of work
- Returns state for resumption
- Handles staging collections for full syncs
- Manages incremental sync dates

### 4. Inngest Integration

The sync job function now:

1. Checks if connector supports chunked execution
2. For each entity:
   - Executes chunks in a loop
   - Creates a new Inngest step for each chunk
   - Passes state between chunks
   - Continues until completion

## Configuration

### Chunk Size

Default: 10 API calls per chunk

Can be configured per job or connector:

- Adjust based on API rate limits
- Consider Cloud Run timeout settings
- Balance between chunk size and total steps

### Example Flow

```
Job Start
├── Check chunking support
├── Get entities to sync
└── For each entity:
    ├── sync-{entity}-chunk-0 (10 API calls)
    ├── sync-{entity}-chunk-1 (10 API calls)
    ├── sync-{entity}-chunk-2 (10 API calls)
    └── ... until complete
```

## Benefits

1. **Reliability**: No more timeout failures for large syncs
2. **Visibility**: Each chunk appears as a separate step in Inngest
3. **Resumability**: Can resume from any chunk if interrupted
4. **Flexibility**: Works with different pagination strategies
5. **Backwards Compatible**: Falls back to non-chunked for unsupported connectors

## Migration Guide

To add chunked support to a new connector:

1. Override `supportsResumableFetching()` to return `true`
2. Implement `fetchEntityChunk()` method
3. Track pagination state appropriately
4. Respect `maxIterations` limit
5. Return complete state for resumption

## Performance Considerations

- Each chunk adds overhead for step creation
- Database connections are created/closed per chunk
- Consider increasing chunk size for better performance if timeouts allow
- Monitor total step count for very large syncs

## Future Enhancements

1. Dynamic chunk sizing based on execution time
2. Parallel entity processing
3. Progress persistence for manual resume
4. Chunk-level retry strategies
