# MongoDB Connection Pooling Fix

## Problem

Sync jobs were failing with the error:

```
Error: Sync chunk failed: Topology is closed
    at performSyncChunk (/app/dist/sync/sync-orchestrator.js:142:15)
```

This was happening because:

1. Each sync operation/chunk was creating a new MongoDB connection
2. The connection was immediately closed after each chunk completed
3. No connection pooling was being used
4. If any async operations were still pending when the connection closed, the "Topology is closed" error would occur

## Root Cause

In the `sync-orchestrator.ts` file, connections were being created and destroyed for each operation:

```typescript
// BAD: Creating new connection for each chunk
const client = new MongoClient(destinationDb.connection.connection_string);
await client.connect();
const db = client.db(destinationDb.connection.database);

// ... perform operations ...

// BAD: Closing connection immediately
finally {
  if (mongoConnection) {
    await mongoConnection.client.close();
  }
}
```

## Solution

1. **Created a Connection Pool Manager** (`api/src/sync/destination-connection-pool.ts`):

   - Singleton pattern for managing destination database connections
   - Maintains persistent MongoDB connections with proper pooling settings
   - Automatically handles connection health checks and reconnection
   - Cleans up idle connections after 5 minutes
   - Proper error handling and connection lifecycle management

2. **Connection Pool Configuration**:

   ```typescript
   const connectionOptions: MongoClientOptions = {
     maxPoolSize: 10, // Maximum connections in pool
     minPoolSize: 2, // Minimum connections to maintain
     maxIdleTimeMS: 30000, // Close idle connections after 30s
     serverSelectionTimeoutMS: 10000,
     socketTimeoutMS: 0, // No socket timeout
     connectTimeoutMS: 10000,
     retryWrites: true, // Automatic retry for write operations
     retryReads: true, // Automatic retry for read operations
   };
   ```

3. **Updated Sync Orchestrator**:

   - Removed direct connection creation
   - Uses connection pool to get/reuse connections
   - No longer closes connections after each operation
   - Connections remain in the pool for reuse

4. **Added Graceful Shutdown**:
   - Properly closes all pooled connections on process termination
   - Prevents connection leaks

## Benefits

1. **Performance**: Reuses existing connections instead of creating new ones for each chunk
2. **Reliability**: No more "Topology is closed" errors
3. **Resource Efficiency**: Maintains optimal number of connections
4. **Scalability**: Can handle multiple concurrent sync operations
5. **Automatic Recovery**: Health checks and automatic reconnection on connection loss

## Testing

Run the test script to verify connection pooling:

```bash
cd api
npx tsx src/sync/test-connection-pool.ts <destination-database-id>
```

The test verifies:

- Multiple requests reuse the same connection
- Long-running operations work correctly
- No "Topology is closed" errors occur
- Connections are properly cleaned up

## Migration Notes

No database changes are required. The connection pooling is transparent to the rest of the application. All existing sync jobs will automatically benefit from the improved connection management.
