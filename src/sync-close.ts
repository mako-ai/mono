import axios, { AxiosError } from "axios";
import { MongoClient, Db, Collection } from "mongodb";
import * as dotenv from "dotenv";
import { tenantManager } from "./tenant-manager";
import type { TenantConfig } from "./tenant-manager";

dotenv.config();

interface CloseApiResponse {
  data: any[];
  has_more: boolean;
  total_results?: number;
}

interface SyncStats {
  totalRecords: number;
  batchesProcessed: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
}

class CloseSyncService {
  private client: MongoClient;
  private db!: Db;
  private tenant: TenantConfig;
  private baseUrl: string;
  private rateLimitDelay: number;
  private maxRetries: number;
  private batchSize: number;

  constructor(tenant: TenantConfig) {
    this.tenant = tenant;

    // Get Close.com configuration for this tenant
    const closeConfig = tenant.sources.close;
    if (!closeConfig?.enabled) {
      throw new Error(`Close.com is not enabled for tenant ${tenant.id}`);
    }

    this.baseUrl = closeConfig.api_base_url || "https://api.close.com/api/v1";
    this.rateLimitDelay = tenant.settings.rate_limit_delay_ms || 200;
    this.maxRetries = tenant.settings.max_retries || 5;
    this.batchSize = tenant.settings.sync_batch_size || 100;

    if (!closeConfig.api_key) {
      throw new Error(`Close API key is required for tenant ${tenant.id}`);
    }

    const globalConfig = tenantManager.getGlobalConfig();
    this.client = new MongoClient(globalConfig.mongodb.connection_string);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async makeApiRequest(
    url: string,
    retryCount = 0
  ): Promise<CloseApiResponse> {
    try {
      await this.delay(this.rateLimitDelay);

      // Close.com uses HTTP Basic Auth with API key as username and empty password
      const closeConfig = this.tenant.sources.close!;
      const auth = Buffer.from(`${closeConfig.api_key}:`).toString("base64");

      const response = await axios.get(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;

      if (axiosError.response?.status === 429 && retryCount < this.maxRetries) {
        const retryAfter = axiosError.response.headers["retry-after"] || 60;
        console.log(
          `Rate limited. Waiting ${retryAfter} seconds before retry ${
            retryCount + 1
          }/${this.maxRetries}`
        );
        await this.delay(parseInt(retryAfter) * 1000);
        return this.makeApiRequest(url, retryCount + 1);
      }

      if (retryCount < this.maxRetries && axiosError.response?.status !== 404) {
        console.log(
          `Request failed, retrying ${retryCount + 1}/${this.maxRetries}:`,
          axiosError.message
        );
        await this.delay(2000 * (retryCount + 1)); // Exponential backoff
        return this.makeApiRequest(url, retryCount + 1);
      }

      throw error;
    }
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
    return `${this.tenant.id}_close_${baseCollection}`;
  }

  async syncData(
    endpoint: string,
    baseCollectionName: string
  ): Promise<SyncStats> {
    const collectionName = this.getCollectionName(baseCollectionName);
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

      // Get total count from first API call
      console.log(`Getting total count of ${baseCollectionName}...`);
      const firstResponse = await this.makeApiRequest(
        `${this.baseUrl}/${endpoint}/?_limit=${this.batchSize}&_skip=0`
      );
      const totalResults = firstResponse.total_results || 0;
      console.log(`Found ${totalResults} total ${baseCollectionName} to sync`);

      let skip = 0;
      let hasMore = true;
      let processedCount = 0;

      while (hasMore) {
        try {
          const url = `${this.baseUrl}/${endpoint}/?_limit=${this.batchSize}&_skip=${skip}`;

          // Use first response for first batch to avoid duplicate API call
          const response =
            skip === 0 ? firstResponse : await this.makeApiRequest(url);

          if (response.data && response.data.length > 0) {
            // Add tenant metadata to each record
            const recordsWithMetadata = response.data.map((record) => ({
              ...record,
              _tenant_id: this.tenant.id,
              _tenant_name: this.tenant.name,
              _sync_timestamp: new Date(),
            }));

            // Use bulk replace operations to handle complex nested objects
            const bulkOps = recordsWithMetadata.map((record) => ({
              replaceOne: {
                filter: { id: record.id },
                replacement: record,
                upsert: true,
              },
            }));

            await stagingCollection.bulkWrite(bulkOps);
            processedCount += response.data.length;

            // Calculate progress and ETA
            const elapsed =
              (new Date().getTime() - stats.startTime.getTime()) / 1000; // seconds
            const percentage =
              totalResults > 0
                ? Math.round((processedCount / totalResults) * 100)
                : 0;
            const recordsPerSecond = processedCount / elapsed;
            const remainingRecords = totalResults - processedCount;
            const etaSeconds =
              remainingRecords > 0 && recordsPerSecond > 0
                ? Math.round(remainingRecords / recordsPerSecond)
                : 0;
            const etaMinutes = Math.floor(etaSeconds / 60);
            const etaSecondsRemainder = etaSeconds % 60;
            const etaFormatted = `${etaMinutes}m${etaSecondsRemainder
              .toString()
              .padStart(2, "0")}s`;

            console.log(
              `Processed ${processedCount}/${totalResults} (${percentage}%) - ETA ${etaFormatted}`
            );
          }

          hasMore = response.has_more;
          skip += this.batchSize;
          stats.batchesProcessed++;
          stats.totalRecords = processedCount;
        } catch (error) {
          console.error("Error processing batch:", error);
          stats.errors++;

          // Continue with next batch on non-critical errors
          if (stats.errors > 10) {
            throw new Error("Too many errors, aborting sync");
          }

          // Move to next batch even on errors
          skip += this.batchSize;
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

  async syncLeads(): Promise<SyncStats> {
    return this.syncData("lead", "leads");
  }

  async syncOpportunities(): Promise<SyncStats> {
    return this.syncData("opportunity", "opportunities");
  }

  async syncContacts(): Promise<SyncStats> {
    return this.syncData("contact", "contacts");
  }

  async syncActivities(): Promise<SyncStats> {
    return this.syncData("activity", "activities");
  }

  async syncUsers(): Promise<SyncStats> {
    return this.syncData("user", "users");
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

    return tenantManager.getTenantsWithSource("close");
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
  const syncType = args[0] || "leads";
  const tenantId = args[1]; // Optional tenant ID

  const tenants = loadTenantConfig();
  const targetTenants = tenantId
    ? tenants.filter((t) => t.id === tenantId)
    : tenants;

  if (targetTenants.length === 0) {
    console.error(`No tenants found${tenantId ? ` for ID: ${tenantId}` : ""}`);
    process.exit(1);
  }

  for (const tenant of targetTenants) {
    const sync = new CloseSyncService(tenant);

    try {
      let stats: SyncStats;

      console.log(
        `\n=== Starting Close.com ${syncType} sync for ${tenant.name} ===`
      );

      switch (syncType) {
        case "leads":
          stats = await sync.syncLeads();
          break;
        case "opportunities":
          stats = await sync.syncOpportunities();
          break;
        case "contacts":
          stats = await sync.syncContacts();
          break;
        case "activities":
          stats = await sync.syncActivities();
          break;
        case "users":
          stats = await sync.syncUsers();
          break;
        case "all":
          console.log("Syncing all Close.com data...");
          const leadsStats = await sync.syncLeads();
          const oppsStats = await sync.syncOpportunities();
          const contactsStats = await sync.syncContacts();
          const activitiesStats = await sync.syncActivities();
          const usersStats = await sync.syncUsers();

          stats = {
            totalRecords:
              leadsStats.totalRecords +
              oppsStats.totalRecords +
              contactsStats.totalRecords +
              activitiesStats.totalRecords +
              usersStats.totalRecords,
            batchesProcessed:
              leadsStats.batchesProcessed +
              oppsStats.batchesProcessed +
              contactsStats.batchesProcessed +
              activitiesStats.batchesProcessed +
              usersStats.batchesProcessed,
            errors:
              leadsStats.errors +
              oppsStats.errors +
              contactsStats.errors +
              activitiesStats.errors +
              usersStats.errors,
            startTime: leadsStats.startTime,
            endTime: new Date(),
          };
          break;
        default:
          console.error(
            "Unknown sync type. Use: leads, opportunities, contacts, activities, users, all"
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
