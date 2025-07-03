# Unified MongoDB Pool Migration Guide

## Overview

We've identified **8 different MongoDB connection implementations** across the codebase:

1. `mongodb-connection.ts` - MongoDBConnection class
2. `destination-connection-pool.ts` - DestinationConnectionPool
3. `query-runner.ts` - QueryRunner with own connections
4. `database-connection.service.ts` - DatabaseConnectionService
5. `database-data-source-manager.ts` - DatabaseDataSourceManager
6. `destination-manager.ts` - DatabaseDestinationManager
7. `query-executor.ts` - QueryExecutor
8. Direct mongoose connections

This fragmentation causes:

- **Connection leaks** and "Topology is closed" errors
- **Resource waste** from duplicate connections
- **Maintenance nightmares** with inconsistent configurations
- **Debugging difficulties** when issues arise

## Solution: Unified MongoDB Pool

The new `api/src/core/mongodb-pool.ts` provides a single, unified connection management system that handles:

- **Main application database** (via mongoose)
- **Destination databases** for sync operations
- **Data source databases** for queries
- **Workspace-specific databases**

### Features

- ✅ Connection pooling with health checks
- ✅ Automatic reconnection on failure
- ✅ Idle connection cleanup
- ✅ Graceful shutdown
- ✅ Support for encrypted connection strings
- ✅ Connection statistics and monitoring

## Migration Steps

### 1. Query Runner Migration

**Before:**

```typescript
// api/src/sync/query-runner.ts
private async getConnection(dataSourceId?: string) {
  const client = new MongoClient(dataSource.connection.connectionString!);
  await client.connect();
  const db = client.db(dataSource.connection.database);
  // ...
}
```

**After:**

```typescript
import { mongoPool } from "../core/mongodb-pool";

private async getConnection(dataSourceId?: string) {
  const sourceId = dataSourceId || this.currentDataSource;

  return mongoPool.getConnectionById(
    'datasource',
    sourceId,
    async (id) => {
      const dataSource = await Database.findById(id);
      if (!dataSource) return null;

      return {
        connectionString: dataSource.connection.connectionString!,
        database: dataSource.connection.database,
        encrypted: false,
      };
    }
  );
}
```

### 2. Database Connection Service Migration

**Before:**

```typescript
// api/src/services/database-connection.service.ts
private async createMongoDBConnection(database: IDatabase): Promise<MongoClient> {
  const connectionString = this.buildMongoDBConnectionString(database);
  const client = new MongoClient(connectionString);
  await client.connect();
  return client;
}
```

**After:**

```typescript
import { mongoPool } from "../core/mongodb-pool";

async getConnection(database: IDatabase): Promise<any> {
  if (database.type === 'mongodb') {
    const connection = await mongoPool.getConnection(
      'workspace',
      database._id.toString(),
      {
        connectionString: this.buildMongoDBConnectionString(database),
        database: database.connection.database!,
      }
    );
    return connection.client;
  }
  // ... handle other database types
}
```

### 3. MongoDB Connection Utility Migration

**Before:**

```typescript
// api/src/utils/mongodb-connection.ts
public async getDatabase(dataSourceId: string): Promise<Db> {
  const client = new MongoClient(dataSource.connection.connectionString, options);
  await client.connect();
  const db = client.db(dataSource.connection.database);
  // ...
}
```

**After:**

```typescript
import { mongoPool } from "../core/mongodb-pool";

public async getDatabase(dataSourceId: string): Promise<Db> {
  const connection = await mongoPool.getConnectionById(
    'datasource',
    dataSourceId,
    async (id) => {
      const dataSource = await Database.findById(id);
      if (!dataSource) return null;

      return {
        connectionString: dataSource.connection.connectionString,
        database: dataSource.connection.database,
        encrypted: true,
      };
    }
  );
  return connection.db;
}
```

### 4. Database Data Source Manager Migration

**Before:**

```typescript
// api/src/sync/database-data-source-manager.ts
private async connect(): Promise<Db> {
  this.client = new MongoClient(connectionString);
  await this.client.connect();
  return this.client.db(this.databaseName);
}
```

**After:**

```typescript
import { mongoPool } from "../core/mongodb-pool";

private async getDb(): Promise<Db> {
  const connection = await mongoPool.getMainConnection();
  return connection.db;
}
```

### 5. Destination Manager Migration

**Before:**

```typescript
// api/src/sync/destination-manager.ts
private async connect(): Promise<Db> {
  this.client = new MongoClient(connectionString);
  await this.client.connect();
  return this.client.db(this.databaseName);
}
```

**After:**

```typescript
import { mongoPool } from "../core/mongodb-pool";

private async getDb(): Promise<Db> {
  const connection = await mongoPool.getMainConnection();
  return connection.db;
}
```

### 6. Query Executor Migration

**Before:**

```typescript
// api/src/utils/query-executor.ts
if (databaseId) {
  dbInstance = await mongoConnection.getDatabase(databaseId);
} else {
  const db = mongoose.connection.db;
  // ...
}
```

**After:**

```typescript
import { mongoPool } from "../core/mongodb-pool";

if (databaseId) {
  const connection = await mongoPool.getConnectionById(
    "datasource",
    databaseId,
    async id => {
      // lookup function
    },
  );
  dbInstance = connection.db;
} else {
  const connection = await mongoPool.getMainConnection();
  dbInstance = connection.db;
}
```

## API Reference

### Connection Contexts

- `'main'` - Main application database
- `'destination'` - Destination databases for sync
- `'datasource'` - Data source databases
- `'workspace'` - Workspace-specific databases

### Key Methods

```typescript
// Get or create a connection
mongoPool.getConnection(
  context: ConnectionContext,
  identifier: string,
  config?: ConnectionConfig,
  options?: MongoClientOptions
): Promise<{ client: MongoClient; db: Db }>

// Get main application connection
mongoPool.getMainConnection(): Promise<{ client: MongoClient; db: Db }>

// Get connection by ID with lookup
mongoPool.getConnectionById(
  context: ConnectionContext,
  databaseId: string,
  lookupFn: (id: string) => Promise<ConnectionConfig | null>
): Promise<{ client: MongoClient; db: Db }>

// Close specific connection
mongoPool.closeConnection(context: ConnectionContext, identifier: string): Promise<void>

// Close all connections
mongoPool.closeAll(): Promise<void>

// Get statistics
mongoPool.getStats(): ConnectionStats
```

## Benefits After Migration

1. **No more "Topology is closed" errors** - Connections are properly pooled and reused
2. **Better performance** - Connection reuse instead of constant creation/destruction
3. **Easier debugging** - All connections in one place with statistics
4. **Consistent configuration** - Single source of connection options
5. **Automatic cleanup** - Idle connections are automatically closed
6. **Graceful shutdown** - All connections properly closed on exit

## Testing

After migration, test with:

```bash
# Run the unified pool test
cd api
npx tsx src/core/test-unified-pool.ts

# Monitor connections
npx tsx src/core/monitor-connections.ts
```

## Cleanup

After successful migration, delete these files:

- `api/src/sync/destination-connection-pool.ts`
- `api/src/utils/mongodb-connection.ts` (if fully migrated)
- Any other redundant connection managers

## Notes

- The unified pool handles encryption/decryption automatically
- Connection pooling settings are optimized for typical workloads
- Health checks ensure dead connections are automatically replaced
- The pool is a singleton - no need to worry about multiple instances
