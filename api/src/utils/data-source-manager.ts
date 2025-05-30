import { MongoClient, Db, Collection, ObjectId } from "mongodb";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

// Data source interface
export interface DataSource {
  _id?: ObjectId;
  name: string;
  description?: string;
  source:
    | "close"
    | "stripe"
    | "graphql"
    | "postgres"
    | "rest"
    | "mysql"
    | "api";
  enabled: boolean;
  config: {
    api_key?: string;
    api_base_url?: string;
    username?: string;
    password?: string;
    host?: string;
    port?: number;
    database?: string;
    [key: string]: any; // Allow additional config fields
  };
  settings: {
    sync_batch_size: number;
    rate_limit_delay_ms: number;
    max_retries?: number;
    timeout_ms?: number;
  };
  tenant?: string; // Optional tenant association
  created_at: Date;
  updated_at: Date;
}

// Simple configuration loader for the web app
function loadConfig() {
  const mongoUrl =
    process.env.MONGODB_CONNECTION_STRING || "mongodb://localhost:27018";
  const database = process.env.MONGODB_DATABASE || "multi_tenant_analytics";

  return {
    mongodb: {
      connection_string: mongoUrl,
      database: database,
    },
  };
}

export class DataSourceManager {
  private client: MongoClient;
  private db!: Db;
  private collection!: Collection<DataSource>;

  constructor() {
    const config = loadConfig();
    this.client = new MongoClient(config.mongodb.connection_string);
  }

  private async connect(): Promise<void> {
    await this.client.connect();
    const config = loadConfig();
    this.db = this.client.db(config.mongodb.database);
    this.collection = this.db.collection<DataSource>("data_sources");
  }

  private async disconnect(): Promise<void> {
    await this.client.close();
  }

  async listDataSources(): Promise<DataSource[]> {
    try {
      await this.connect();
      const dataSources = await this.collection.find({}).toArray();
      return dataSources;
    } catch (error) {
      console.error(`❌ Error listing data sources:`, error);
      throw new Error(
        `Failed to list data sources: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await this.disconnect();
    }
  }

  async getDataSource(id: string): Promise<DataSource | null> {
    try {
      await this.connect();
      const dataSource = await this.collection.findOne({
        _id: new ObjectId(id),
      });
      return dataSource;
    } catch (error) {
      console.error(`❌ Error getting data source:`, error);
      throw new Error(
        `Failed to get data source: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await this.disconnect();
    }
  }

  async createDataSource(
    dataSource: Omit<DataSource, "_id" | "created_at" | "updated_at">
  ): Promise<DataSource> {
    try {
      await this.connect();

      // Check if name already exists
      const existing = await this.collection.findOne({ name: dataSource.name });
      if (existing) {
        throw new Error(
          `Data source with name '${dataSource.name}' already exists`
        );
      }

      const now = new Date();
      const newDataSource: Omit<DataSource, "_id"> = {
        ...dataSource,
        created_at: now,
        updated_at: now,
      };

      const result = await this.collection.insertOne(
        newDataSource as DataSource
      );
      const created = await this.collection.findOne({ _id: result.insertedId });

      if (!created) {
        throw new Error("Failed to retrieve created data source");
      }

      return created;
    } catch (error) {
      console.error(`❌ Error creating data source:`, error);
      throw new Error(
        `Failed to create data source: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await this.disconnect();
    }
  }

  async updateDataSource(
    id: string,
    updates: Partial<Omit<DataSource, "_id" | "created_at">>
  ): Promise<DataSource> {
    try {
      await this.connect();

      // Check if data source exists
      const existing = await this.collection.findOne({ _id: new ObjectId(id) });
      if (!existing) {
        throw new Error(`Data source with id '${id}' not found`);
      }

      // If updating name, check for conflicts
      if (updates.name && updates.name !== existing.name) {
        const nameConflict = await this.collection.findOne({
          name: updates.name,
        });
        if (nameConflict) {
          throw new Error(
            `Data source with name '${updates.name}' already exists`
          );
        }
      }

      const updateData = {
        ...updates,
        updated_at: new Date(),
      };

      await this.collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      const updated = await this.collection.findOne({ _id: new ObjectId(id) });
      if (!updated) {
        throw new Error("Failed to retrieve updated data source");
      }

      return updated;
    } catch (error) {
      console.error(`❌ Error updating data source:`, error);
      throw new Error(
        `Failed to update data source: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await this.disconnect();
    }
  }

  async deleteDataSource(id: string): Promise<boolean> {
    try {
      await this.connect();

      const result = await this.collection.deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        throw new Error(`Data source with id '${id}' not found`);
      }

      return true;
    } catch (error) {
      console.error(`❌ Error deleting data source:`, error);
      throw new Error(
        `Failed to delete data source: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await this.disconnect();
    }
  }

  async testConnection(
    id: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.connect();

      const dataSource = await this.collection.findOne({
        _id: new ObjectId(id),
      });
      if (!dataSource) {
        throw new Error(`Data source with id '${id}' not found`);
      }

      // Basic connection test based on source type
      // This is a placeholder - you'd implement actual connection logic per source type
      switch (dataSource.source) {
        case "close":
          // Test Close API connection
          if (!dataSource.config.api_key) {
            return {
              success: false,
              message: "API key is required for Close integration",
            };
          }
          return { success: true, message: "Close API connection configured" };

        case "stripe":
          // Test Stripe API connection
          if (!dataSource.config.api_key) {
            return {
              success: false,
              message: "API key is required for Stripe integration",
            };
          }
          return { success: true, message: "Stripe API connection configured" };

        case "postgres":
        case "mysql":
          // Test database connection
          if (!dataSource.config.host || !dataSource.config.database) {
            return {
              success: false,
              message: "Host and database are required for database connection",
            };
          }
          return { success: true, message: "Database connection configured" };

        case "rest":
        case "api":
        case "graphql":
          // Test API connection
          if (!dataSource.config.api_base_url) {
            return {
              success: false,
              message: "Base URL is required for API connection",
            };
          }
          return { success: true, message: "API connection configured" };

        default:
          return { success: false, message: "Unknown data source type" };
      }
    } catch (error) {
      console.error(`❌ Error testing data source connection:`, error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Connection test failed",
      };
    } finally {
      await this.disconnect();
    }
  }
}
