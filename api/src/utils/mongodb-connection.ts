import { MongoClient, Db, MongoClientOptions } from "mongodb";
import dotenv from "dotenv";
import { Database } from "../database/workspace-schema";

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
      // Get the data source config from database
      const dataSource = await Database.findById(dataSourceId);

      if (!dataSource) {
        throw new Error(
          `Data source '${dataSourceId}' not found in configuration`,
        );
      }

      if (!dataSource.connection.connectionString) {
        throw new Error(
          `Data source '${dataSourceId}' is missing connection string`,
        );
      }

      if (!dataSource.connection.database) {
        throw new Error(
          `Data source '${dataSourceId}' is missing database name`,
        );
      }

      console.log(
        `🔌 Connecting to MongoDB '${dataSourceId}': ${dataSource.connection.database} on ${dataSource.name}`,
      );

      const options: MongoClientOptions = {
        maxPoolSize: 10,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
      };

      const client = new MongoClient(dataSource.connection.connectionString, options);

      await client.connect();
      const db = client.db(dataSource.connection.database);

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
}

export const mongoConnection = MongoDBConnection.getInstance();
