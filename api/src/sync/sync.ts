import { syncConnectorRegistry } from "./connector-registry";
import { MongoClient, Db, ObjectId } from "mongodb";
import * as crypto from "crypto";
import * as dotenv from "dotenv";
import { SyncOptions, SyncLogger } from "../connectors/base/BaseConnector";

dotenv.config();

// Database-based destination manager for app destinations
class DatabaseDestinationManager {
  private client: MongoClient | null = null;
  private databaseName: string = "";
  private initialized = false;

  private initialize() {
    if (this.initialized) return;

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

    this.initialized = true;
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

  private async connect(): Promise<Db> {
    this.initialize();
    if (!this.client) throw new Error("Client not initialized");
    await this.client.connect();
    return this.client.db(this.databaseName);
  }

  private async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  async getDestination(nameOrId: string): Promise<any> {
    let db: Db | undefined;
    try {
      db = await this.connect();
      const collection = db.collection("databases");

      // Try to find by name first, then by ID
      let destination = await collection.findOne({ name: nameOrId });
      if (!destination) {
        // Try to parse as ObjectId
        try {
          destination = await collection.findOne({
            _id: new ObjectId(nameOrId),
          });
        } catch {
          // Not a valid ObjectId, destination remains null
        }
      }

      if (!destination) {
        return null;
      }

      // Return in the expected format for the sync service
      return {
        id: destination._id,
        name: destination.name,
        type: "mongodb",
        connection: {
          connection_string: this.decryptString(
            destination.connection.connectionString,
          ),
          database: this.decryptString(destination.connection.database),
        },
      };
    } finally {
      await this.disconnect();
    }
  }

  async listDestinations(): Promise<{ name: string; id: string }[]> {
    let db: Db | undefined;
    try {
      db = await this.connect();
      const collection = db.collection("databases");
      const destinations = await collection
        .find({}, { projection: { name: 1, _id: 1 } })
        .toArray();
      return destinations.map(d => ({ name: d.name, id: d._id.toString() }));
    } finally {
      await this.disconnect();
    }
  }

  private decryptString(encryptedString: string): string {
    // Get encryption key from environment
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("ENCRYPTION_KEY environment variable is not set");
    }

    // Parse the encrypted string (format: iv:encrypted_data)
    const textParts = encryptedString.split(":");
    if (textParts.length !== 2) {
      throw new Error("Invalid encrypted string format");
    }

    const iv = Buffer.from(textParts[0], "hex");
    const encryptedText = Buffer.from(textParts[1], "hex");

    // Decrypt using AES-256-CBC
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

// Lazy-initialized singleton
let databaseDestinationManagerInstance: DatabaseDestinationManager | null =
  null;
export function getDestinationManager() {
  if (!databaseDestinationManagerInstance) {
    databaseDestinationManagerInstance = new DatabaseDestinationManager();
  }
  return databaseDestinationManagerInstance;
}

// Import the database data source manager
import { databaseDataSourceManager } from "./database-data-source-manager";

// Progress reporter for sync operations
export class ProgressReporter {
  private startTime: Date;
  private totalRecords: number;
  private currentRecords: number = 0;
  private entityName: string;
  private logger?: SyncLogger;

  constructor(entityName: string, totalRecords?: number, logger?: SyncLogger) {
    this.entityName = entityName;
    this.totalRecords = totalRecords || 0;
    this.startTime = new Date();
    this.logger = logger;
  }

  updateTotal(total: number) {
    this.totalRecords = total;
  }

  reportBatch(batchSize: number) {
    this.currentRecords += batchSize;
    this.displayProgress();
  }

  reportComplete() {
    this.currentRecords = this.totalRecords;
    this.displayProgress();
    console.log(); // New line after progress
  }

  private displayProgress() {
    const elapsed = Date.now() - this.startTime.getTime();
    const elapsedStr = this.formatTime(elapsed);

    if (this.totalRecords > 0) {
      // We know the total, show full progress
      let percentage = Math.floor(
        (this.currentRecords / this.totalRecords) * 100,
      );
      if (percentage > 100) percentage = 100; // clamp to 100%
      const progressBar = this.createProgressBar(percentage);

      const rate = this.currentRecords / (elapsed / 1000); // records per second
      const remaining =
        ((this.totalRecords - this.currentRecords) / rate) * 1000; // milliseconds
      const remainingStr = this.formatTime(remaining);

      process.stdout.write(
        `\r🟢 Syncing ${this.entityName}: ${progressBar} ${percentage}% (${this.currentRecords.toLocaleString()}/${this.totalRecords.toLocaleString()}) | ⏱️  ${elapsedStr} elapsed | 🕒 ${remainingStr} left`,
      );
    } else {
      // We don't know the total, show records fetched
      process.stdout.write(
        `\r🟢 Syncing ${this.entityName}: ${this.currentRecords.toLocaleString()} records fetched | ⏱️  ${elapsedStr} elapsed`,
      );
    }
  }

  private createProgressBar(percentage: number): string {
    const width = 20;
    const filled = Math.min(width, Math.floor((width * percentage) / 100));
    const empty = Math.max(0, width - filled);
    return "█".repeat(filled) + "░".repeat(empty);
  }

  private formatTime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h${(minutes % 60).toString().padStart(2, "0")}m`;
    } else if (minutes > 0) {
      return `${minutes}m${(seconds % 60).toString().padStart(2, "0")}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Main sync function
export async function performSync(
  dataSourceId: string,
  destination: string,
  entity: string | undefined,
  isIncremental: boolean = false,
  logger?: SyncLogger,
) {
  const syncMode = isIncremental ? "incremental" : "full";

  // Validate configuration
  const validation = databaseDataSourceManager.validateConfig();
  if (!validation.valid) {
    const errorMsg =
      "Configuration validation failed: " + validation.errors.join(", ");
    logger?.log("error", errorMsg);
    throw new Error(errorMsg);
  }

  // Get the data source
  const dataSource =
    await databaseDataSourceManager.getDataSource(dataSourceId);
  if (!dataSource) {
    const errorMsg = `Data source '${dataSourceId}' not found`;
    logger?.log("error", errorMsg);
    const allSources = await databaseDataSourceManager.getActiveDataSources();
    logger?.log(
      "info",
      "Available data sources:",
      allSources.map(s => ({ name: s.name, id: s.id })),
    );
    throw new Error(errorMsg);
  }

  if (!dataSource.active) {
    const errorMsg = `Data source '${dataSource.name}' is not active`;
    logger?.log("error", errorMsg);
    throw new Error(errorMsg);
  }

  // Try to get destination from database-based destinations first
  const destinationDb =
    await getDestinationManager().getDestination(destination);

  if (!destinationDb) {
    const errorMsg = `Destination database '${destination}' not found`;
    logger?.log("error", errorMsg);
    const dbDestinations = await getDestinationManager().listDestinations();
    logger?.log(
      "info",
      "Available destinations:",
      dbDestinations.map(d => d.name),
    );
    throw new Error(errorMsg);
  }

  // Check if connector exists in registry
  if (!syncConnectorRegistry.hasConnector(dataSource.type)) {
    const errorMsg = `No connector found for source type: ${dataSource.type}`;
    logger?.log("error", errorMsg);
    const availableTypes = syncConnectorRegistry.getAvailableTypes();
    logger?.log("info", "Available connector types:", availableTypes);
    throw new Error(errorMsg);
  }

  // Get connector from registry
  const connector = await syncConnectorRegistry.getConnector(dataSource);
  if (!connector) {
    const errorMsg = `Failed to create connector for type: ${dataSource.type}`;
    logger?.log("error", errorMsg);
    throw new Error(errorMsg);
  }

  // Test connection first
  const connectionTest = await connector.testConnection();
  if (!connectionTest.success) {
    const errorMsg = `Failed to connect to ${dataSource.type}: ${connectionTest.message}`;
    logger?.log("error", errorMsg, { details: connectionTest.details });
    throw new Error(errorMsg);
  }

  logger?.log("info", `Successfully connected to ${dataSource.type}`);

  // Create sync options
  const syncOptions: SyncOptions = {
    targetDatabase: destinationDb,
    progress: new ProgressReporter(entity || "all entities", undefined, logger),
    syncMode: syncMode,
  };

  // Perform sync
  logger?.log("info", `Starting ${syncMode} sync...`);
  logger?.log("info", `Source: ${dataSource.name} (${dataSource.type})`);
  logger?.log("info", `Destination: ${destinationDb.name}`);
  if (entity) {
    logger?.log("info", `Entity: ${entity}`);
  }

  const startTime = Date.now();

  try {
    if (entity) {
      // Sync specific entity
      const availableEntities = connector.getAvailableEntities();
      if (!availableEntities.includes(entity)) {
        const errorMsg = `Entity '${entity}' is not supported by ${dataSource.type} connector. Available: ${availableEntities.join(", ")}`;
        logger?.log("error", errorMsg);
        throw new Error(errorMsg);
      }

      syncOptions.entity = entity;
      await connector.syncEntity(entity, syncOptions);
    } else {
      // Sync all entities
      await connector.syncAll(syncOptions);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger?.log("info", `Sync completed successfully in ${duration}s`);
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const errorMsg = `Sync failed after ${duration}s: ${error instanceof Error ? error.message : String(error)}`;
    logger?.log("error", errorMsg, {
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(errorMsg, { cause: error });
  }
}
