import { MongoClient, Db, MongoClientOptions } from "mongodb";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

export interface MongoConfig {
  connectionString: string;
  database: string;
  options?: MongoClientOptions;
}

class MongoDBConnection {
  private static instance: MongoDBConnection;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private config: MongoConfig;
  private isConnecting: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.config = {
      connectionString:
        process.env.MONGODB_CONNECTION_STRING || "mongodb://localhost:27018",
      database: process.env.MONGODB_DATABASE || "multi_tenant_analytics",
      options: {
        maxPoolSize: 10,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
      },
    };
  }

  public static getInstance(): MongoDBConnection {
    if (!MongoDBConnection.instance) {
      MongoDBConnection.instance = new MongoDBConnection();
    }
    return MongoDBConnection.instance;
  }

  public async connect(): Promise<void> {
    if (this.client && this.db) {
      // Check if connection is still alive
      try {
        await this.client.db("admin").command({ ping: 1 });
        return;
      } catch (error) {
        console.log("Connection lost, reconnecting...");
        await this.disconnect();
      }
    }

    if (this.isConnecting) {
      // Wait for ongoing connection
      while (this.isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    this.isConnecting = true;

    try {
      console.log(
        `🔌 Connecting to MongoDB: ${this.config.connectionString}/${this.config.database}`
      );

      this.client = new MongoClient(
        this.config.connectionString,
        this.config.options
      );

      await this.client.connect();
      this.db = this.client.db(this.config.database);

      // Set up connection monitoring
      this.client.on("close", () => {
        console.log("MongoDB connection closed");
        this.scheduleReconnect();
      });

      this.client.on("error", (error) => {
        console.error("MongoDB connection error:", error);
        this.scheduleReconnect();
      });

      console.log("✅ Connected to MongoDB");
    } catch (error) {
      console.error("❌ Failed to connect to MongoDB:", error);
      this.client = null;
      this.db = null;
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (error) {
        console.error("Reconnection failed:", error);
        this.scheduleReconnect();
      }
    }, 5000);
  }

  public async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }

  public async getDb(): Promise<Db> {
    await this.connect();
    if (!this.db) {
      throw new Error("Database connection not established");
    }
    return this.db;
  }

  public async getClient(): Promise<MongoClient> {
    await this.connect();
    if (!this.client) {
      throw new Error("MongoDB client not connected");
    }
    return this.client;
  }
}

export const mongoConnection = MongoDBConnection.getInstance();
