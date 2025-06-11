import { MongoClient, Db, MongoClientOptions } from "mongodb";
import dotenv from "dotenv";
import { configLoader } from "./config-loader";

dotenv.config({ path: "../../.env" });

export interface MongoConfig {
  connectionString: string;
  database: string;
  options?: MongoClientOptions;
}

class MongoDBConnection {
  private static instance: MongoDBConnection;
  private connections: Map<string, { client: MongoClient; db: Db }> = new Map();
  private connectingDatabases: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): MongoDBConnection {
    if (!MongoDBConnection.instance) {
      MongoDBConnection.instance = new MongoDBConnection();
    }
    return MongoDBConnection.instance;
  }

  /**
   * Get a database connection by data source ID
   */
  public async getDatabase(dataSourceId: string): Promise<Db> {
    // Check if we already have a connection
    const existing = this.connections.get(dataSourceId);
    if (existing) {
      try {
        // Verify connection is still alive
        await existing.client.db("admin").command({ ping: 1 });
        return existing.db;
      } catch (error) {
        console.error(
          `Connection lost for ${dataSourceId}, reconnecting...`,
          error,
        );
        this.connections.delete(dataSourceId);
      }
    }

    // Wait if already connecting
    if (this.connectingDatabases.has(dataSourceId)) {
      while (this.connectingDatabases.has(dataSourceId)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const connection = this.connections.get(dataSourceId);
      if (connection) {
        return connection.db;
      }
    }

    // Connect to the database
    return this.connect(dataSourceId);
  }

  /**
   * Connect to a specific database
   */
  private async connect(dataSourceId: string): Promise<Db> {
    this.connectingDatabases.add(dataSourceId);

    try {
      // Get the data source config
      const dataSource = configLoader.getMongoDBSource(dataSourceId);

      if (!dataSource) {
        throw new Error(
          `Data source '${dataSourceId}' not found in configuration`,
        );
      }

      if (!dataSource.connectionString) {
        throw new Error(
          `Data source '${dataSourceId}' is missing connection string`,
        );
      }

      if (!dataSource.database) {
        throw new Error(
          `Data source '${dataSourceId}' is missing database name`,
        );
      }

      console.log(
        `🔌 Connecting to MongoDB '${dataSourceId}': ${dataSource.database} on ${dataSource.serverName}`,
      );

      const options: MongoClientOptions = {
        maxPoolSize: dataSource.settings?.max_pool_size || 10,
        minPoolSize: dataSource.settings?.min_pool_size || 2,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
      };

      const client = new MongoClient(dataSource.connectionString, options);

      await client.connect();
      const db = client.db(dataSource.database);

      // Store the connection
      this.connections.set(dataSourceId, { client, db });

      // Set up connection monitoring
      client.on("close", () => {
        console.log(`MongoDB connection closed for '${dataSourceId}'`);
        this.connections.delete(dataSourceId);
      });

      client.on("error", error => {
        console.error(`MongoDB connection error for '${dataSourceId}':`, error);
        this.connections.delete(dataSourceId);
      });

      console.log(`✅ Connected to MongoDB '${dataSourceId}'`);

      return db;
    } catch (error) {
      console.error(
        `❌ Failed to connect to MongoDB '${dataSourceId}':`,
        error,
      );
      throw error;
    } finally {
      this.connectingDatabases.delete(dataSourceId);
    }
  }

  /**
   * Disconnect from a specific database
   */
  public async disconnect(dataSourceId: string): Promise<void> {
    const connection = this.connections.get(dataSourceId);
    if (connection) {
      await connection.client.close();
      this.connections.delete(dataSourceId);
    }
  }

  /**
   * Disconnect from all databases
   */
  public async disconnectAll(): Promise<void> {
    const promises = Array.from(this.connections.keys()).map(id =>
      this.disconnect(id),
    );
    await Promise.all(promises);
  }

  /**
   * Legacy method for backward compatibility
   * Returns the first available MongoDB database
   */
  public async getDb(): Promise<Db> {
    const mongoSources = configLoader.getMongoDBSources();
    if (mongoSources.length === 0) {
      throw new Error("No MongoDB data sources configured");
    }

    // Try to use analytics_db first for backward compatibility
    const primarySource =
      mongoSources.find(s => s.id.endsWith("analytics_db")) || mongoSources[0];
    return this.getDatabase(primarySource.id);
  }

  /**
   * Legacy method for backward compatibility
   */
  public async getClient(): Promise<MongoClient> {
    const mongoSources = configLoader.getMongoDBSources();
    if (mongoSources.length === 0) {
      throw new Error("No MongoDB data sources configured");
    }

    const primarySource =
      mongoSources.find(s => s.id.endsWith("analytics_db")) || mongoSources[0];
    await this.getDatabase(primarySource.id); // Ensure connected

    const connection = this.connections.get(primarySource.id);
    if (!connection) {
      throw new Error("MongoDB client not connected");
    }

    return connection.client;
  }
}

export const mongoConnection = MongoDBConnection.getInstance();
