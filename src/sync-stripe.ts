import Stripe from "stripe";
import { MongoClient, Db, Collection } from "mongodb";
import * as dotenv from "dotenv";
import { tenantManager } from "./tenant-manager";
import type { TenantConfig } from "./tenant-manager";

dotenv.config();

interface SyncStats {
  totalRecords: number;
  batchesProcessed: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
}

class StripeSyncService {
  private client: MongoClient;
  private db!: Db;
  private tenant: TenantConfig;
  private stripe: Stripe;
  private rateLimitDelay: number;
  private maxRetries: number;
  private batchSize: number;

  constructor(tenant: TenantConfig) {
    this.tenant = tenant;

    // Get Stripe configuration for this tenant
    const stripeConfig = tenant.sources.stripe;
    if (!stripeConfig?.enabled) {
      throw new Error(`Stripe is not enabled for tenant ${tenant.id}`);
    }

    if (!stripeConfig.api_key) {
      throw new Error(`Stripe API key is required for tenant ${tenant.id}`);
    }

    // Initialize Stripe client
    this.stripe = new Stripe(stripeConfig.api_key, {
      apiVersion: "2025-05-28.basil", // Latest API version
    });

    this.rateLimitDelay = tenant.settings.rate_limit_delay_ms || 200;
    this.maxRetries = tenant.settings.max_retries || 5;
    this.batchSize = tenant.settings.sync_batch_size || 100;

    const globalConfig = tenantManager.getGlobalConfig();
    this.client = new MongoClient(globalConfig.mongodb.connection_string);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async connect(): Promise<void> {
    await this.client.connect();
    const globalConfig = tenantManager.getGlobalConfig();
    this.db = this.client.db(globalConfig.mongodb.database);
    console.log(`Connected to MongoDB for tenant: ${this.tenant.name}`);
  }

  private async disconnect(): Promise<void> {
    await this.client.close();
    console.log("Disconnected from MongoDB");
  }

  private getCollectionName(baseCollection: string): string {
    return `${this.tenant.id}_stripe_${baseCollection}`;
  }

  async syncSubscriptions(): Promise<SyncStats> {
    const collectionName = this.getCollectionName("subscriptions");
    const stats: SyncStats = {
      totalRecords: 0,
      batchesProcessed: 0,
      errors: 0,
      startTime: new Date(),
    };

    try {
      await this.connect();

      // Clear and prepare staging collection
      const stagingCollectionName = `${collectionName}_staging`;
      const stagingCollection = this.db.collection(stagingCollectionName);
      await stagingCollection.deleteMany({});
      console.log(`Cleared ${stagingCollectionName} collection`);

      console.log("Starting Stripe subscriptions sync...");

      let hasMore = true;
      let startingAfter: string | undefined;
      let processedCount = 0;

      while (hasMore) {
        try {
          await this.delay(this.rateLimitDelay);

          // Fetch subscriptions page
          const subscriptions = await this.stripe.subscriptions.list({
            limit: this.batchSize,
            starting_after: startingAfter,
            expand: ["data.customer", "data.items.data.price"], // Expand related data (limited to 4 levels)
          });

          if (subscriptions.data.length > 0) {
            // Add tenant metadata to each record
            const recordsWithMetadata = subscriptions.data.map(
              (subscription) => ({
                ...subscription,
                _tenant_id: this.tenant.id,
                _tenant_name: this.tenant.name,
                _sync_timestamp: new Date(),
              })
            );

            // Use bulk replace operations
            const bulkOps = recordsWithMetadata.map((record) => ({
              replaceOne: {
                filter: { id: record.id },
                replacement: record,
                upsert: true,
              },
            }));

            await stagingCollection.bulkWrite(bulkOps);
            processedCount += subscriptions.data.length;

            // Update progress
            console.log(
              `Processed ${processedCount} subscriptions (batch ${
                stats.batchesProcessed + 1
              })`
            );

            // Set up for next page
            startingAfter =
              subscriptions.data[subscriptions.data.length - 1].id;
          }

          hasMore = subscriptions.has_more;
          stats.batchesProcessed++;
          stats.totalRecords = processedCount;
        } catch (error) {
          console.error("Error processing batch:", error);
          stats.errors++;

          // Continue with next batch on non-critical errors
          if (stats.errors > 10) {
            throw new Error("Too many errors, aborting sync");
          }

          // If we have a starting_after, continue from there
          if (startingAfter) {
            hasMore = true;
          }
        }
      }

      // Swap collections (atomic operation)
      console.log("Swapping collections...");
      const mainCollection = this.db.collection(collectionName);

      // Drop old collection and rename staging to main
      await mainCollection.drop().catch(() => {}); // Ignore error if collection doesn't exist
      await stagingCollection.rename(collectionName);

      console.log("Collection swap completed");
    } finally {
      stats.endTime = new Date();
      await this.disconnect();
    }

    return stats;
  }

  async syncCustomers(): Promise<SyncStats> {
    const collectionName = this.getCollectionName("customers");
    const stats: SyncStats = {
      totalRecords: 0,
      batchesProcessed: 0,
      errors: 0,
      startTime: new Date(),
    };

    try {
      await this.connect();

      // Clear and prepare staging collection
      const stagingCollectionName = `${collectionName}_staging`;
      const stagingCollection = this.db.collection(stagingCollectionName);
      await stagingCollection.deleteMany({});
      console.log(`Cleared ${stagingCollectionName} collection`);

      console.log("Starting Stripe customers sync...");

      let hasMore = true;
      let startingAfter: string | undefined;
      let processedCount = 0;

      while (hasMore) {
        try {
          await this.delay(this.rateLimitDelay);

          // Fetch customers page
          const customers = await this.stripe.customers.list({
            limit: this.batchSize,
            starting_after: startingAfter,
            expand: ["data.subscriptions"], // Expand subscriptions
          });

          if (customers.data.length > 0) {
            // Add tenant metadata to each record
            const recordsWithMetadata = customers.data.map((customer) => ({
              ...customer,
              _tenant_id: this.tenant.id,
              _tenant_name: this.tenant.name,
              _sync_timestamp: new Date(),
            }));

            // Use bulk replace operations
            const bulkOps = recordsWithMetadata.map((record) => ({
              replaceOne: {
                filter: { id: record.id },
                replacement: record,
                upsert: true,
              },
            }));

            await stagingCollection.bulkWrite(bulkOps);
            processedCount += customers.data.length;

            // Update progress
            console.log(
              `Processed ${processedCount} customers (batch ${
                stats.batchesProcessed + 1
              })`
            );

            // Set up for next page
            startingAfter = customers.data[customers.data.length - 1].id;
          }

          hasMore = customers.has_more;
          stats.batchesProcessed++;
          stats.totalRecords = processedCount;
        } catch (error) {
          console.error("Error processing batch:", error);
          stats.errors++;

          // Continue with next batch on non-critical errors
          if (stats.errors > 10) {
            throw new Error("Too many errors, aborting sync");
          }

          // If we have a starting_after, continue from there
          if (startingAfter) {
            hasMore = true;
          }
        }
      }

      // Swap collections (atomic operation)
      console.log("Swapping collections...");
      const mainCollection = this.db.collection(collectionName);

      // Drop old collection and rename staging to main
      await mainCollection.drop().catch(() => {}); // Ignore error if collection doesn't exist
      await stagingCollection.rename(collectionName);

      console.log("Collection swap completed");
    } finally {
      stats.endTime = new Date();
      await this.disconnect();
    }

    return stats;
  }

  async syncInvoices(): Promise<SyncStats> {
    const collectionName = this.getCollectionName("invoices");
    const stats: SyncStats = {
      totalRecords: 0,
      batchesProcessed: 0,
      errors: 0,
      startTime: new Date(),
    };

    try {
      await this.connect();

      // Clear and prepare staging collection
      const stagingCollectionName = `${collectionName}_staging`;
      const stagingCollection = this.db.collection(stagingCollectionName);
      await stagingCollection.deleteMany({});
      console.log(`Cleared ${stagingCollectionName} collection`);

      console.log("Starting Stripe invoices sync...");

      let hasMore = true;
      let startingAfter: string | undefined;
      let processedCount = 0;

      while (hasMore) {
        try {
          await this.delay(this.rateLimitDelay);

          // Fetch invoices page
          const invoices = await this.stripe.invoices.list({
            limit: this.batchSize,
            starting_after: startingAfter,
            expand: ["data.customer", "data.subscription"], // Expand related data
          });

          if (invoices.data.length > 0) {
            // Add tenant metadata to each record
            const recordsWithMetadata = invoices.data.map((invoice) => ({
              ...invoice,
              _tenant_id: this.tenant.id,
              _tenant_name: this.tenant.name,
              _sync_timestamp: new Date(),
            }));

            // Use bulk replace operations
            const bulkOps = recordsWithMetadata.map((record) => ({
              replaceOne: {
                filter: { id: record.id },
                replacement: record,
                upsert: true,
              },
            }));

            await stagingCollection.bulkWrite(bulkOps);
            processedCount += invoices.data.length;

            // Update progress
            console.log(
              `Processed ${processedCount} invoices (batch ${
                stats.batchesProcessed + 1
              })`
            );

            // Set up for next page
            startingAfter = invoices.data[invoices.data.length - 1].id;
          }

          hasMore = invoices.has_more;
          stats.batchesProcessed++;
          stats.totalRecords = processedCount;
        } catch (error) {
          console.error("Error processing batch:", error);
          stats.errors++;

          // Continue with next batch on non-critical errors
          if (stats.errors > 10) {
            throw new Error("Too many errors, aborting sync");
          }

          // If we have a starting_after, continue from there
          if (startingAfter) {
            hasMore = true;
          }
        }
      }

      // Swap collections (atomic operation)
      console.log("Swapping collections...");
      const mainCollection = this.db.collection(collectionName);

      // Drop old collection and rename staging to main
      await mainCollection.drop().catch(() => {}); // Ignore error if collection doesn't exist
      await stagingCollection.rename(collectionName);

      console.log("Collection swap completed");
    } finally {
      stats.endTime = new Date();
      await this.disconnect();
    }

    return stats;
  }
}

// Load tenant configuration
function loadTenantConfig(): TenantConfig[] {
  try {
    // Validate configuration first
    const validation = tenantManager.validateConfig();
    if (!validation.valid) {
      console.error("Tenant configuration validation failed:");
      validation.errors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }

    return tenantManager.getTenantsWithSource("stripe");
  } catch (error) {
    console.error("Failed to load tenant configuration:", error);
    console.error(
      "Make sure config/tenants.yaml exists and environment variables are set"
    );
    process.exit(1);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const syncType = args[0] || "subscriptions";
  const tenantId = args[1]; // Optional tenant ID

  const tenants = loadTenantConfig();
  const targetTenants = tenantId
    ? tenants.filter((t) => t.id === tenantId)
    : tenants;

  if (targetTenants.length === 0) {
    console.error(
      `No tenants found${
        tenantId ? ` for ID: ${tenantId}` : ""
      } with Stripe enabled`
    );
    process.exit(1);
  }

  for (const tenant of targetTenants) {
    const sync = new StripeSyncService(tenant);

    try {
      let stats: SyncStats;

      console.log(
        `\n=== Starting Stripe ${syncType} sync for ${tenant.name} ===`
      );

      switch (syncType) {
        case "subscriptions":
          stats = await sync.syncSubscriptions();
          break;
        case "customers":
          stats = await sync.syncCustomers();
          break;
        case "invoices":
          stats = await sync.syncInvoices();
          break;
        case "all":
          console.log("Syncing all Stripe data...");
          const subsStats = await sync.syncSubscriptions();
          const custStats = await sync.syncCustomers();
          const invStats = await sync.syncInvoices();

          stats = {
            totalRecords:
              subsStats.totalRecords +
              custStats.totalRecords +
              invStats.totalRecords,
            batchesProcessed:
              subsStats.batchesProcessed +
              custStats.batchesProcessed +
              invStats.batchesProcessed,
            errors: subsStats.errors + custStats.errors + invStats.errors,
            startTime: subsStats.startTime,
            endTime: new Date(),
          };
          break;
        default:
          console.error(
            "Unknown sync type. Use: subscriptions, customers, invoices, all"
          );
          process.exit(1);
      }

      const duration = stats.endTime!.getTime() - stats.startTime.getTime();
      console.log(`\n=== Sync Completed for ${tenant.name} ===`);
      console.log(`Total records synced: ${stats.totalRecords}`);
      console.log(`Batches processed: ${stats.batchesProcessed}`);
      console.log(`Errors encountered: ${stats.errors}`);
      console.log(`Duration: ${Math.round(duration / 1000)} seconds`);
    } catch (error) {
      console.error(`Sync failed for tenant ${tenant.name}:`, error);
    }
  }
}

if (require.main === module) {
  main();
}
