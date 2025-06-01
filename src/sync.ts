import { dataSourceManager } from "./data-source-manager";
import { CloseSyncService } from "./sync-close";
import { StripeSyncService } from "./sync-stripe";
import * as dotenv from "dotenv";

dotenv.config();

// Define available entities for each source type
const SOURCE_ENTITIES = {
  close: ["leads", "opportunities", "activities", "contacts", "users", "custom-fields"],
  stripe: ["customers", "subscriptions", "charges", "invoices", "products", "plans"],
  mongodb: [] // MongoDB sources don't have entities to sync
};

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    showUsage();
    process.exit(1);
  }

  // Parse arguments
  const dataSourceId = args[0];
  const entity = args[1]; // optional
  const targetDbId = args.find(arg => arg.startsWith('--db='))?.split('=')[1];

  // Validate configuration
  const validation = dataSourceManager.validateConfig();
  if (!validation.valid) {
    console.error("Configuration validation failed:");
    validation.errors.forEach((error) => console.error(`  - ${error}`));
    process.exit(1);
  }

  // Get the data source
  const dataSource = dataSourceManager.getDataSource(dataSourceId);
  if (!dataSource) {
    console.error(`❌ Data source '${dataSourceId}' not found`);
    console.log("\nAvailable data sources:");
    const allSources = dataSourceManager.getActiveDataSources();
    allSources.forEach(s => console.log(`  - ${s.id}: ${s.name} (${s.type})`));
    process.exit(1);
  }

  if (!dataSource.active) {
    console.error(`❌ Data source '${dataSourceId}' is not active`);
    process.exit(1);
  }

  // Handle different source types
  switch (dataSource.type) {
    case "close":
      await syncClose(dataSource, entity, targetDbId);
      break;
    case "stripe":
      await syncStripe(dataSource, entity, targetDbId);
      break;
    case "mongodb":
      console.error(`❌ MongoDB data sources cannot be synced (they are sync targets)`);
      process.exit(1);
    default:
      console.error(`❌ Sync not implemented for source type: ${dataSource.type}`);
      process.exit(1);
  }

  console.log("\n✅ Sync completed successfully!");
}

async function syncClose(dataSource: any, entity?: string, targetDbId?: string) {
  const syncService = new CloseSyncService(dataSource);
  
  if (!entity) {
    // Sync all entities
    console.log(`\n🔄 Syncing all entities for ${dataSource.name}`);
    await syncService.syncAll(targetDbId);
    return;
  }

  // Sync specific entity
  console.log(`\n🔄 Syncing ${entity} for ${dataSource.name}`);
  
  switch (entity.toLowerCase()) {
    case "leads":
    case "lead":
      await syncService.syncLeads(targetDbId);
      break;
    case "opportunities":
    case "opportunity":
      await syncService.syncOpportunities(targetDbId);
      break;
    case "activities":
    case "activity":
      await syncService.syncActivities(targetDbId);
      break;
    case "contacts":
    case "contact":
      await syncService.syncContacts(targetDbId);
      break;
    case "users":
    case "user":
      await syncService.syncUsers(targetDbId);
      break;
    case "custom-fields":
    case "customfields":
      await syncService.syncCustomFields(targetDbId);
      break;
    default:
      console.error(`❌ Unknown entity '${entity}' for Close.com`);
      console.log(`Available entities: ${SOURCE_ENTITIES.close.join(", ")}`);
      process.exit(1);
  }
}

async function syncStripe(dataSource: any, entity?: string, targetDbId?: string) {
  const syncService = new StripeSyncService(dataSource);
  
  if (!entity) {
    // Sync all entities
    console.log(`\n🔄 Syncing all entities for ${dataSource.name}`);
    await syncService.syncAll(targetDbId);
    return;
  }

  // Sync specific entity
  console.log(`\n🔄 Syncing ${entity} for ${dataSource.name}`);
  
  switch (entity.toLowerCase()) {
    case "customers":
    case "customer":
      await syncService.syncCustomers(targetDbId);
      break;
    case "subscriptions":
    case "subscription":
      await syncService.syncSubscriptions(targetDbId);
      break;
    case "charges":
    case "charge":
      await syncService.syncCharges(targetDbId);
      break;
    case "invoices":
    case "invoice":
      await syncService.syncInvoices(targetDbId);
      break;
    case "products":
    case "product":
      await syncService.syncProducts(targetDbId);
      break;
    case "plans":
    case "plan":
      await syncService.syncPlans(targetDbId);
      break;
    default:
      console.error(`❌ Unknown entity '${entity}' for Stripe`);
      console.log(`Available entities: ${SOURCE_ENTITIES.stripe.join(", ")}`);
      process.exit(1);
  }
}

function showUsage() {
  console.log(`
Usage: pnpm run sync <data_source_id> [entity] [options]

Examples:
  pnpm run sync close_spain                    # Sync all entities from close_spain
  pnpm run sync close_spain leads              # Sync only leads from close_spain
  pnpm run sync stripe_spain customers         # Sync only customers from stripe_spain
  pnpm run sync close_italy --db=warehouse_db  # Sync to a different database

Available entities by source type:
  Close.com: ${SOURCE_ENTITIES.close.join(", ")}
  Stripe: ${SOURCE_ENTITIES.stripe.join(", ")}

Options:
  --db=<database_id>  Target database to sync to (default: analytics_db)
`);
}

// Execute
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { main as sync }; 