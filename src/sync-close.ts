import axios, { AxiosError } from "axios";
import { MongoClient, Db } from "mongodb";
import * as dotenv from "dotenv";
import {
  databaseDataSourceManager,
  DataSourceConfig,
} from "./database-data-source-manager";
import type { ProgressReporter } from "./sync";
import { dataSourceManager } from "./data-source-manager";

dotenv.config();

export class CloseSyncService {
  private mongoConnections: Map<string, { client: MongoClient; db: Db }> =
    new Map();
  private dataSource: DataSourceConfig;
  private closeApiKey: string;
  private closeApiUrl: string;
  private settings: {
    batchSize: number;
    rateLimitDelay: number;
    maxRetries: number;
  };

  constructor(dataSource: DataSourceConfig) {
    this.dataSource = dataSource;

    // Get Close configuration
    if (!dataSource.connection.api_key) {
      throw new Error(
        `Close API key is required for data source ${dataSource.id}`,
      );
    }

    this.closeApiKey = dataSource.connection.api_key;
    this.closeApiUrl =
      dataSource.connection.api_base_url || "https://api.close.com/api/v1";

    // Get settings with defaults
    const globalConfig = dataSourceManager.getGlobalConfig();
    this.settings = {
      batchSize: dataSource.settings.sync_batch_size || 100,
      rateLimitDelay: dataSource.settings.rate_limit_delay_ms || 200,
      maxRetries:
        dataSource.settings.max_retries || globalConfig.max_retries || 5,
    };
  }

  private async getMongoConnection(
    targetDb: any,
  ): Promise<{ client: MongoClient; db: Db }> {
    // Use default if no target specified
    if (!targetDb) {
      throw new Error("No target database specified and no default found");
    }

    const connectionKey = targetDb.id || targetDb.name;

    // Check if connection already exists
    if (this.mongoConnections.has(connectionKey)) {
      const existingConnection = this.mongoConnections.get(connectionKey);
      if (existingConnection) {
        return existingConnection;
      }
    }

    if (!targetDb || targetDb.type !== "mongodb") {
      throw new Error(
        `MongoDB data source '${connectionKey}' not found or invalid type`,
      );
    }

    // Create new connection
    const client = new MongoClient(targetDb.connection.connection_string!);
    await client.connect();
    const db = client.db(targetDb.connection.database);

    const connection = { client, db };
    this.mongoConnections.set(connectionKey, connection);

    console.log(
      `Connected to MongoDB: ${targetDb.name} for Close source: ${this.dataSource.name}`,
    );
    return connection;
  }

  private async disconnect(): Promise<void> {
    for (const [dbId, connection] of this.mongoConnections.entries()) {
      await connection.client.close();
      console.log(`Disconnected from MongoDB: ${dbId}`);
    }
    this.mongoConnections.clear();
  }

  private async fetchCloseData(
    endpoint: string,
    params: any = {},
    progress?: ProgressReporter,
    onBatch?: (records: any[]) => Promise<void>,
  ): Promise<any[]> {
    const results: any[] = [];
    let hasMore = true;
    let skip = 0;

    // First, try to get total count if progress is provided
    if (progress) {
      try {
        const countResponse = await axios.get(
          `${this.closeApiUrl}/${endpoint}`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(
                this.closeApiKey + ":",
              ).toString("base64")}`,
              Accept: "application/json",
            },
            params: {
              ...params,
              _limit: 0,
              _fields: "id",
            },
          },
        );

        if (countResponse.data.total_results) {
          progress.updateTotal(countResponse.data.total_results);
        }
      } catch (error) {
        // If we can't get total, continue without it
        console.log(
          "Could not fetch total count, continuing without total progress",
        );
      }
    }

    while (hasMore) {
      let attempts = 0;

      // Retry loop for the current batch
      while (attempts <= this.settings.maxRetries) {
        try {
          const response = await axios.get(`${this.closeApiUrl}/${endpoint}`, {
            headers: {
              Authorization: `Basic ${Buffer.from(
                this.closeApiKey + ":",
              ).toString("base64")}`,
              Accept: "application/json",
            },
            params: {
              ...params,
              _skip: skip,
              _limit: this.settings.batchSize,
            },
          });

          const data = response.data.data || [];
          // If a batch callback is provided, process it immediately; otherwise accumulate
          if (onBatch) {
            await onBatch(data);
          } else {
            results.push(...data);
          }

          // Report batch completion
          if (progress && data.length > 0) {
            progress.reportBatch(data.length);
          }

          hasMore = response.data.has_more || false;
          skip += this.settings.batchSize;

          // Respect rate-limit between successful requests
          if (hasMore) {
            await this.delay(this.settings.rateLimitDelay);
          }

          // Successful fetch, break out of retry loop
          break;
        } catch (error: any) {
          // AxiosError typing
          const axiosError: AxiosError | any = error;

          // Handle HTTP 429 specifically (rate limiting)
          if (axiosError.response?.status === 429) {
            const retryAfterHeader =
              axiosError.response.headers?.["retry-after"];
            const retryAfterSeconds = retryAfterHeader
              ? parseInt(retryAfterHeader, 10)
              : NaN;
            const delayMs = !isNaN(retryAfterSeconds)
              ? retryAfterSeconds * 1000
              : 1000 * Math.pow(2, attempts);

            console.warn(
              `⏳ Received 429 Too Many Requests from Close API. Waiting ${delayMs}ms before retrying (attempt ${attempts + 1}/${this.settings.maxRetries}).`,
            );
            await this.delay(delayMs);
            attempts++;
            continue;
          }

          const isRetryable = this.isRetryableAxiosError(error);
          attempts++;

          if (!isRetryable || attempts > this.settings.maxRetries) {
            console.error(
              `❌ Failed to fetch from ${endpoint} after ${attempts} attempt(s).`,
              error,
            );
            throw error;
          }

          const backoff = 500 * Math.pow(2, attempts); // exponential backoff starting at 0.5s
          console.warn(
            `⚠️  Error fetching from ${endpoint} (attempt ${attempts}/${this.settings.maxRetries}). Retrying in ${backoff}ms …`,
          );
          await this.delay(backoff);
        }
      }
    }

    // Report completion
    if (progress) {
      progress.reportComplete();
    }

    return results;
  }

  /**
   * Determines whether an Axios error is transient/retryable.
   */
  private isRetryableAxiosError(error: any): boolean {
    if (!error || !error.code) return false;

    // Network level errors
    const retryableNetworkErrors = [
      "ECONNRESET",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "ENOTFOUND",
      "ECONNABORTED",
    ];
    if (retryableNetworkErrors.includes(error.code)) return true;

    // HTTP status based retry – only if response exists
    const status = error.response?.status;
    if (status && [500, 502, 503, 504, 429].includes(status)) {
      return true;
    }

    return false;
  }

  async syncLeads(targetDb?: any, progress?: ProgressReporter): Promise<void> {
    console.log(`Starting leads sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDb);

    const mainCollectionName = `${this.dataSource.id}_leads`;
    const stagingCollectionName = `${mainCollectionName}_staging`;

    // Prepare staging collection (drop if exists to ensure fresh start)
    if (await db.listCollections({ name: stagingCollectionName }).hasNext()) {
      await db.collection(stagingCollectionName).drop();
    }
    const stagingCollection = db.collection(stagingCollectionName);

    try {
      // Fetch Close data in batches and write each batch directly to staging.
      await this.fetchCloseData("lead", {}, progress, async batch => {
        if (batch.length === 0) return;
        const processedLeads = batch.map(lead => ({
          ...lead,
          _dataSourceId: this.dataSource.id,
          _dataSourceName: this.dataSource.name,
          _syncedAt: new Date(),
        }));

        const bulkOps = processedLeads.map(lead => ({
          replaceOne: {
            filter: { id: lead.id, _dataSourceId: this.dataSource.id },
            replacement: lead,
            upsert: true,
          },
        }));

        await stagingCollection.bulkWrite(bulkOps, { ordered: false });
      });

      // Completed successfully – atomically swap staging into main.
      // Drop main (if exists) & rename staging to main.
      if (await db.listCollections({ name: mainCollectionName }).hasNext()) {
        await db.collection(mainCollectionName).drop();
      }
      await stagingCollection.rename(mainCollectionName, { dropTarget: true });

      console.log(
        `✅ Leads synced and collection swapped successfully (${mainCollectionName})`,
      );
    } catch (error) {
      console.error("Lead sync failed:", error);
      // Keep partially populated staging collection for inspection/resume.
      throw error;
    }
  }

  async syncOpportunities(
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting opportunities sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDb);

    const mainName = `${this.dataSource.id}_opportunities`;
    const stagingName = `${mainName}_staging`;

    if (await db.listCollections({ name: stagingName }).hasNext()) {
      await db.collection(stagingName).drop();
    }

    const stagingCollection = db.collection(stagingName);

    try {
      await this.fetchCloseData("opportunity", {}, progress, async batch => {
        if (batch.length === 0) return;
        const processed = batch.map(opp => ({
          ...opp,
          _dataSourceId: this.dataSource.id,
          _dataSourceName: this.dataSource.name,
          _syncedAt: new Date(),
        }));

        const bulkOps = processed.map(opp => ({
          replaceOne: {
            filter: { id: opp.id, _dataSourceId: this.dataSource.id },
            replacement: opp,
            upsert: true,
          },
        }));

        await stagingCollection.bulkWrite(bulkOps, { ordered: false });
      });

      if (await db.listCollections({ name: mainName }).hasNext()) {
        await db.collection(mainName).drop();
      }
      await stagingCollection.rename(mainName, { dropTarget: true });

      console.log(
        `✅ Opportunities synced and collection swapped successfully (${mainName})`,
      );
    } catch (error) {
      console.error("Opportunity sync failed:", error);
      throw error;
    }
  }

  async syncContacts(
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting contacts sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDb);

    const mainName = `${this.dataSource.id}_contacts`;
    const stagingName = `${mainName}_staging`;

    if (await db.listCollections({ name: stagingName }).hasNext()) {
      await db.collection(stagingName).drop();
    }
    const stagingCollection = db.collection(stagingName);

    try {
      await this.fetchCloseData("contact", {}, progress, async batch => {
        if (batch.length === 0) return;
        const processed = batch.map(contact => ({
          ...contact,
          _dataSourceId: this.dataSource.id,
          _dataSourceName: this.dataSource.name,
          _syncedAt: new Date(),
        }));

        const bulkOps = processed.map(contact => ({
          replaceOne: {
            filter: { id: contact.id, _dataSourceId: this.dataSource.id },
            replacement: contact,
            upsert: true,
          },
        }));

        await stagingCollection.bulkWrite(bulkOps, { ordered: false });
      });

      if (await db.listCollections({ name: mainName }).hasNext()) {
        await db.collection(mainName).drop();
      }
      await stagingCollection.rename(mainName, { dropTarget: true });

      console.log(
        `✅ Contacts synced and collection swapped successfully (${mainName})`,
      );
    } catch (error) {
      console.error("Contact sync failed:", error);
      throw error;
    }
  }

  async syncUsers(targetDb?: any, progress?: ProgressReporter): Promise<void> {
    console.log(`Starting users sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDb);

    const mainName = `${this.dataSource.id}_users`;
    const stagingName = `${mainName}_staging`;

    if (await db.listCollections({ name: stagingName }).hasNext()) {
      await db.collection(stagingName).drop();
    }
    const stagingCollection = db.collection(stagingName);

    try {
      await this.fetchCloseData("user", {}, progress, async batch => {
        if (batch.length === 0) return;
        const processed = batch.map(user => ({
          ...user,
          _dataSourceId: this.dataSource.id,
          _dataSourceName: this.dataSource.name,
          _syncedAt: new Date(),
        }));

        const bulkOps = processed.map(user => ({
          replaceOne: {
            filter: { id: user.id, _dataSourceId: this.dataSource.id },
            replacement: user,
            upsert: true,
          },
        }));

        await stagingCollection.bulkWrite(bulkOps, { ordered: false });
      });

      if (await db.listCollections({ name: mainName }).hasNext()) {
        await db.collection(mainName).drop();
      }
      await stagingCollection.rename(mainName, { dropTarget: true });

      console.log(
        `✅ Users synced and collection swapped successfully (${mainName})`,
      );
    } catch (error) {
      console.error("User sync failed:", error);
      throw error;
    }
  }

  async syncActivities(
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting activities sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDb);

    const mainName = `${this.dataSource.id}_activities`;
    const stagingName = `${mainName}_staging`;

    if (await db.listCollections({ name: stagingName }).hasNext()) {
      await db.collection(stagingName).drop();
    }
    const stagingCollection = db.collection(stagingName);

    try {
      await this.fetchCloseData("activity", {}, progress, async batch => {
        if (batch.length === 0) return;
        const processed = batch.map(activity => ({
          ...activity,
          _dataSourceId: this.dataSource.id,
          _dataSourceName: this.dataSource.name,
          _syncedAt: new Date(),
        }));

        const bulkOps = processed.map(activity => ({
          replaceOne: {
            filter: { id: activity.id, _dataSourceId: this.dataSource.id },
            replacement: activity,
            upsert: true,
          },
        }));

        await stagingCollection.bulkWrite(bulkOps, { ordered: false });
      });

      if (await db.listCollections({ name: mainName }).hasNext()) {
        await db.collection(mainName).drop();
      }
      await stagingCollection.rename(mainName, { dropTarget: true });

      console.log(
        `✅ Activities synced and collection swapped successfully (${mainName})`,
      );
    } catch (error) {
      console.error("Activity sync failed:", error);
      throw error;
    }
  }

  async syncCustomFields(
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting custom fields sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDb);

    const mainName = `${this.dataSource.id}_custom_fields`;
    const stagingName = `${mainName}_staging`;

    if (await db.listCollections({ name: stagingName }).hasNext()) {
      await db.collection(stagingName).drop();
    }
    const stagingCollection = db.collection(stagingName);

    try {
      const customFieldTypes = [
        "custom_field/lead",
        "custom_field/contact",
        "custom_field/opportunity",
        "custom_field/activity",
      ];

      for (const fieldType of customFieldTypes) {
        try {
          await this.fetchCloseData(fieldType, {}, progress, async batch => {
            if (batch.length === 0) return;
            const processed = batch.map((field: any) => ({
              ...field,
              field_type: fieldType.replace("custom_field/", ""),
              _dataSourceId: this.dataSource.id,
              _dataSourceName: this.dataSource.name,
              _syncedAt: new Date(),
            }));

            if (progress) {
              progress.reportBatch(batch.length);
            }

            const bulkOps = processed.map(field => ({
              replaceOne: {
                filter: {
                  id: field.id,
                  field_type: field.field_type,
                  _dataSourceId: this.dataSource.id,
                },
                replacement: field,
                upsert: true,
              },
            }));

            await stagingCollection.bulkWrite(bulkOps, { ordered: false });
          });
        } catch (error) {
          console.warn(`Failed to fetch ${fieldType}:`, error);
        }
      }

      // After all types processed successfully, swap collections
      if (await db.listCollections({ name: mainName }).hasNext()) {
        await db.collection(mainName).drop();
      }
      await stagingCollection.rename(mainName, { dropTarget: true });

      console.log(
        `✅ Custom fields synced and collection swapped successfully (${mainName})`,
      );

      if (progress) {
        progress.reportComplete();
      }
    } catch (error) {
      console.error("Custom fields sync failed:", error);
      throw error;
    }
  }

  async syncAll(targetDb?: any): Promise<void> {
    console.log(
      `\n🔄 Starting full sync for data source: ${this.dataSource.name}`,
    );
    console.log(`Target database: ${targetDb?.name || "default"}`);
    const startTime = Date.now();

    const failedEntities: string[] = [];

    // Import ProgressReporter for creating individual progress
    const { ProgressReporter } = await import("./sync");

    const entityOperations: Array<{
      name: string;
      fn: (db: any, progress: ProgressReporter) => Promise<void>;
    }> = [
      { name: "leads", fn: this.syncLeads.bind(this) },
      { name: "opportunities", fn: this.syncOpportunities.bind(this) },
      { name: "contacts", fn: this.syncContacts.bind(this) },
      { name: "activities", fn: this.syncActivities.bind(this) },
      { name: "users", fn: this.syncUsers.bind(this) },
      { name: "custom_fields", fn: this.syncCustomFields.bind(this) },
    ];

    try {
      for (const entity of entityOperations) {
        try {
          await entity.fn(targetDb, new ProgressReporter(entity.name));
        } catch (err) {
          failedEntities.push(entity.name);
          console.error(`❌ Failed to sync ${entity.name}:`, err);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      if (failedEntities.length === 0) {
        console.log(
          `✅ Full sync completed for ${this.dataSource.name} in ${duration}s`,
        );
      } else {
        console.warn(
          `⚠️  Completed sync for ${this.dataSource.name} with failures in: ${failedEntities.join(", ")}. Duration: ${duration}s`,
        );
      }
    } finally {
      await this.disconnect();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getDataSources() {
    return databaseDataSourceManager.getDataSourcesByType("close");
  }
}

// Load data source configuration
async function loadDataSourceConfig(): Promise<DataSourceConfig[]> {
  try {
    // Validate configuration first
    const validation = databaseDataSourceManager.validateConfig();
    if (!validation.valid) {
      console.error("Configuration validation failed:");
      validation.errors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    return databaseDataSourceManager.getDataSourcesByType("close");
  } catch (error) {
    console.error("Failed to load configuration:", error);
    console.error(
      "Make sure config/config.yaml exists and is properly formatted",
    );
    process.exit(1);
  }
}

// Main execution
async function main() {
  const dataSources = await loadDataSourceConfig();

  if (dataSources.length === 0) {
    console.log("No active Close data sources found.");
    process.exit(0);
  }

  console.log(`Found ${dataSources.length} active Close.com data source(s)`);

  // Check command line arguments
  const args = process.argv.slice(2);
  const targetDbId = args.find(arg => arg.startsWith("--db="))?.split("=")[1];
  const specificSourceId = args.find(arg => !arg.startsWith("--"));

  if (specificSourceId) {
    // Sync specific data source
    const source = dataSources.find(s => s.id === specificSourceId);
    if (!source) {
      console.error(
        `Data source '${specificSourceId}' not found or not active`,
      );
      console.log("\nAvailable Close.com data sources:");
      dataSources.forEach(s => console.log(`  - ${s.id}: ${s.name}`));
      process.exit(1);
    }

    const syncService = new CloseSyncService(source);
    await syncService.syncAll(targetDbId);
  } else {
    // Sync all data sources
    for (const dataSource of dataSources) {
      const syncService = new CloseSyncService(dataSource);
      await syncService.syncAll(targetDbId);
    }
  }

  console.log("\n✅ All syncs completed successfully!");
}

// Execute if run directly
if (require.main === module) {
  main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
