import { MongoClient, Db, ObjectId } from "mongodb";
import * as crypto from "crypto";
import * as dotenv from "dotenv";

dotenv.config();

// Import connector schemas to determine which fields should be encrypted
interface ConnectorFieldSchema {
  name: string;
  type: string;
  encrypted?: boolean;
  [key: string]: any; // Allow other properties like label, required, etc.
}

interface ConnectorSchema {
  fields: ConnectorFieldSchema[];
}

// Define schemas directly (matching what's in the connector classes)
const CONNECTOR_SCHEMAS: { [key: string]: ConnectorSchema } = {
  stripe: {
    fields: [
      { name: "api_key", label: "API Key", type: "password", required: true },
      {
        name: "api_base_url",
        label: "API Base URL",
        type: "string",
        required: false,
      },
    ],
  },
  graphql: {
    fields: [
      {
        name: "endpoint",
        label: "GraphQL Endpoint URL",
        type: "string",
        required: true,
      },
      {
        name: "headers",
        label: "Custom Headers (JSON)",
        type: "textarea",
        required: false,
        encrypted: true,
      },
      {
        name: "query",
        label: "GraphQL Query",
        type: "textarea",
        required: true,
      },
      {
        name: "query_name",
        label: "Query Name",
        type: "string",
        required: true,
      },
      { name: "data_path", label: "Data Path", type: "string", required: true },
      {
        name: "total_count_path",
        label: "Total Count Path",
        type: "string",
        required: false,
      },
      {
        name: "has_next_page_path",
        label: "Has Next Page Path",
        type: "string",
        required: false,
      },
      {
        name: "cursor_path",
        label: "Cursor Path",
        type: "string",
        required: false,
      },
      {
        name: "batch_size",
        label: "Batch Size",
        type: "number",
        required: false,
      },
    ],
  },
  close: {
    fields: [
      { name: "api_key", label: "API Key", type: "password", required: true },
    ],
  },
  mongodb: {
    fields: [
      {
        name: "connection_string",
        label: "Connection String",
        type: "password",
        required: true,
      },
      { name: "database", label: "Database", type: "string", required: true },
    ],
  },
};

// Data source interface matching the database schema
export interface DataSourceConfig {
  id: string;
  name: string;
  description?: string;
  type: string;
  active: boolean;
  connection: any;
  settings: {
    sync_batch_size?: number;
    rate_limit_delay_ms?: number;
    timezone?: string;
    max_retries?: number;
    timeout_ms?: number;
  };
}

class DatabaseDataSourceManager {
  private client: MongoClient;
  private db!: Db;
  private schemaCache: Map<string, ConnectorSchema> = new Map();
  private databaseName: string;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const connectionString = process.env.DATABASE_URL;
    this.client = new MongoClient(connectionString);

    // Extract database name from the connection string or use environment variable
    this.databaseName =
      process.env.DATABASE_NAME ||
      this.extractDatabaseName(connectionString) ||
      "mako";
  }

  private extractDatabaseName(connectionString: string): string | null {
    try {
      const url = new URL(connectionString);
      const pathname = url.pathname;
      if (pathname && pathname.length > 1) {
        return pathname.substring(1); // Remove leading slash
      }
    } catch {
      // Invalid URL, return null
    }
    return null;
  }

  private async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(this.databaseName);
  }

  private async disconnect(): Promise<void> {
    await this.client.close();
  }

  /**
   * Get connector schema
   */
  private async getConnectorSchema(
    connectorType: string,
  ): Promise<ConnectorSchema | null> {
    // Check cache first
    if (this.schemaCache.has(connectorType)) {
      return this.schemaCache.get(connectorType)!;
    }

    // Get schema from our definitions
    const schema = CONNECTOR_SCHEMAS[connectorType];
    if (schema) {
      this.schemaCache.set(connectorType, schema);
      return schema;
    }

    console.warn(`No schema found for connector type: ${connectorType}`);
    return null;
  }

  /**
   * Get all active data sources
   */
  async getActiveDataSources(): Promise<DataSourceConfig[]> {
    try {
      await this.connect();
      const collection = this.db.collection("datasources");

      const sources = await collection.find({ isActive: true }).toArray();

      const results = [];
      for (const source of sources) {
        results.push({
          id: source._id.toString(),
          name: source.name,
          description: source.description,
          type: source.type,
          active: source.isActive,
          connection: await this.decryptConfig(source.config, source.type),
          settings: {
            sync_batch_size: source.settings?.sync_batch_size || 100,
            rate_limit_delay_ms: source.settings?.rate_limit_delay_ms || 200,
            timezone: source.settings?.timezone || "UTC",
            max_retries: source.settings?.max_retries || 3,
            timeout_ms: source.settings?.timeout_ms || 30000,
          },
        });
      }

      return results;
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Get a specific data source by ID or name
   */
  async getDataSource(idOrName: string): Promise<DataSourceConfig | null> {
    try {
      await this.connect();
      const collection = this.db.collection("datasources");

      // Try to find by ID first
      let source = null;
      try {
        source = await collection.findOne({ _id: new ObjectId(idOrName) });
      } catch {
        // Not a valid ObjectId, try by name
        source = await collection.findOne({ name: idOrName });
      }

      if (!source) {
        return null;
      }

      return {
        id: source._id.toString(),
        name: source.name,
        description: source.description,
        type: source.type,
        active: source.isActive,
        connection: await this.decryptConfig(source.config, source.type),
        settings: {
          sync_batch_size: source.settings?.sync_batch_size || 100,
          rate_limit_delay_ms: source.settings?.rate_limit_delay_ms || 200,
          timezone: source.settings?.timezone || "UTC",
          max_retries: source.settings?.max_retries || 3,
          timeout_ms: source.settings?.timeout_ms || 30000,
        },
      };
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Get data sources by type
   */
  async getDataSourcesByType(type: string): Promise<DataSourceConfig[]> {
    try {
      await this.connect();
      const collection = this.db.collection("datasources");

      const sources = await collection.find({ type, isActive: true }).toArray();

      const results = [];
      for (const source of sources) {
        results.push({
          id: source._id.toString(),
          name: source.name,
          description: source.description,
          type: source.type,
          active: source.isActive,
          connection: await this.decryptConfig(source.config, source.type),
          settings: {
            sync_batch_size: source.settings?.sync_batch_size || 100,
            rate_limit_delay_ms: source.settings?.rate_limit_delay_ms || 200,
            timezone: source.settings?.timezone || "UTC",
            max_retries: source.settings?.max_retries || 3,
            timeout_ms: source.settings?.timeout_ms || 30000,
          },
        });
      }

      return results;
    } finally {
      await this.disconnect();
    }
  }

  /**
   * List all data source IDs
   */
  async listDataSourceIds(): Promise<string[]> {
    try {
      await this.connect();
      const collection = this.db.collection("datasources");

      const sources = await collection
        .find({}, { projection: { _id: 1, name: 1 } })
        .toArray();

      return sources.map(s => `${s.name} (${s._id})`);
    } finally {
      await this.disconnect();
    }
  }

  /**
   * List active data source IDs
   */
  async listActiveDataSourceIds(): Promise<string[]> {
    try {
      await this.connect();
      const collection = this.db.collection("datasources");

      const sources = await collection
        .find({ isActive: true }, { projection: { _id: 1, name: 1 } })
        .toArray();

      return sources.map(s => `${s.name} (${s._id})`);
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Validate configuration (always returns valid for database sources)
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    return { valid: true, errors: [] };
  }

  private getEncryptionKey(): string {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error("ENCRYPTION_KEY environment variable is not set");
    }
    return key;
  }

  private decryptString(encryptedString: string): string {
    if (!encryptedString || !encryptedString.includes(":")) {
      return encryptedString; // Not encrypted
    }

    try {
      const textParts = encryptedString.split(":");
      const iv = Buffer.from(textParts[0], "hex");
      const encryptedText = Buffer.from(textParts.slice(1).join(":"), "hex");

      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        Buffer.from(this.getEncryptionKey(), "hex"),
        iv,
      );

      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString();
    } catch (error) {
      console.error("Decryption failed:", error);
      // Don't return the original string if decryption fails - throw error
      throw error;
    }
  }

  /**
   * Decrypt config based on connector schema
   */
  private async decryptConfig(
    config: any,
    connectorType: string,
  ): Promise<any> {
    if (!config) return config;

    const schema = await this.getConnectorSchema(connectorType);
    if (!schema) {
      console.warn(
        `No schema found for connector type: ${connectorType}, skipping decryption`,
      );
      // Return config as-is without decryption
      return config;
    }

    const decrypted: any = {};

    // Copy all fields
    for (const key in config) {
      decrypted[key] = config[key];
    }

    // Only decrypt fields marked as encrypted in the schema
    for (const field of schema.fields) {
      if (field.encrypted || field.type === "password") {
        if (config[field.name] && typeof config[field.name] === "string") {
          try {
            decrypted[field.name] = this.decryptString(config[field.name]);
          } catch (error) {
            console.error(`Failed to decrypt field ${field.name}:`, error);
            // Keep the original value if decryption fails
            decrypted[field.name] = config[field.name];
          }
        }
      }
    }

    return decrypted;
  }

  private decryptObject(obj: any): any {
    if (!obj) return obj;

    const decrypted: any = {};
    for (const key in obj) {
      if (typeof obj[key] === "string" && obj[key]) {
        decrypted[key] = this.decryptString(obj[key]);
      } else if (typeof obj[key] === "object" && obj[key] !== null) {
        decrypted[key] = this.decryptObject(obj[key]);
      } else {
        decrypted[key] = obj[key];
      }
    }
    return decrypted;
  }
}

// Export singleton instance
export const databaseDataSourceManager = new DatabaseDataSourceManager();

// Export class for custom instances
export { DatabaseDataSourceManager };
