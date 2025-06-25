import { Command } from "commander";
import inquirer from "inquirer";
import { syncConnectorRegistry } from "./connector-registry";
import { MongoClient, Db, ObjectId } from "mongodb";
import * as crypto from "crypto";
import * as dotenv from "dotenv";
import { SyncOptions } from "../api/src/connectors/base/BaseConnector";

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
let databaseDestinationManager: DatabaseDestinationManager | null = null;
function getDestinationManager() {
  if (!databaseDestinationManager) {
    databaseDestinationManager = new DatabaseDestinationManager();
  }
  return databaseDestinationManager;
}

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

// Main sync function
async function performSync(
  dataSourceId: string,
  destination: string,
  entity?: string,
  isIncremental: boolean = false,
) {
  const syncMode = isIncremental ? "incremental" : "full";

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
    await getDestinationManager().getDestination(destination);

  if (!destinationDb) {
    console.error(`❌ Destination database '${destination}' not found`);
    console.log("\nAvailable destinations:");

    // List database-based destinations
    const dbDestinations = await getDestinationManager().listDestinations();
    if (dbDestinations.length > 0) {
      console.log("  Database destinations:");
      dbDestinations.forEach(db => console.log(`    - ${db.name}`));
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

// Interactive mode functions
async function interactiveMode() {
  console.log("🚀 Welcome to the Interactive Data Sync Tool\n");

  try {
    // Get available data sources
    const dataSources = await databaseDataSourceManager.getActiveDataSources();
    if (dataSources.length === 0) {
      console.error("❌ No active data sources found!");
      console.log("Please create data sources in your application first.");
      process.exit(1);
    }

    // Get available destinations
    const destinations = await getDestinationManager().listDestinations();
    if (destinations.length === 0) {
      console.error("❌ No destination databases found!");
      console.log("Please create destination databases in your application first.");
      process.exit(1);
    }

    // Prompt for data source
    const sourceChoices = dataSources.map(s => ({
      name: `${s.name} (${s.type})`,
      value: s.id,
      short: s.name,
    }));

    const { dataSourceId } = await inquirer.prompt([
      {
        type: "list",
        name: "dataSourceId",
        message: "Select a data source:",
        choices: sourceChoices,
      },
    ]);

    // Get selected data source details
    const selectedSource = dataSources.find(s => s.id === dataSourceId);
    if (!selectedSource) {
      throw new Error("Selected data source not found");
    }

    // Prompt for destination
    const destChoices = destinations.map(d => ({
      name: d.name,
      value: d.id,
      short: d.name,
    }));

    const { destinationId } = await inquirer.prompt([
      {
        type: "list",
        name: "destinationId",
        message: "Select a destination database:",
        choices: destChoices,
      },
    ]);

    // Get available entities for the selected source
    const connector = await syncConnectorRegistry.getConnector(selectedSource);
    if (!connector) {
      throw new Error(`Failed to create connector for type: ${selectedSource.type}`);
    }

    const availableEntities = connector.getAvailableEntities();

    // Prompt for entity selection
    const entityChoices = [
      { name: "All entities", value: null },
      ...availableEntities.map(e => ({ name: e, value: e })),
    ];

    const { entity } = await inquirer.prompt([
      {
        type: "list",
        name: "entity",
        message: "Select entity to sync:",
        choices: entityChoices,
      },
    ]);

    // Prompt for sync mode
    const { syncMode } = await inquirer.prompt([
      {
        type: "list",
        name: "syncMode",
        message: "Select sync mode:",
        choices: [
          {
            name: "Full sync (replace all data)",
            value: "full",
            short: "Full",
          },
          {
            name: "Incremental sync (update changed data only)",
            value: "incremental",
            short: "Incremental",
          },
        ],
      },
    ]);

    // Confirm before proceeding
    console.log("\n📋 Sync Configuration:");
    console.log(`   Source: ${selectedSource.name} (${selectedSource.type})`);
    console.log(`   Destination: ${destinations.find(d => d.id === destinationId)?.name}`);
    console.log(`   Entity: ${entity || "All entities"}`);
    console.log(`   Mode: ${syncMode === "incremental" ? "Incremental" : "Full"}`);

    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: "Do you want to proceed with this sync?",
        default: true,
      },
    ]);

    if (!confirm) {
      console.log("❌ Sync cancelled by user");
      process.exit(0);
    }

    // Perform the sync
    await performSync(
      dataSourceId,
      destinationId,
      entity || undefined,
      syncMode === "incremental",
    );
  } catch (error) {
    console.error("❌ Interactive mode error:", error);
    process.exit(1);
  }
}

// Create commander program
const program = new Command();

program
  .name("sync")
  .description("Sync data from various sources to destination databases")
  .version("1.0.0")
  .helpOption('-h, --help', 'display help for command')
  .argument("[source]", "Name or ID of the data source to sync from")
  .argument("[destination]", "Name or ID of the destination database")
  .argument("[entity]", "Specific entity to sync (optional)")
  .option("--incremental, --inc", "Perform incremental sync (only sync new/updated records)")
  .option("-i, --interactive", "Run in interactive mode")
  .action(async (source, destination, entity, options) => {
    // If no arguments provided or interactive flag is set, run interactive mode
    if ((!source && !destination) || options.interactive) {
      await interactiveMode();
    } else if (!source || !destination) {
      // Don't show error for help command
      if (!process.argv.includes('--help') && !process.argv.includes('-h')) {
        // If some but not all required arguments are provided, show error
        console.error("❌ Both source and destination are required in non-interactive mode");
        console.log("Use --interactive or -i flag to run in interactive mode.\n");
        process.exit(1);
      }
    } else {
      // Run with provided arguments
      await performSync(source, destination, entity, options.incremental);
    }
  })
  .addHelpText("after", `
Examples:
  $ pnpm run sync                                    # Interactive mode
  $ pnpm run sync --interactive                      # Force interactive mode
  $ pnpm run sync "My Stripe Source" "analytics_db"  # Sync all entities
  $ pnpm run sync stripe-prod analytics_db customers # Sync specific entity
  $ pnpm run sync close-crm reporting_db leads --incremental
  
Available Commands:
  When run without arguments, the tool will guide you through an interactive
  selection process for all options.
  `);

// Parse command line arguments
try {
  program.parse(process.argv);
} catch (error) {
  // Commander throws on help, which is expected
  if (error && (error as any).code === 'commander.help') {
    process.exit(0);
  }
  throw error;
}
