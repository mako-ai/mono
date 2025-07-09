# LogTape Implementation for Inngest Functions

## Overview

This document summarizes the implementation of LogTape as the logging solution for Inngest functions in the RevOps sync system.

## What is LogTape?

LogTape is a zero-dependency logging library for JavaScript/TypeScript that provides:

- Structured logging with properties
- Hierarchical categories
- Multiple sinks (console, file, etc.)
- Context-local storage support
- Universal runtime support (Node.js, Deno, Bun, browsers)

## Implementation Details

### 1. LogTape Configuration (`api/src/inngest/logging.ts`)

Created a comprehensive logging configuration that includes:

- **Async Local Storage**: Uses Node.js's `AsyncLocalStorage` for context management
- **Console Sink**: Configured with a custom formatter that:
  - Adds emoji indicators for log levels (🔍 debug, ℹ️ info, ⚠️ warning, ❌ error)
  - Includes timestamps in ISO format
  - Shows hierarchical categories
  - Pretty-prints properties when present
- **Database Sink**: Custom sink that:
  - Automatically stores job execution logs to MongoDB
  - Filters logs based on execution context
  - Runs asynchronously without blocking the application
  - Updates heartbeat timestamps for job monitoring
- **Logger Categories**: Defined three main categories:
  - `["inngest"]` - General Inngest logs
  - `["inngest", "sync"]` - Sync-specific logs
  - `["inngest", "execution"]` - Job execution logs (stored in both console and database)

### 2. Database Sink Implementation

The database sink is a key feature that automatically persists execution logs:

```typescript
export function getDatabaseSink(options: DatabaseSinkOptions = {}): Sink {
  return (record: LogRecord) => {
    // Extract execution context from properties
    const executionId = record.properties?.executionId;

    // Asynchronously store log to database
    void (async () => {
      await collection.updateOne(
        { _id: new Types.ObjectId(executionId) },
        {
          $push: { logs: logEntry },
          $set: { lastHeartbeat: new Date() },
        },
      );
    })();
  };
}
```

Features:

- **Non-blocking**: Uses void async pattern to avoid blocking log calls
- **Filtered**: Only stores logs with execution context
- **Error resilient**: Catches errors to prevent disrupting the application
- **Heartbeat updates**: Automatically updates job heartbeat on each log

### 3. LogTapeInngestLogger Class

Created a wrapper class that implements Inngest's logger interface:

- Supports `info()`, `warn()`, `error()`, and `debug()` methods
- Implements `child()` method for creating child loggers with bound properties
- Automatically includes bindings from parent loggers

### 4. Helper Functions

- `getSyncLogger(entity?)`: Creates a logger for sync operations, optionally scoped to a specific entity
- `getExecutionLogger(jobId, executionId)`: Creates a logger for specific job executions

### 5. Integration with Inngest Client

Updated the Inngest client to use LogTape:

```typescript
export const inngest = new Inngest({
  id: "revops-sync",
  name: "RevOps Sync",
  logger: new LogTapeInngestLogger(["inngest"]),
});
```

### 6. Structured Logging in Sync Functions

Replaced all console.log statements with structured logging calls:

#### Before:

```typescript
console.log(`🔄 Executing job ${jobId} (jitter: ${jitter}ms)`);
```

#### After:

```typescript
logger.info("Executing job with jitter", {
  jobId,
  jitterMs: jitter,
});
```

### 7. Automatic Database Logging

The sync job execution logger now works seamlessly with the database sink:

```typescript
// In sync job function
const syncLogger: SyncLogger = {
  log: (level: string, message: string, metadata?: any) => {
    const logData = {
      jobId,
      executionId, // This ensures logs are stored to the correct execution
      ...metadata,
    };

    // Log normally - database sink handles persistence automatically
    logger[level](message, logData);
  },
};
```

## Benefits

1. **Structured Data**: All logs now include structured metadata that can be easily parsed and analyzed
2. **Consistent Format**: All logs follow the same format with timestamps, levels, and categories
3. **Context Propagation**: Job IDs, execution IDs, and other context automatically flow through the logging hierarchy
4. **Better Debugging**: Structured properties make it easier to filter and search logs
5. **Performance**: LogTape has minimal overhead and zero dependencies
6. **Automatic Persistence**: Execution logs are automatically stored to the database without manual handling
7. **Separation of Concerns**: Logging logic is separated from business logic

## Example Log Output

### Console Output:

```
ℹ️ [2024-01-15T10:30:45.123Z] INFO    inngest.sync: Starting chunked sync for entity
   Properties: {
     "jobId": "65a4f3b2c1d2e3f4g5h6i7j8",
     "entity": "contacts"
   }

⚠️ [2024-01-15T10:30:46.456Z] WARNING inngest.sync.scheduler: Missed scheduled run
   Properties: {
     "jobId": "65a4f3b2c1d2e3f4g5h6i7j8",
     "missedRunTime": "2024-01-15T10:25:00.000Z"
   }
```

### Database Storage:

```json
{
  "_id": "65a4f3b2c1d2e3f4g5h6i7j8",
  "jobId": "65a4f3b2c1d2e3f4g5h6i7j8",
  "logs": [
    {
      "timestamp": "2024-01-15T10:30:45.123Z",
      "level": "info",
      "message": "Job execution started: incremental sync",
      "metadata": {
        "jobId": "65a4f3b2c1d2e3f4g5h6i7j8",
        "executionId": "65a4f3b2c1d2e3f4g5h6i7j9",
        "syncMode": "incremental",
        "category": "inngest.execution.65a4f3b2c1d2e3f4g5h6i7j8.65a4f3b2c1d2e3f4g5h6i7j9"
      }
    }
  ],
  "lastHeartbeat": "2024-01-15T10:30:45.123Z"
}
```

## Future Enhancements

1. **File Sink**: Add file-based logging for persistent storage outside of MongoDB
2. **Log Aggregation**: Integrate with services like CloudWatch or Datadog
3. **Log Levels**: Configure different log levels for different environments
4. **Performance Metrics**: Add performance tracking to logs
5. **Structured Query**: Build tools to query and analyze stored execution logs
6. **Log Rotation**: Implement automatic cleanup of old execution logs
