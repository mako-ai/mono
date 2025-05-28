import { MongoClient, Db, Collection, CreateCollectionOptions } from "mongodb";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

// Simple configuration loader for the web app
function loadConfig() {
  // Use environment variables primarily (which are set in docker-compose)
  const mongoUrl =
    process.env.MONGODB_CONNECTION_STRING || "mongodb://mongodb:27017";
  const database = process.env.MONGODB_DATABASE || "multi_tenant_analytics";

  console.log(`🔌 Connecting to MongoDB: ${mongoUrl}/${database}`);

  return {
    mongodb: {
      connection_string: mongoUrl,
      database: database,
    },
  };
}

export class DatabaseManager {
  private client: MongoClient;
  private db!: Db;

  constructor() {
    const config = loadConfig();
    this.client = new MongoClient(config.mongodb.connection_string);
  }

  private async connect(): Promise<void> {
    await this.client.connect();
    const config = loadConfig();
    this.db = this.client.db(config.mongodb.database);
  }

  private async disconnect(): Promise<void> {
    await this.client.close();
  }

  async listCollections(): Promise<any[]> {
    try {
      await this.connect();

      const collections = await this.db
        .listCollections({ type: "collection" })
        .toArray();

      return collections.map((col) => ({
        name: col.name,
        type: col.type,
        options: (col as any).options,
        info: (col as any).info,
      }));
    } catch (error) {
      console.error(`❌ Error listing collections:`, error);
      throw new Error(
        `Failed to list collections: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await this.disconnect();
    }
  }

  async listViews(): Promise<any[]> {
    try {
      await this.connect();

      const views = await this.db.listCollections({ type: "view" }).toArray();

      return views.map((view) => ({
        name: view.name,
        type: view.type,
        options: (view as any).options,
        info: (view as any).info,
      }));
    } catch (error) {
      console.error(`❌ Error listing views:`, error);
      throw new Error(
        `Failed to list views: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await this.disconnect();
    }
  }

  async createCollection(
    name: string,
    options?: CreateCollectionOptions
  ): Promise<any> {
    try {
      await this.connect();

      // Check if collection already exists
      const existingCollections = await this.db
        .listCollections({ name })
        .toArray();
      if (existingCollections.length > 0) {
        throw new Error(`Collection '${name}' already exists`);
      }

      const collection = await this.db.createCollection(name, options);

      return {
        name: collection.collectionName,
        namespace: collection.namespace,
        created: true,
      };
    } catch (error) {
      console.error(`❌ Error creating collection:`, error);
      throw new Error(
        `Failed to create collection '${name}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await this.disconnect();
    }
  }

  async createView(
    name: string,
    viewOn: string,
    pipeline: any[],
    options?: any
  ): Promise<any> {
    try {
      await this.connect();

      // Check if view already exists
      const existingViews = await this.db.listCollections({ name }).toArray();
      if (existingViews.length > 0) {
        throw new Error(`View '${name}' already exists`);
      }

      // Check if source collection exists
      const sourceCollections = await this.db
        .listCollections({ name: viewOn })
        .toArray();
      if (sourceCollections.length === 0) {
        throw new Error(`Source collection '${viewOn}' does not exist`);
      }

      await this.db.createCollection(name, {
        viewOn,
        pipeline,
        ...options,
      });

      return {
        name,
        viewOn,
        pipeline,
        created: true,
      };
    } catch (error) {
      console.error(`❌ Error creating view:`, error);
      throw new Error(
        `Failed to create view '${name}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await this.disconnect();
    }
  }

  async deleteCollection(name: string): Promise<any> {
    try {
      await this.connect();

      // Check if collection exists
      const existingCollections = await this.db
        .listCollections({ name })
        .toArray();
      if (existingCollections.length === 0) {
        throw new Error(`Collection '${name}' does not exist`);
      }

      const result = await this.db.dropCollection(name);

      return {
        name,
        deleted: result,
      };
    } catch (error) {
      console.error(`❌ Error deleting collection:`, error);
      throw new Error(
        `Failed to delete collection '${name}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await this.disconnect();
    }
  }

  async deleteView(name: string): Promise<any> {
    try {
      await this.connect();

      // Check if view exists
      const existingViews = await this.db
        .listCollections({ name, type: "view" })
        .toArray();
      if (existingViews.length === 0) {
        throw new Error(`View '${name}' does not exist`);
      }

      const result = await this.db.dropCollection(name);

      return {
        name,
        deleted: result,
      };
    } catch (error) {
      console.error(`❌ Error deleting view:`, error);
      throw new Error(
        `Failed to delete view '${name}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await this.disconnect();
    }
  }

  async getCollectionInfo(name: string): Promise<any> {
    try {
      await this.connect();

      // Check if collection exists
      const collections = await this.db.listCollections({ name }).toArray();
      if (collections.length === 0) {
        throw new Error(`Collection '${name}' does not exist`);
      }

      const collection = this.db.collection(name);

      // Get collection stats
      const stats = await this.db.command({ collStats: name });

      // Get indexes
      const indexes = await collection.indexes();

      // Get sample documents (first 5)
      const sampleDocs = await collection.find({}).limit(5).toArray();

      return {
        name,
        type: collections[0].type,
        options: (collections[0] as any).options,
        stats: {
          count: stats.count,
          size: stats.size,
          avgObjSize: stats.avgObjSize,
          storageSize: stats.storageSize,
          indexes: stats.nindexes,
          totalIndexSize: stats.totalIndexSize,
        },
        indexes,
        sampleDocuments: sampleDocs,
      };
    } catch (error) {
      console.error(`❌ Error getting collection info:`, error);
      throw new Error(
        `Failed to get collection info for '${name}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await this.disconnect();
    }
  }

  async getViewInfo(name: string): Promise<any> {
    try {
      await this.connect();

      // Check if view exists
      const views = await this.db
        .listCollections({ name, type: "view" })
        .toArray();
      if (views.length === 0) {
        throw new Error(`View '${name}' does not exist`);
      }

      const viewInfo = views[0];
      const collection = this.db.collection(name);

      // Get view stats
      const stats = await this.db.command({ collStats: name });

      // Get sample documents (first 5)
      const sampleDocs = await collection.find({}).limit(5).toArray();

      return {
        name,
        type: viewInfo.type,
        options: (viewInfo as any).options,
        viewOn: (viewInfo as any).options?.viewOn,
        pipeline: (viewInfo as any).options?.pipeline,
        stats: {
          count: stats.count,
          size: stats.size,
          avgObjSize: stats.avgObjSize,
        },
        sampleDocuments: sampleDocs,
      };
    } catch (error) {
      console.error(`❌ Error getting view info:`, error);
      throw new Error(
        `Failed to get view info for '${name}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await this.disconnect();
    }
  }
}
