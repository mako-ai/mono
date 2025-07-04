import { Db } from "mongodb";
import dotenv from "dotenv";
import { Database } from "../database/workspace-schema";
import { mongoPool } from "../core/mongodb-pool";

dotenv.config({ path: "../../.env" });

export interface MongoConfig {
  connectionString: string;
  database: string;
}

class MongoDBConnection {
  private static instance: MongoDBConnection;

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

    console.log(
      `🔌 Getting MongoDB connection for '${dataSourceId}': ${dataSource.connection.database || "default"} on ${dataSource.name}`,
    );

    // Use unified pool to get connection
    const connection = await mongoPool.getConnection(
      "datasource",
      dataSourceId,
      {
        connectionString: dataSource.connection.connectionString,
        database: dataSource.connection.database || "",
        encrypted: false,
      },
    );

    console.log(`✅ Got connection for MongoDB '${dataSourceId}'`);

    return connection.db;
  }

  /**
   * Disconnect from a specific database
   * Note: With unified pool, this is a no-op as connections are managed by the pool
   */
  public async disconnect(dataSourceId: string): Promise<void> {
    console.log(`Disconnect requested for '${dataSourceId}' - handled by pool`);
  }

  /**
   * Disconnect from all databases
   * Note: With unified pool, this is a no-op as connections are managed by the pool
   */
  public async disconnectAll(): Promise<void> {
    console.log("Disconnect all requested - handled by pool");
  }
}

export const mongoConnection = MongoDBConnection.getInstance();
