import { databaseDataSourceManager } from "./database-data-source-manager";
import { CloseSyncService } from "./sync-close";
import { StripeSyncService } from "./sync-stripe";
import { GraphQLSyncService } from "./sync-graphql";
import { MongoClient, Db, ObjectId } from "mongodb";
import * as crypto from "crypto";
import * as dotenv from "dotenv";

dotenv.config();

// Database-based destination manager for app destinations
class DatabaseDestinationManager {
  private client: MongoClient;
  private db!: Db;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const connectionString = process.env.DATABASE_URL;
    this.client = new MongoClient(connectionString);
  }

  private async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db("mako");
  }

  private async disconnect(): Promise<void> {
    await this.client.close();
  }

  async getDestination(nameOrId: string): Promise<any> {
    try {
      await this.connect();
      const collection = this.db.collection("databases");

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
    try {
      await this.connect();
      const collection = this.db.collection("databases");
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
      const percentage = Math.floor(
        (this.currentRecords / this.totalRecords) * 100,
      );
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
    const filled = Math.floor((width * percentage) / 100);
    const empty = width - filled;
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

// Define available entities for each source type
const SOURCE_ENTITIES = {
  close: [
    "leads",
    "opportunities",
    "activities",
    "contacts",
    "users",
    "custom_fields",
  ],
  stripe: [
    "customers",
    "subscriptions",
    "charges",
    "invoices",
    "products",
    "plans",
  ],
  graphql: [
    "custom", // GraphQL sources use custom-defined entities from configuration
  ],
  mongodb: [], // MongoDB sources don't have entities to sync
};

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

  const isFullSync = flags.includes("--full");

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

  // --full flag can be used with or without entity specification

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

  // Handle different source types
  switch (dataSource.type) {
    case "close":
      await syncClose(dataSource, entity, destinationDb, isFullSync);
      break;
    case "stripe":
      await syncStripe(dataSource, entity, destinationDb, isFullSync);
      break;
    case "graphql":
      await syncGraphQL(dataSource, entity, destinationDb, isFullSync);
      break;
    case "mongodb":
      console.error(
        "❌ MongoDB data sources cannot be synced (they are sync targets)",
      );
      process.exit(1);
      break;
    default:
      console.error(
        `❌ Sync not implemented for source type: ${dataSource.type}`,
      );
      process.exit(1);
  }

  console.log("\n✅ Sync completed successfully!");
  process.exit(0);
}

async function syncClose(
  dataSource: any,
  entity?: string,
  targetDb?: any,
  isFullSync?: boolean,
) {
  const syncService = new CloseSyncService(dataSource);

  if (isFullSync) {
    if (entity) {
      // Full sync with staging for specific entity (not implemented for Close yet)
      console.log(
        `\n🔄 Starting full sync with staging for ${entity} in ${dataSource.name}`,
      );
      console.log(
        "⚠️  Note: Staging sync for individual Close entities not yet implemented, using direct sync",
      );
      // Fall back to direct entity sync for now
    } else {
      // Full sync with staging for all entities
      console.log(
        `\n🔄 Starting full sync with staging for all entities in ${dataSource.name}`,
      );
      await syncService.syncAll(targetDb);
      return;
    }
  }

  if (!entity) {
    // Sync all entities with direct upserts
    console.log(
      `\n🔄 Syncing all entities (direct upsert mode) for ${dataSource.name}`,
    );
    await syncService.syncAll(targetDb);
    return;
  }

  // Sync specific entity
  console.log(`\n🔄 Syncing ${entity} for ${dataSource.name}`);
  const progress = new ProgressReporter(entity);

  switch (entity.toLowerCase()) {
    case "leads":
    case "lead":
      await syncService.syncLeads(targetDb, progress);
      break;
    case "opportunities":
    case "opportunity":
      await syncService.syncOpportunities(targetDb, progress);
      break;
    case "activities":
    case "activity":
      await syncService.syncActivities(targetDb, progress);
      break;
    case "contacts":
    case "contact":
      await syncService.syncContacts(targetDb, progress);
      break;
    case "users":
    case "user":
      await syncService.syncUsers(targetDb, progress);
      break;
    case "custom_fields":
    case "customfields":
      await syncService.syncCustomFields(targetDb, progress);
      break;
    default:
      console.error(`❌ Unknown entity '${entity}' for Close.com`);
      console.log(`Available entities: ${SOURCE_ENTITIES.close.join(", ")}`);
      process.exit(1);
  }
}

async function syncStripe(
  dataSource: any,
  entity?: string,
  targetDb?: any,
  isFullSync?: boolean,
) {
  const syncService = new StripeSyncService(dataSource);

  if (isFullSync) {
    if (entity) {
      // Full sync with staging + hot swap for specific entity
      console.log(
        `\n🔄 Starting full sync with staging for ${entity} in ${dataSource.name}`,
      );
      await syncService.syncEntityWithStaging(entity, targetDb);
    } else {
      // Full sync with staging + hot swap for all entities
      console.log(
        `\n🔄 Starting full sync with staging for all entities in ${dataSource.name}`,
      );
      await syncService.syncAll(targetDb);
    }
    return;
  }

  if (!entity) {
    // Sync all entities with direct upserts
    console.log(
      `\n🔄 Syncing all entities (direct upsert mode) for ${dataSource.name}`,
    );
    await syncService.syncAllDirect(targetDb);
    return;
  }

  // Sync specific entity
  console.log(`\n🔄 Syncing ${entity} for ${dataSource.name}`);
  const progress = new ProgressReporter(entity);

  switch (entity.toLowerCase()) {
    case "customers":
    case "customer":
      await syncService.syncCustomers(targetDb, progress);
      break;
    case "subscriptions":
    case "subscription":
      await syncService.syncSubscriptions(targetDb, progress);
      break;
    case "charges":
    case "charge":
      await syncService.syncCharges(targetDb, progress);
      break;
    case "invoices":
    case "invoice":
      await syncService.syncInvoices(targetDb, progress);
      break;
    case "products":
    case "product":
      await syncService.syncProducts(targetDb, progress);
      break;
    case "plans":
    case "plan":
      await syncService.syncPlans(targetDb, progress);
      break;
    default:
      console.error(`❌ Unknown entity '${entity}' for Stripe`);
      console.log(`Available entities: ${SOURCE_ENTITIES.stripe.join(", ")}`);
      process.exit(1);
  }
}

async function syncGraphQL(
  dataSource: any,
  entity?: string,
  targetDb?: any,
  isFullSync?: boolean,
) {
  const syncService = new GraphQLSyncService(dataSource);

  if (isFullSync) {
    if (entity) {
      // Full sync with staging for specific entity (not implemented for GraphQL yet)
      console.log(
        `\n🔄 Starting full sync with staging for ${entity} in ${dataSource.name}`,
      );
      console.log(
        "⚠️  Note: Staging sync for individual GraphQL entities not yet implemented, using direct sync",
      );
      // Fall back to direct entity sync for now
    } else {
      // Full sync with staging for all entities
      console.log(
        `\n🔄 Starting full sync with staging for all entities in ${dataSource.name}`,
      );
      await syncService.syncAll(targetDb);
      return;
    }
  }

  if (!entity) {
    // Sync all entities with direct upserts
    console.log(
      `\n🔄 Syncing all entities (direct upsert mode) for ${dataSource.name}`,
    );
    await syncService.syncAll(targetDb);
    return;
  }

  const queries: any[] = dataSource.connection.queries || [];
  const queryConfig = queries.find(
    (q: any) => q.name.toLowerCase() === entity.toLowerCase(),
  );

  if (!queryConfig) {
    console.error(`❌ Unknown entity '${entity}' for GraphQL source`);
    console.log(
      `Available entities: ${queries.map((q: any) => q.name).join(", ")}`,
    );
    process.exit(1);
  }

  // Sync specific entity
  console.log(`\n🔄 Syncing ${entity} for ${dataSource.name}`);
  const progress = new ProgressReporter(entity);
  await syncService.syncEntity(queryConfig, targetDb, progress);
}

function showUsage() {
  console.log(`
Usage: pnpm run sync <source_id> <destination> [entity] [flags]

Arguments:
  source_id     The ID of the data source to sync from (database ID or name)
  destination   The destination database name
  entity        (Optional) Specific entity to sync

Flags:
  --full        Full sync with staging + hot swap (enables deletion detection)

Sync Modes:
  --full flag:    Uses staging + hot swap (enables deletion detection)
  No --full flag: Uses direct upserts (faster, incremental)
  
  Entity:         Syncs only specified entity
  No entity:      Syncs all entities

Examples:
  pnpm run sync es_stripe RevOps --full           # Full sync all entities with staging + hot swap
  pnpm run sync es_stripe RevOps                  # Direct sync all entities (upsert mode)
  pnpm run sync es_stripe RevOps customers --full # Full sync customers only with staging + hot swap
  pnpm run sync es_stripe RevOps customers        # Direct sync customers only (upsert mode)

Available entities by source type:
  Close.com: ${SOURCE_ENTITIES.close.join(", ")}
  Stripe: ${SOURCE_ENTITIES.stripe.join(", ")}
`);
}

// Execute
if (require.main === module) {
  main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { main as sync };
