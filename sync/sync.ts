import { syncConnectorRegistry } from "./connector-registry";
import { MongoClient, Db, ObjectId } from "mongodb";
import * as crypto from "crypto";
import * as dotenv from "dotenv";
import { SyncOptions } from "../api/src/connectors/base/BaseConnector";

dotenv.config();

// Database-based destination manager for app destinations
class DatabaseDestinationManager {
  private client: MongoClient;
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

  private async connect(): Promise<Db> {
    await this.client.connect();
    return this.client.db(this.databaseName);
  }

  private async disconnect(): Promise<void> {
    await this.client.close();
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

  async listDestinations(): Promise<string[]> {
    let db: Db | undefined;
    try {
      db = await this.connect();
      const collection = db.collection("databases");
      const destinations = await collection
        .find({}, { projection: { name: 1 } })
        .toArray();
      return destinations.map(d => d.name);
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

const databaseDestinationManager = new DatabaseDestinationManager();

// Import the database data source manager
import { databaseDataSourceManager } from "./database-data-source-manager";

// Progress reporter for sync operations
export class ProgressReporter {
  private startTime: Date;
  private totalRecords: number;
  private currentRecords: number = 0;
  private entityName: string;

  constructor(entityName: string, totalRecords?: number) {
    this.entityName = entityName;
    this.totalRecords = totalRecords || 0;
    this.startTime = new Date();
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

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showUsage();
    process.exit(1);
  }

  // Parse arguments and flags
  const flags = args.filter(arg => arg.startsWith("--"));
  const nonFlagArgs = args.filter(arg => !arg.startsWith("--"));

  const dataSourceId = nonFlagArgs[0];
  const destination = nonFlagArgs[1];
  const entity = nonFlagArgs[2]; // optional

  const isIncremental = flags.some(f => f === "--incremental" || f === "--inc");
  const syncMode = isIncremental ? "incremental" : "full"; // default full sync

  if (!dataSourceId) {
    console.error("❌ Data source ID is required");
    showUsage();
    process.exit(1);
  }

  if (!destination) {
    console.error("❌ Destination database is required");
    showUsage();
    process.exit(1);
  }

  // Validate configuration
  const validation = databaseDataSourceManager.validateConfig();
  if (!validation.valid) {
    console.error("Configuration validation failed:");
    validation.errors.forEach(error => console.error(`  - ${error}`));
    process.exit(1);
  }

  // Get the data source
  const dataSource =
    await databaseDataSourceManager.getDataSource(dataSourceId);
  if (!dataSource) {
    console.error(`❌ Data source '${dataSourceId}' not found`);
    console.log("\nAvailable data sources:");
    const allSources = await databaseDataSourceManager.getActiveDataSources();
    allSources.forEach(s =>
      console.log(`  - ${s.name}: ${s.type} (ID: ${s.id})`),
    );
    process.exit(1);
  }

  if (!dataSource.active) {
    console.error(`❌ Data source '${dataSourceId}' is not active`);
    process.exit(1);
  }

  // Try to get destination from database-based destinations first
  const destinationDb =
    await databaseDestinationManager.getDestination(destination);

  if (!destinationDb) {
    console.error(`❌ Destination database '${destination}' not found`);
    console.log("\nAvailable destinations:");

    // List database-based destinations
    const dbDestinations = await databaseDestinationManager.listDestinations();
    if (dbDestinations.length > 0) {
      console.log("  Database destinations:");
      dbDestinations.forEach(db => console.log(`    - ${db}`));
    }

    process.exit(1);
  }

  // Check if connector exists in registry
  if (!syncConnectorRegistry.hasConnector(dataSource.type)) {
    console.error(`❌ No connector found for source type: ${dataSource.type}`);
    console.log("\nAvailable connector types:");
    syncConnectorRegistry
      .getAvailableTypes()
      .forEach((type: string) => console.log(`  - ${type}`));
    process.exit(1);
  }

  // Get connector from registry
  const connector = await syncConnectorRegistry.getConnector(dataSource);
  if (!connector) {
    console.error(`❌ Failed to create connector for type: ${dataSource.type}`);
    process.exit(1);
  }

  // Test connection first
  const connectionTest = await connector.testConnection();
  if (!connectionTest.success) {
    console.error(
      `❌ Failed to connect to ${dataSource.type}: ${connectionTest.message}`,
    );
    if (connectionTest.details) {
      console.error(`Details: ${connectionTest.details}`);
    }
    process.exit(1);
  }

  console.log(`✅ Successfully connected to ${dataSource.type}`);

  // Create sync options
  const syncOptions: SyncOptions = {
    targetDatabase: destinationDb,
    progress: new ProgressReporter(entity || "all entities"),
    syncMode: syncMode,
  };

  // Perform sync
  console.log(`\n🔄 Starting ${syncMode} sync...`);
  console.log(`📊 Source: ${dataSource.name} (${dataSource.type})`);
  console.log(`🎯 Destination: ${destinationDb.name}`);
  if (entity) {
    console.log(`📦 Entity: ${entity}`);
  }
  console.log("");

  const startTime = Date.now();

  try {
    if (entity) {
      // Sync specific entity
      const availableEntities = connector.getAvailableEntities();
      if (!availableEntities.includes(entity)) {
        console.error(
          `❌ Entity '${entity}' is not supported by ${dataSource.type} connector`,
        );
        console.log(`Available entities: ${availableEntities.join(", ")}`);
        process.exit(1);
      }

      syncOptions.entity = entity;
      await connector.syncEntity(entity, syncOptions);
    } else {
      // Sync all entities
      await connector.syncAll(syncOptions);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Sync completed successfully in ${duration}s`);
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`\n❌ Sync failed after ${duration}s:`, error);
    process.exit(1);
  }
}

function showUsage() {
  console.log(`
Usage: npm run sync -- <data-source> <destination-db> [entity] [options]

Arguments:
  data-source      Name or ID of the data source to sync from
  destination-db   Name or ID of the destination database
  entity           (Optional) Specific entity to sync

Options:
  --incremental, --inc   Perform incremental sync (only sync new/updated records)

Examples:
  npm run sync -- "My Stripe Source" "analytics_db"
  npm run sync -- stripe-prod analytics_db customers
  npm run sync -- close-crm reporting_db leads --incremental
  npm run sync -- graphql-api warehouse --inc

Available Data Sources:
  Run without arguments to see available data sources.
`);
}

main().catch(error => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
