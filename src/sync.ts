import { syncConnectorRegistry } from "./connector-registry";
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
  const isFullSync = !isIncremental; // default full sync unless incremental specified

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

  // Get sync service from registry
  const syncService = await syncConnectorRegistry.getSyncService(dataSource);
  if (!syncService) {
    console.error(
      `❌ Failed to create sync service for type: ${dataSource.type}`,
    );
    process.exit(1);
  }

  // Handle sync logic based on connector type
  switch (dataSource.type) {
    case "close":
      await syncWithCloseLogic(
        syncService,
        entity,
        destinationDb,
        isFullSync,
        isIncremental,
      );
      break;
    case "stripe":
      await syncWithStripeLogic(
        syncService,
        entity,
        destinationDb,
        isFullSync,
        isIncremental,
      );
      break;
    case "graphql":
      await syncWithGraphQLLogic(
        syncService,
        dataSource,
        entity,
        destinationDb,
        isFullSync,
        isIncremental,
      );
      break;
    case "mongodb":
      console.error(
        "❌ MongoDB data sources cannot be synced (they are sync targets)",
      );
      process.exit(1);
      break;
    default:
      // For any other connector types, try to use a generic sync approach
      await syncWithGenericLogic(
        syncService,
        entity,
        destinationDb,
        isFullSync,
      );
      break;
  }

  console.log("\n✅ Sync completed successfully!");
  process.exit(0);
}

async function syncWithCloseLogic(
  syncService: any,
  entity?: string,
  targetDb?: any,
  isFullSync?: boolean,
  isIncremental?: boolean,
) {
  if (!entity) {
    // Sync all entities
    console.log(`\n🔄 Syncing all entities for Close data source`);
    await syncService.syncAll(targetDb);
    return;
  }

  // Sync specific entity
  console.log(`\n🔄 Syncing ${entity} for Close data source`);
  const progress = new ProgressReporter(entity);

  // Map entity names to sync methods
  const entityMethods: { [key: string]: string } = {
    leads: isIncremental ? "syncLeadsIncremental" : "syncLeads",
    lead: isIncremental ? "syncLeadsIncremental" : "syncLeads",
    opportunities: isIncremental
      ? "syncOpportunitiesIncremental"
      : "syncOpportunities",
    opportunity: isIncremental
      ? "syncOpportunitiesIncremental"
      : "syncOpportunities",
    opps: isIncremental ? "syncOpportunitiesIncremental" : "syncOpportunities",
    activities: isIncremental ? "syncActivitiesIncremental" : "syncActivities",
    activity: isIncremental ? "syncActivitiesIncremental" : "syncActivities",
    contacts: isIncremental ? "syncContactsIncremental" : "syncContacts",
    contact: isIncremental ? "syncContactsIncremental" : "syncContacts",
    users: isIncremental ? "syncUsersIncremental" : "syncUsers",
    user: isIncremental ? "syncUsersIncremental" : "syncUsers",
    custom_fields: "syncCustomFields",
    customfields: "syncCustomFields",
  };

  const methodName = entityMethods[entity.toLowerCase()];
  if (!methodName || !syncService[methodName]) {
    console.error(`❌ Unknown entity '${entity}' for Close.com`);
    console.log(
      `Available entities: leads, opportunities, activities, contacts, users, custom_fields`,
    );
    process.exit(1);
  }

  await syncService[methodName](targetDb, progress);
}

async function syncWithStripeLogic(
  syncService: any,
  entity?: string,
  targetDb?: any,
  isFullSync?: boolean,
  _incremental?: boolean,
) {
  if (isFullSync) {
    if (entity) {
      // Full sync with staging + hot swap for specific entity
      console.log(
        `\n🔄 Starting full sync with staging for ${entity} in Stripe`,
      );
      await syncService.syncEntityWithStaging(entity, targetDb);
    } else {
      // Full sync with staging + hot swap for all entities
      console.log(
        `\n🔄 Starting full sync with staging for all entities in Stripe`,
      );
      await syncService.syncAll(targetDb);
    }
    return;
  }

  if (!entity) {
    // Sync all entities with direct upserts
    console.log(`\n🔄 Syncing all entities (direct upsert mode) for Stripe`);
    await syncService.syncAllDirect(targetDb);
    return;
  }

  // Sync specific entity
  console.log(`\n🔄 Syncing ${entity} for Stripe`);
  const progress = new ProgressReporter(entity);

  // Map entity names to sync methods
  const entityMethods: { [key: string]: string } = {
    customers: "syncCustomers",
    customer: "syncCustomers",
    subscriptions: "syncSubscriptions",
    subscription: "syncSubscriptions",
    charges: "syncCharges",
    charge: "syncCharges",
    invoices: "syncInvoices",
    invoice: "syncInvoices",
    products: "syncProducts",
    product: "syncProducts",
    plans: "syncPlans",
    plan: "syncPlans",
  };

  const methodName = entityMethods[entity.toLowerCase()];
  if (!methodName || !syncService[methodName]) {
    console.error(`❌ Unknown entity '${entity}' for Stripe`);
    console.log(
      `Available entities: customers, subscriptions, charges, invoices, products, plans`,
    );
    process.exit(1);
  }

  await syncService[methodName](targetDb, progress);
}

async function syncWithGraphQLLogic(
  syncService: any,
  dataSource: any,
  entity?: string,
  targetDb?: any,
  _isFullSync?: boolean,
  _incremental?: boolean,
) {
  if (!entity) {
    // Sync all entities with direct upserts
    console.log(`\n🔄 Syncing all entities for GraphQL data source`);
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
  console.log(`\n🔄 Syncing ${entity} for GraphQL source`);
  const progress = new ProgressReporter(entity);
  await syncService.syncEntity(queryConfig, targetDb, progress);
}

async function syncWithGenericLogic(
  syncService: any,
  entity?: string,
  targetDb?: any,
  _isFullSync?: boolean,
) {
  if (!entity) {
    // Try to sync all entities
    console.log(`\n🔄 Syncing all entities with generic logic`);
    if (syncService.syncAll) {
      await syncService.syncAll(targetDb);
    } else {
      console.error("❌ Sync service does not support syncAll method");
      process.exit(1);
    }
    return;
  }

  // Try to sync specific entity
  console.log(`\n🔄 Syncing ${entity} with generic logic`);
  const progress = new ProgressReporter(entity);

  if (syncService.syncEntity) {
    await syncService.syncEntity(entity, targetDb, progress);
  } else {
    console.error("❌ Sync service does not support syncEntity method");
    process.exit(1);
  }
}

function showUsage() {
  // Get available connector types from registry
  const availableTypes = syncConnectorRegistry.getAvailableTypes();

  console.log(`
Usage: pnpm run sync <source_id> <destination> [entity] [flags]

Arguments:
  source_id     The ID of the data source to sync from (database ID or name)
  destination   The destination database name
  entity        (Optional) Specific entity to sync

Flags:
  --full        Full sync with staging + hot swap (enables deletion detection)
  --inc, --incremental  Incremental sync (direct upserts, faster)
  If omitted, a FULL sync with staging + hot swap is run by default.

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

Available connector types: ${availableTypes.join(", ")}
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
