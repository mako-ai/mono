import { MongoClient, Db, MongoClientOptions } from "mongodb";
import { Client as PgClient } from "pg";
import * as mysql from "mysql2/promise";
import { Database as SqliteDatabase } from "sqlite3";
import { open } from "sqlite";
import { ConnectionPool } from "mssql";
import { IDatabase } from "../database/workspace-schema";

export interface QueryResult {
  success: boolean;
  data?: any;
  error?: string;
  rowCount?: number;
  fields?: any[];
}

// Types for different connection contexts
export type ConnectionContext =
  | "main" // Main application database
  | "destination" // Destination databases for sync
  | "datasource" // Data source databases
  | "workspace"; // Workspace-specific databases

export interface ConnectionConfig {
  connectionString: string;
  database: string;
}

interface PooledConnection {
  client: MongoClient;
  db: Db;
  lastUsed: Date;
  context: ConnectionContext;
  identifier: string;
}

/**
 * Enhanced Database Connection Service
 *
 * Provides unified connection management for all database types with:
 * - Advanced MongoDB connection pooling with health checks
 * - Multi-database support (PostgreSQL, MySQL, SQLite, MSSQL)
 * - Automatic reconnection and idle cleanup
 * - Unified query execution interface
 */
export class DatabaseConnectionService {
  private connections: Map<string, any> = new Map();

  // MongoDB-specific pooling
  private mongoConnections: Map<string, PooledConnection> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly maxIdleTime = 15 * 60 * 1000; // 15 minutes to be safe

  // Default MongoDB connection options
  private readonly defaultMongoOptions: MongoClientOptions = {
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 900000, // 15 minutes
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 0,
    connectTimeoutMS: 10000,
    retryWrites: true,
    retryReads: true,
  };

  constructor() {
    // Start cleanup interval for MongoDB connections
    this.cleanupInterval = setInterval(() => {
      void this.cleanupIdleMongoConnections();
    }, 60000); // Every minute
  }

  /**
   * Test database connection
   */
  async testConnection(
    database: IDatabase,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      switch (database.type) {
        case "mongodb":
          return await this.testMongoDBConnection(database);
        case "postgresql":
          return await this.testPostgreSQLConnection(database);
        case "mysql":
          return await this.testMySQLConnection(database);
        case "sqlite":
          return await this.testSQLiteConnection(database);
        case "mssql":
          return await this.testMSSQLConnection(database);
        default:
          return {
            success: false,
            error: `Unsupported database type: ${database.type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Execute query on database
   */
  async executeQuery(
    database: IDatabase,
    query: any,
    options?: any,
  ): Promise<QueryResult> {
    try {
      switch (database.type) {
        case "mongodb":
          return await this.executeMongoDBQuery(database, query, options);
        case "postgresql":
          return await this.executePostgreSQLQuery(database, query);
        case "mysql":
          return await this.executeMySQLQuery(database, query);
        case "sqlite":
          return await this.executeSQLiteQuery(database, query);
        case "mssql":
          return await this.executeMSSQLQuery(database, query);
        default:
          return {
            success: false,
            error: `Unsupported database type: ${database.type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get database connection
   */
  async getConnection(database: IDatabase): Promise<any> {
    const key = database._id.toString();

    // For MongoDB, use advanced pooling
    if (database.type === "mongodb") {
      const connection = await this.getMongoConnection(
        "datasource",
        database._id.toString(),
        {
          connectionString: this.buildMongoDBConnectionString(database),
          database: database.connection.database || "",
        },
      );
      return connection.client;
    }

    // For other database types, use basic caching
    if (this.connections.has(key)) {
      return this.connections.get(key);
    }

    let connection: any;

    switch (database.type) {
      case "postgresql":
        connection = await this.createPostgreSQLConnection(database);
        break;
      case "mysql":
        connection = await this.createMySQLConnection(database);
        break;
      case "sqlite":
        connection = await this.createSQLiteConnection(database);
        break;
      case "mssql":
        connection = await this.createMSSQLConnection(database);
        break;
      default:
        throw new Error(`Unsupported database type: ${database.type}`);
    }

    this.connections.set(key, connection);
    return connection;
  }

  /**
   * Close database connection
   */
  async closeConnection(databaseId: string): Promise<void> {
    // Try to close MongoDB connection through pool
    await this.closeMongoConnection("datasource", databaseId);

    // Also handle any non-MongoDB connections in the local cache
    const connection = this.connections.get(databaseId);
    if (connection) {
      try {
        if (connection.end) {
          await connection.end();
        } else if (connection.close) {
          await connection.close();
        }
      } catch (error) {
        console.error("Error closing cached connection:", error);
      } finally {
        this.connections.delete(databaseId);
      }
    }
  }

  /**
   * Close all connections
   */
  async closeAllConnections(): Promise<void> {
    // Close MongoDB connections
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const mongoPromises: Promise<void>[] = [];
    for (const [key, connection] of this.mongoConnections.entries()) {
      mongoPromises.push(
        connection.client
          .close()
          .then(() => console.log(`Closed MongoDB connection: ${key}`))
          .catch(error =>
            console.error(`Error closing MongoDB ${key}:`, error),
          ),
      );
    }
    await Promise.all(mongoPromises);
    this.mongoConnections.clear();

    // Close other connections
    const otherPromises = Array.from(this.connections.keys()).map(id =>
      this.closeConnection(id),
    );
    await Promise.all(otherPromises);
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    mongodb: number;
    other: number;
    mongoConnections: Array<{
      key: string;
      context: ConnectionContext;
      identifier: string;
      lastUsed: Date;
    }>;
  } {
    const mongoConnections = Array.from(this.mongoConnections.entries()).map(
      ([key, conn]) => ({
        key,
        context: conn.context,
        identifier: conn.identifier,
        lastUsed: conn.lastUsed,
      }),
    );

    return {
      totalConnections: this.mongoConnections.size + this.connections.size,
      mongodb: this.mongoConnections.size,
      other: this.connections.size,
      mongoConnections,
    };
  }

  // MongoDB Advanced Pooling Methods
  private async getMongoConnection(
    context: ConnectionContext,
    identifier: string,
    config: ConnectionConfig,
    options?: MongoClientOptions,
  ): Promise<{ client: MongoClient; db: Db }> {
    const key = this.getMongoConnectionKey(context, identifier);

    // Check existing connection
    const existing = this.mongoConnections.get(key);
    if (existing) {
      try {
        // Health check with timeout
        const pingPromise = existing.client.db("admin").command({ ping: 1 });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Health check timeout")), 2000),
        );
        await Promise.race([pingPromise, timeoutPromise]);

        // Update last used time since we're actively using this connection
        existing.lastUsed = new Date();
        return { client: existing.client, db: existing.db };
      } catch (error) {
        console.warn(
          `MongoDB connection unhealthy for ${key}, reconnecting...`,
          error,
        );
        this.mongoConnections.delete(key);
        try {
          await existing.client.close();
        } catch {
          // Ignore close errors
        }
      }
    }

    // Create new connection
    return this.createMongoConnection(context, identifier, config, options);
  }

  private async createMongoConnection(
    context: ConnectionContext,
    identifier: string,
    config: ConnectionConfig,
    customOptions?: MongoClientOptions,
  ): Promise<{ client: MongoClient; db: Db }> {
    const key = this.getMongoConnectionKey(context, identifier);
    console.log(`🔌 Creating pooled MongoDB connection: ${key}`);

    // Merge options
    const options = { ...this.defaultMongoOptions, ...customOptions };

    // Create client
    const client = new MongoClient(config.connectionString, options);
    await client.connect();

    // Handle database name extraction
    const databaseName = config.database;

    const db = client.db(databaseName);

    // Store in pool
    const pooledConnection: PooledConnection = {
      client,
      db,
      lastUsed: new Date(),
      context,
      identifier,
    };
    this.mongoConnections.set(key, pooledConnection);

    // Set up monitoring
    client.on("close", () => {
      console.log(`MongoDB connection closed: ${key}`);
      this.mongoConnections.delete(key);
    });

    client.on("error", error => {
      console.error(`MongoDB connection error for ${key}:`, error);
      this.mongoConnections.delete(key);
    });

    client.on("topologyClosed", () => {
      console.log(`MongoDB topology closed: ${key}`);
      this.mongoConnections.delete(key);
    });

    console.log(`✅ MongoDB connected: ${key}`);
    return { client, db };
  }

  private getMongoConnectionKey(
    context: ConnectionContext,
    identifier: string,
  ): string {
    return `${context}:${identifier}`;
  }

  private async cleanupIdleMongoConnections(): Promise<void> {
    const now = new Date();
    const toRemove: string[] = [];

    for (const [key, connection] of this.mongoConnections.entries()) {
      const idleTime = now.getTime() - connection.lastUsed.getTime();
      if (idleTime > this.maxIdleTime) {
        toRemove.push(key);
      }
    }

    for (const key of toRemove) {
      const connection = this.mongoConnections.get(key);
      if (connection) {
        try {
          await connection.client.close();
          console.log(`Closed idle MongoDB connection: ${key}`);
        } catch (error) {
          console.error(`Error closing idle MongoDB connection ${key}:`, error);
        }
        this.mongoConnections.delete(key);
      }
    }
  }

  private async closeMongoConnection(
    context: ConnectionContext,
    identifier: string,
  ): Promise<void> {
    const key = this.getMongoConnectionKey(context, identifier);
    const connection = this.mongoConnections.get(key);

    if (connection) {
      try {
        await connection.client.close();
        console.log(`Closed MongoDB connection: ${key}`);
      } catch (error) {
        console.error(`Error closing MongoDB connection ${key}:`, error);
      }
      this.mongoConnections.delete(key);
    }
  }

  // Utility methods
  private extractDatabaseName(connectionString: string): string | null {
    try {
      const url = new URL(connectionString);
      const pathname = url.pathname;
      if (pathname && pathname.length > 1) {
        return pathname.substring(1).split("?")[0];
      }
    } catch {
      // Invalid URL
    }
    return null;
  }

  // Convenience methods for MongoDB connections
  /**
   * Get connection for main application database
   */
  async getMainConnection(): Promise<{ client: MongoClient; db: Db }> {
    const connectionString = process.env.DATABASE_URL;
    const databaseName =
      process.env.DATABASE_NAME ||
      this.extractDatabaseName(connectionString!) ||
      "mako";

    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    const connection = await this.getMongoConnection("main", "app", {
      connectionString,
      database: databaseName,
    });

    // Wrap the database for automatic usage tracking
    const key = this.getMongoConnectionKey("main", "app");
    const wrappedDb = this.wrapDatabaseWithUsageTracking(connection.db, key);
    return { client: connection.client, db: wrappedDb };
  }

  /**
   * Get connection by database ID (for destinations/datasources)
   */
  async getConnectionById(
    context: ConnectionContext,
    databaseId: string,
    lookupFn: (id: string) => Promise<ConnectionConfig | null>,
  ): Promise<{ client: MongoClient; db: Db }> {
    // Try to get from pool first
    const key = this.getMongoConnectionKey(context, databaseId);
    const existing = this.mongoConnections.get(key);
    if (existing) {
      try {
        await existing.client.db("admin").command({ ping: 1 });
        existing.lastUsed = new Date();

        // Return wrapped database for automatic usage tracking
        const wrappedDb = this.wrapDatabaseWithUsageTracking(existing.db, key);
        return { client: existing.client, db: wrappedDb };
      } catch {
        // Continue to recreate
      }
    }

    // Lookup configuration
    const config = await lookupFn(databaseId);
    if (!config) {
      throw new Error(`Database '${databaseId}' not found`);
    }

    const connection = await this.getMongoConnection(
      context,
      databaseId,
      config,
    );

    // Wrap the database for automatic usage tracking
    const wrappedDb = this.wrapDatabaseWithUsageTracking(connection.db, key);
    return { client: connection.client, db: wrappedDb };
  }

  /**
   * Update the last used time for a connection to keep it alive
   */
  updateConnectionLastUsed(
    context: ConnectionContext,
    identifier: string,
  ): void {
    const key = this.getMongoConnectionKey(context, identifier);
    const connection = this.mongoConnections.get(key);
    if (connection) {
      connection.lastUsed = new Date();
    }
  }

  /**
   * Wrap a MongoDB database object with automatic usage tracking
   * Every time the database is used, it updates the connection's lastUsed timestamp
   */
  private wrapDatabaseWithUsageTracking(db: Db, connectionKey: string): Db {
    return new Proxy(db, {
      get: (target, prop, receiver) => {
        // Update lastUsed timestamp whenever any database operation is accessed
        const connection = this.mongoConnections.get(connectionKey);
        if (connection) {
          connection.lastUsed = new Date();
        }

        // Return the original property/method
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  // MongoDB specific methods
  private async testMongoDBConnection(
    database: IDatabase,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const connectionString = this.buildMongoDBConnectionString(database);

      // Use unified pool for testing
      const connection = await this.getMongoConnection(
        "datasource",
        database._id.toString(),
        {
          connectionString,
          database: database.connection.database || "",
        },
      );

      // Test the connection
      await connection.db.admin().ping();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "MongoDB connection failed",
      };
    }
  }

  private buildMongoDBConnectionString(database: IDatabase): string {
    const conn = database.connection;

    // If connection string is provided, use it directly
    if (conn.connectionString) {
      return conn.connectionString;
    }

    // Build connection string from individual parameters
    let connectionString = "mongodb://";

    if (conn.username && conn.password) {
      connectionString += `${encodeURIComponent(conn.username)}:${encodeURIComponent(conn.password)}@`;
    }

    connectionString += `${conn.host || "localhost"}:${conn.port || 27017}`;

    if (conn.database) {
      connectionString += `/${conn.database}`;
    }

    const params: string[] = [];

    if (conn.authSource) {
      params.push(`authSource=${conn.authSource}`);
    }

    if (conn.replicaSet) {
      params.push(`replicaSet=${conn.replicaSet}`);
    }

    if (conn.ssl) {
      params.push("ssl=true");
    }

    if (params.length > 0) {
      connectionString += `?${params.join("&")}`;
    }

    return connectionString;
  }

  private async executeMongoDBQuery(
    database: IDatabase,
    query: any,
    _options?: any,
  ): Promise<QueryResult> {
    const client = (await this.getConnection(database)) as MongoClient;
    const db = client.db(database.connection.database);

    try {
      // Handle different MongoDB operations
      if (typeof query === "string") {
        // Parse JavaScript-style query
        const result = await this.executeMongoDBJavaScriptQuery(db, query);
        return { success: true, data: result };
      } else if (query.collection && query.operation) {
        // Handle structured query
        const collection = db.collection(query.collection);
        let result: any;

        switch (query.operation) {
          case "find":
            result = await collection
              .find(query.filter || {}, query.options || {})
              .toArray();
            break;
          case "findOne":
            result = await collection.findOne(
              query.filter || {},
              query.options || {},
            );
            break;
          case "aggregate":
            result = await collection
              .aggregate(query.pipeline || [], query.options || {})
              .toArray();
            break;
          case "insertMany":
            result = await collection.insertMany(
              query.documents || [],
              query.options || {},
            );
            break;
          case "updateMany":
            result = await collection.updateMany(
              query.filter || {},
              query.update || {},
              query.options || {},
            );
            break;
          case "deleteMany":
            result = await collection.deleteMany(
              query.filter || {},
              query.options || {},
            );
            break;
          case "updateOne":
            result = await collection.updateOne(
              query.filter || {},
              query.update || {},
              query.options || {},
            );
            break;
          case "deleteOne":
            result = await collection.deleteOne(
              query.filter || {},
              query.options || {},
            );
            break;
          default:
            return {
              success: false,
              error: `Unsupported MongoDB operation: ${query.operation}`,
            };
        }

        return { success: true, data: result };
      } else {
        return { success: false, error: "Invalid MongoDB query format" };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "MongoDB query failed",
      };
    }
  }

  private async executeMongoDBJavaScriptQuery(
    db: Db,
    query: string,
  ): Promise<any> {
    console.log("🔍 Executing query:", query.substring(0, 200) + "...");

    // Track async index operations to surface errors even if not awaited by the user
    const trackedIndexPromises: Promise<any>[] = [];
    const trackedIndexErrors: any[] = [];

    // Wrap a collection (and returned objects) to intercept ANY async calls and attach handlers
    const wrapCollection = (collection: any) =>
      new Proxy(collection, {
        get: (target, prop, receiver) => {
          const original = Reflect.get(target, prop, receiver);
          if (typeof original === "function") {
            return (...args: any[]) => {
              try {
                const result = original.apply(target, args);
                if (result && typeof result.then === "function") {
                  // Attach a handler so rejections are observed and recorded
                  result.catch((err: any) => {
                    trackedIndexErrors.push(err);
                  });
                  trackedIndexPromises.push(result);
                }
                // If the result is another driver object, wrap it too
                if (result && typeof result === "object") {
                  return wrapCollection(result);
                }
                return result;
              } catch (err) {
                trackedIndexErrors.push(err);
                throw err;
              }
            };
          }
          if (original && typeof original === "object") {
            return wrapCollection(original);
          }
          return original;
        },
      });

    // Create a proxy db object that can access any collection dynamically
    const dbProxy = new Proxy(db, {
      get: (target, prop) => {
        // First check if this property exists on the target (database methods)
        if (prop in target) {
          const value = (target as any)[prop];
          // If it's the collection() factory, wrap returned collection
          if (prop === "collection" && typeof value === "function") {
            return (name: string, options?: any) => {
              const col = value.call(target, name, options);
              return wrapCollection(col);
            };
          }
          if (typeof value === "function") {
            // Wrap db-level async methods to observe errors
            return (...args: any[]) => {
              const fn = value.bind(target);
              const result = fn(...args);
              if (result && typeof result.then === "function") {
                result.catch((err: any) => {
                  trackedIndexErrors.push(err);
                });
                trackedIndexPromises.push(result);
              }
              if (result && typeof result === "object") {
                return wrapCollection(result);
              }
              return result;
            };
          }
          if (value && typeof value === "object") {
            return wrapCollection(value);
          }
          return value;
        }

        // Mongo-shell helper for db.getCollectionInfos([filter], [options])
        if (prop === "getCollectionInfos") {
          return (filter?: any, options?: any) => {
            return (target as Db).listCollections(filter, options).toArray();
          };
        }

        // Mongo-shell helper for db.getCollectionNames([filter])
        if (prop === "getCollectionNames") {
          return (filter?: any) => {
            return (target as Db)
              .listCollections(filter, { nameOnly: true })
              .toArray()
              .then(infos => infos.map(info => info.name));
          };
        }

        // Provide backwards-compatibility for Mongo-shell style helper db.getCollection(<n>)
        if (prop === "getCollection") {
          return (name: string) =>
            wrapCollection((target as Db).collection(name));
        }

        // If it's a string and not a database method, treat it as a collection name
        if (typeof prop === "string") {
          console.log(`📋 Accessing collection: ${prop}`);
          return wrapCollection(target.collection(prop));
        }

        return undefined;
      },
    });

    try {
      // Execute the query content directly - much simpler and more reliable
      console.log("⚡ Evaluating query...");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const db = dbProxy; // Make db available in eval context for evaluated queries
      const result = eval(query);

      console.log(`📤 Raw result type: ${typeof result}`);
      console.log(`📤 Raw result constructor: ${result?.constructor?.name}`);
      console.log(
        `📤 Has toArray method: ${typeof result?.toArray === "function"}`,
      );
      console.log(`📤 Has then method: ${typeof result?.then === "function"}`);

      // Handle MongoDB cursors and promises
      let finalResult;
      if (result && typeof result.then === "function") {
        // It's a promise, await it
        console.log("⏳ Awaiting promise...");
        finalResult = await result;
        console.log(`✅ Promise resolved, result type: ${typeof finalResult}`);
        console.log(
          `✅ Promise resolved constructor: ${finalResult?.constructor?.name}`,
        );
      } else if (result && typeof result.toArray === "function") {
        // It's a MongoDB cursor, convert to array
        console.log("📋 Converting cursor to array...");
        finalResult = await result.toArray();
        console.log(
          `✅ Cursor converted, array length: ${finalResult?.length}`,
        );
      } else {
        // It's a direct result
        console.log("📋 Using direct result");
        finalResult = result;
      }

      console.log(`🎯 Final result type: ${typeof finalResult}`);
      console.log(`🎯 Final result is array: ${Array.isArray(finalResult)}`);
      console.log(
        "🎯 Final result length/value:",
        Array.isArray(finalResult) ? finalResult.length : finalResult,
      );

      // Wait for any tracked index operations to settle, then surface errors
      if (trackedIndexPromises.length > 0) {
        await Promise.allSettled(trackedIndexPromises);
        if (trackedIndexErrors.length > 0) {
          // Throw the first tracked error so it is returned to the client
          throw trackedIndexErrors[0];
        }
      }

      // Ensure the result can be safely serialized to JSON (avoid circular refs)
      const getCircularReplacer = () => {
        const seen = new WeakSet();
        return (key: string, value: any) => {
          // Handle BigInt explicitly (convert to string)
          if (typeof value === "bigint") return value.toString();

          if (typeof value === "object" && value !== null) {
            // Replace common MongoDB driver objects with descriptive strings
            const ctor = value.constructor?.name;
            if (
              ctor === "Collection" ||
              ctor === "Db" ||
              ctor === "MongoClient" ||
              ctor === "Cursor" ||
              ctor === "AggregationCursor" ||
              ctor === "FindCursor"
            ) {
              // Provide minimal useful info instead of the full object
              if (ctor === "Collection") {
                return {
                  _type: "Collection",
                  name: (value as any).collectionName,
                };
              }
              return `[${ctor}]`;
            }

            // Handle circular structures
            if (seen.has(value)) {
              return "[Circular]";
            }
            seen.add(value);
          }
          return value;
        };
      };

      let serializedResult: any;
      try {
        serializedResult = JSON.parse(
          JSON.stringify(finalResult, getCircularReplacer()),
        );
      } catch (e) {
        console.error(
          "⚠️ Failed to fully serialize result, falling back to string representation",
          e,
        );
        serializedResult = String(finalResult);
      }

      return serializedResult;
    } catch (error) {
      console.error("❌ Error in executeMongoDBJavaScriptQuery:", error);
      throw error;
    }
  }

  // PostgreSQL specific methods
  private async testPostgreSQLConnection(
    database: IDatabase,
  ): Promise<{ success: boolean; error?: string }> {
    let client: PgClient | null = null;
    try {
      client = new PgClient({
        host: database.connection.host,
        port: database.connection.port || 5432,
        database: database.connection.database,
        user: database.connection.username,
        password: database.connection.password,
        ssl: database.connection.ssl ? { rejectUnauthorized: false } : false,
      });
      await client.connect();
      await client.query("SELECT 1");
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "PostgreSQL connection failed",
      };
    } finally {
      if (client) {
        await client.end();
      }
    }
  }

  private async createPostgreSQLConnection(
    database: IDatabase,
  ): Promise<PgClient> {
    const client = new PgClient({
      host: database.connection.host,
      port: database.connection.port || 5432,
      database: database.connection.database,
      user: database.connection.username,
      password: database.connection.password,
      ssl: database.connection.ssl ? { rejectUnauthorized: false } : false,
    });
    await client.connect();
    return client;
  }

  private async executePostgreSQLQuery(
    database: IDatabase,
    query: string,
  ): Promise<QueryResult> {
    const client = (await this.getConnection(database)) as PgClient;
    try {
      const result = await client.query(query);
      return {
        success: true,
        data: result.rows,
        rowCount: result.rowCount ?? undefined,
        fields: result.fields,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "PostgreSQL query failed",
      };
    }
  }

  // MySQL specific methods
  private async testMySQLConnection(
    database: IDatabase,
  ): Promise<{ success: boolean; error?: string }> {
    let connection: mysql.Connection | null = null;
    try {
      connection = await mysql.createConnection({
        host: database.connection.host,
        port: database.connection.port || 3306,
        database: database.connection.database,
        user: database.connection.username,
        password: database.connection.password,
        ssl: database.connection.ssl
          ? { rejectUnauthorized: false }
          : undefined,
      });
      await connection.ping();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "MySQL connection failed",
      };
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  private async createMySQLConnection(
    database: IDatabase,
  ): Promise<mysql.Connection> {
    const connection = await mysql.createConnection({
      host: database.connection.host,
      port: database.connection.port || 3306,
      database: database.connection.database,
      user: database.connection.username,
      password: database.connection.password,
      ssl: database.connection.ssl ? { rejectUnauthorized: false } : undefined,
    });
    return connection;
  }

  private async executeMySQLQuery(
    database: IDatabase,
    query: string,
  ): Promise<QueryResult> {
    const connection = (await this.getConnection(database)) as mysql.Connection;
    try {
      const [rows, fields] = await connection.execute(query);
      return {
        success: true,
        data: rows,
        fields: fields,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "MySQL query failed",
      };
    }
  }

  // SQLite specific methods
  private async testSQLiteConnection(
    database: IDatabase,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const db = await open({
        filename: database.connection.database || ":memory:",
        driver: SqliteDatabase,
      });
      await db.get("SELECT 1");
      await db.close();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "SQLite connection failed",
      };
    }
  }

  private async createSQLiteConnection(database: IDatabase): Promise<any> {
    const db = await open({
      filename: database.connection.database || ":memory:",
      driver: SqliteDatabase,
    });
    return db;
  }

  private async executeSQLiteQuery(
    database: IDatabase,
    query: string,
  ): Promise<QueryResult> {
    const db = await this.getConnection(database);
    try {
      const result = await db.all(query);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "SQLite query failed",
      };
    }
  }

  // MSSQL specific methods
  private async testMSSQLConnection(
    database: IDatabase,
  ): Promise<{ success: boolean; error?: string }> {
    let pool: ConnectionPool | null = null;
    try {
      pool = new ConnectionPool({
        server: database.connection.host!,
        port: database.connection.port || 1433,
        database: database.connection.database!,
        user: database.connection.username!,
        password: database.connection.password!,
        options: {
          encrypt: database.connection.ssl || false,
          trustServerCertificate: true,
        },
      });
      await pool.connect();
      await pool.request().query("SELECT 1");
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "MSSQL connection failed",
      };
    } finally {
      if (pool) {
        await pool.close();
      }
    }
  }

  private async createMSSQLConnection(
    database: IDatabase,
  ): Promise<ConnectionPool> {
    const pool = new ConnectionPool({
      server: database.connection.host!,
      port: database.connection.port || 1433,
      database: database.connection.database!,
      user: database.connection.username!,
      password: database.connection.password!,
      options: {
        encrypt: database.connection.ssl || false,
        trustServerCertificate: true,
      },
    });
    await pool.connect();
    return pool;
  }

  private async executeMSSQLQuery(
    database: IDatabase,
    query: string,
  ): Promise<QueryResult> {
    const pool = (await this.getConnection(database)) as ConnectionPool;
    try {
      const result = await pool.request().query(query);
      return {
        success: true,
        data: result.recordset,
        rowCount: result.rowsAffected[0],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "MSSQL query failed",
      };
    }
  }
}

// Export singleton instance
export const databaseConnectionService = new DatabaseConnectionService();
