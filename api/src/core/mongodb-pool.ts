import { MongoClient, Db, MongoClientOptions } from "mongodb";
import * as crypto from "crypto";

// Types for different connection contexts
export type ConnectionContext =
  | "main" // Main application database
  | "destination" // Destination databases for sync
  | "datasource" // Data source databases
  | "workspace"; // Workspace-specific databases

export interface ConnectionConfig {
  connectionString: string;
  database: string;
  encrypted?: boolean;
}

interface PooledConnection {
  client: MongoClient;
  db: Db;
  lastUsed: Date;
  context: ConnectionContext;
  identifier: string;
}

/**
 * Unified MongoDB Connection Pool Manager
 *
 * This singleton manages all MongoDB connections across the application:
 * - Main application database (via mongoose)
 * - Destination databases for sync operations
 * - Data source databases for queries
 * - Workspace-specific databases
 *
 * Features:
 * - Connection pooling with health checks
 * - Automatic reconnection
 * - Idle connection cleanup
 * - Graceful shutdown
 * - Support for encrypted connection strings
 */
export class UnifiedMongoDBPool {
  private static instance: UnifiedMongoDBPool;
  private connections: Map<string, PooledConnection> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly maxIdleTime = 5 * 60 * 1000; // 5 minutes

  // Default connection options for all connections
  private readonly defaultOptions: MongoClientOptions = {
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 0,
    connectTimeoutMS: 10000,
    retryWrites: true,
    retryReads: true,
  };

  private constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      void this.cleanupIdleConnections();
    }, 60000); // Every minute
  }

  public static getInstance(): UnifiedMongoDBPool {
    if (!UnifiedMongoDBPool.instance) {
      UnifiedMongoDBPool.instance = new UnifiedMongoDBPool();
    }
    return UnifiedMongoDBPool.instance;
  }

  /**
   * Get or create a connection
   */
  async getConnection(
    context: ConnectionContext,
    identifier: string,
    config?: ConnectionConfig,
    options?: MongoClientOptions,
  ): Promise<{ client: MongoClient; db: Db }> {
    const key = this.getConnectionKey(context, identifier);

    // Check existing connection
    const existing = this.connections.get(key);
    if (existing) {
      try {
        // Health check
        await existing.client.db("admin").command({ ping: 1 });
        existing.lastUsed = new Date();
        return { client: existing.client, db: existing.db };
      } catch (error) {
        console.warn(`Connection unhealthy for ${key}, reconnecting...`, error);
        this.connections.delete(key);
        try {
          await existing.client.close();
        } catch {
          // Ignore close errors
        }
      }
    }

    // Create new connection
    if (!config) {
      throw new Error(`No connection config provided for ${key}`);
    }

    return this.createConnection(context, identifier, config, options);
  }

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

    return this.getConnection("main", "app", {
      connectionString,
      database: databaseName,
    });
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
    const key = this.getConnectionKey(context, databaseId);
    const existing = this.connections.get(key);
    if (existing) {
      try {
        await existing.client.db("admin").command({ ping: 1 });
        existing.lastUsed = new Date();
        return { client: existing.client, db: existing.db };
      } catch {
        // Continue to recreate
      }
    }

    // Lookup configuration
    const config = await lookupFn(databaseId);
    if (!config) {
      throw new Error(`Database '${databaseId}' not found`);
    }

    return this.getConnection(context, databaseId, config);
  }

  private async createConnection(
    context: ConnectionContext,
    identifier: string,
    config: ConnectionConfig,
    customOptions?: MongoClientOptions,
  ): Promise<{ client: MongoClient; db: Db }> {
    const key = this.getConnectionKey(context, identifier);
    console.log(`🔌 Creating pooled connection: ${key}`);

    // Decrypt connection string if needed
    let connectionString = config.connectionString;
    if (config.encrypted) {
      connectionString = this.decryptString(connectionString);
    }

    // Merge options
    const options = { ...this.defaultOptions, ...customOptions };

    // Create client
    const client = new MongoClient(connectionString, options);
    await client.connect();

    // Handle database name extraction
    let databaseName = config.database;
    if (config.encrypted && databaseName) {
      databaseName = this.decryptString(databaseName);
    }

    const db = client.db(databaseName);

    // Store in pool
    const pooledConnection: PooledConnection = {
      client,
      db,
      lastUsed: new Date(),
      context,
      identifier,
    };
    this.connections.set(key, pooledConnection);

    // Set up monitoring
    client.on("close", () => {
      console.log(`MongoDB connection closed: ${key}`);
      this.connections.delete(key);
    });

    client.on("error", error => {
      console.error(`MongoDB connection error for ${key}:`, error);
      this.connections.delete(key);
    });

    client.on("topologyClosed", () => {
      console.log(`MongoDB topology closed: ${key}`);
      this.connections.delete(key);
    });

    console.log(`✅ Connected: ${key}`);
    return { client, db };
  }

  private getConnectionKey(
    context: ConnectionContext,
    identifier: string,
  ): string {
    return `${context}:${identifier}`;
  }

  private async cleanupIdleConnections(): Promise<void> {
    const now = new Date();
    const toRemove: string[] = [];

    for (const [key, connection] of this.connections.entries()) {
      const idleTime = now.getTime() - connection.lastUsed.getTime();
      if (idleTime > this.maxIdleTime) {
        toRemove.push(key);
      }
    }

    for (const key of toRemove) {
      const connection = this.connections.get(key);
      if (connection) {
        try {
          await connection.client.close();
          console.log(`Closed idle connection: ${key}`);
        } catch (error) {
          console.error(`Error closing idle connection ${key}:`, error);
        }
        this.connections.delete(key);
      }
    }
  }

  /**
   * Close specific connection
   */
  async closeConnection(
    context: ConnectionContext,
    identifier: string,
  ): Promise<void> {
    const key = this.getConnectionKey(context, identifier);
    const connection = this.connections.get(key);

    if (connection) {
      try {
        await connection.client.close();
        console.log(`Closed connection: ${key}`);
      } catch (error) {
        console.error(`Error closing connection ${key}:`, error);
      }
      this.connections.delete(key);
    }
  }

  /**
   * Close all connections gracefully
   */
  async closeAll(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const promises: Promise<void>[] = [];
    for (const [key, connection] of this.connections.entries()) {
      promises.push(
        connection.client
          .close()
          .then(() => console.log(`Closed connection: ${key}`))
          .catch(error => console.error(`Error closing ${key}:`, error)),
      );
    }

    await Promise.all(promises);
    this.connections.clear();
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    byContext: Record<ConnectionContext, number>;
    connections: Array<{
      key: string;
      context: ConnectionContext;
      identifier: string;
      lastUsed: Date;
    }>;
  } {
    const byContext: Record<ConnectionContext, number> = {
      main: 0,
      destination: 0,
      datasource: 0,
      workspace: 0,
    };

    const connections = Array.from(this.connections.entries()).map(
      ([key, conn]) => {
        byContext[conn.context]++;
        return {
          key,
          context: conn.context,
          identifier: conn.identifier,
          lastUsed: conn.lastUsed,
        };
      },
    );

    return {
      totalConnections: this.connections.size,
      byContext,
      connections,
    };
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

  private decryptString(encryptedString: string): string {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("ENCRYPTION_KEY environment variable is not set");
    }

    const textParts = encryptedString.split(":");
    if (textParts.length !== 2) {
      throw new Error("Invalid encrypted string format");
    }

    const iv = Buffer.from(textParts[0], "hex");
    const encryptedText = Buffer.from(textParts[1], "hex");

    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(encryptionKey, "hex"),
      iv,
    );

    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString();
  }
}

// Export singleton instance
export const mongoPool = UnifiedMongoDBPool.getInstance();
