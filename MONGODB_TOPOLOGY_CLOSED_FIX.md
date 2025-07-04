# MongoDB "Topology is closed" Error Fix

## Problem

Your sync scripts were failing with the error:

```
Error: Sync chunk failed: Topology is closed
    at performSyncChunk (/app/dist/sync/sync-orchestrator.js:144:15)
[cause]: {
  "name": "MongoTopologyClosedError",
  "message": "Topology is closed"
}
```

## Root Cause

The issue was caused by conflicting MongoDB connection management strategies:

1. **Unified MongoDB Pool**: The `sync-orchestrator.ts` uses a unified connection pool (`mongoPool`) designed to maintain persistent connections and reuse them across operations.

2. **Individual Connection Management**: Both `destination-manager.ts` and `database-data-source-manager.ts` were creating their own MongoDB connections and immediately closing them after each operation:

```typescript
// OLD CODE - Problem pattern:
async getDestination(id: string): Promise<any> {
  try {
    await this.connect();  // Creates new connection
    // ... do work ...
  } finally {
    await this.disconnect();  // CLOSES connection immediately!
  }
}
```

This caused the "Topology is closed" error because:

- The managers would create a connection, use it, then close it
- But the unified pool might be sharing or expecting to use the same connection
- When one component closed the connection, other operations still in progress would fail

## Solution

Updated both `destination-manager.ts` and `database-data-source-manager.ts` to use the unified MongoDB pool instead of managing their own connections:

### 1. Destination Manager Changes

```typescript
// NEW CODE - Using unified pool:
private async getDb(): Promise<Db> {
  this.initialize();

  // Use the unified pool to get the main database connection
  const connection = await mongoPool.getConnection("main", "app", {
    connectionString: process.env.DATABASE_URL!,
    database: this.databaseName,
    encrypted: false,
  });

  return connection.db;
}

async getDestination(id: string): Promise<any> {
  const db = await this.getDb();  // Gets connection from pool
  // ... do work ...
  // No disconnect() - connection stays in pool!
}
```

### 2. Database Data Source Manager Changes

Similar changes were made to use `mongoPool.getConnection()` instead of creating/closing individual connections.

## Benefits

1. **No More "Topology is closed" Errors**: Connections remain open in the pool and are properly managed
2. **Better Performance**: Reuses existing connections instead of creating new ones for each operation
3. **Consistent Connection Management**: All components use the same unified pool
4. **Automatic Recovery**: The pool handles connection health checks and reconnection

## Next Steps

1. **Restart your services** to ensure the changes take effect:

   ```bash
   # If using Docker:
   docker-compose restart api

   # Or if running locally:
   # Stop and restart your API service
   ```

2. **Monitor your sync jobs** to verify the error is resolved

3. **Check logs** for any new issues that might arise

## Prevention

To prevent similar issues in the future:

- Always use the unified MongoDB pool (`mongoPool`) for database connections
- Never create individual MongoDB connections that are closed immediately after use
- Follow the connection pooling patterns established in the codebase

The unified pool is designed to handle:

- Connection pooling with proper sizing
- Health checks and automatic reconnection
- Idle connection cleanup
- Graceful shutdown
