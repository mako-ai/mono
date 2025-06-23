import axios, { AxiosError } from "axios";
import { MongoClient, Db } from "mongodb";
import * as dotenv from "dotenv";
import { IDataSource } from "../../database/workspace-schema";

dotenv.config();

export interface ProgressReporter {
  updateTotal(total: number): void;
  reportBatch(batchSize: number): void;
  reportComplete(): void;
}

export class CloseSyncService {
  private mongoConnections: Map<string, { client: MongoClient; db: Db }> = new Map();
  private dataSource: IDataSource;
  private closeApiKey: string;
  private closeApiUrl: string;
  private settings: {
    batchSize: number;
    rateLimitDelay: number;
    maxRetries: number;
  };

  constructor(dataSource: IDataSource) {
    this.dataSource = dataSource;

    // Get Close configuration
    if (!dataSource.config.api_key) {
      throw new Error(
        `Close API key is required for data source ${dataSource._id}`,
      );
    }

    this.closeApiKey = dataSource.config.api_key;
    this.closeApiUrl =
      dataSource.config.api_base_url || "https://api.close.com/api/v1";

    // Get settings with defaults
    this.settings = {
      batchSize: dataSource.settings?.sync_batch_size || 100,
      rateLimitDelay: dataSource.settings?.rate_limit_delay_ms || 200,
      maxRetries: dataSource.settings?.max_retries || 5,
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

    if (!targetDb.connection.connection_string) {
      throw new Error(
        `MongoDB connection string is required for data source ${targetDb.name}`,
      );
    }

    // Create new connection
    const client = new MongoClient(targetDb.connection.connection_string);
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
      } catch {
        console.log(
          "Could not fetch total count, continuing without total progress",
        );
      }
    }

    while (hasMore) {
      let attempts = 0;

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
          if (onBatch) {
            await onBatch(data);
          } else {
            results.push(...data);
          }

          if (progress && data.length > 0) {
            progress.reportBatch(data.length);
          }

          hasMore = response.data.has_more || false;
          skip += this.settings.batchSize;

          if (hasMore) {
            await this.delay(this.settings.rateLimitDelay);
          }

          break;
        } catch (error: any) {
          const axiosError: AxiosError | any = error;

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

          const backoff = 500 * Math.pow(2, attempts);
          console.warn(
            `⚠️  Error fetching from ${endpoint} (attempt ${attempts}/${this.settings.maxRetries}). Retrying in ${backoff}ms …`,
          );
          await this.delay(backoff);
        }
      }
    }

    if (progress) {
      progress.reportComplete();
    }

    return results;
  }

  private isRetryableAxiosError(error: any): boolean {
    if (!error || !error.code) return false;

    const retryableNetworkErrors = [
      "ECONNRESET",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "ENOTFOUND",
      "ECONNABORTED",
    ];
    if (retryableNetworkErrors.includes(error.code)) return true;

    const status = error.response?.status;
    if (status && [500, 502, 503, 504, 429].includes(status)) {
      return true;
    }

    return false;
  }

  async syncLeads(targetDb?: any, progress?: ProgressReporter): Promise<void> {
    console.log(`Starting leads sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDb);

    const collectionName = await this.resolveCollectionName(db, "leads");
    const stagingCollectionName = `${collectionName}_staging`;

    if (await db.listCollections({ name: stagingCollectionName }).hasNext()) {
      await db.collection(stagingCollectionName).drop();
    }
    const stagingCollection = db.collection(stagingCollectionName);

    try {
      await this.fetchCloseData("lead", {}, progress, async batch => {
        if (batch.length === 0) return;
        const processedLeads = batch.map(lead => ({
          ...lead,
          _dataSourceId: this.dataSource._id.toString(),
          _dataSourceName: this.dataSource.name,
          _syncedAt: new Date(),
        }));

        const bulkOps = processedLeads.map(lead => ({
          replaceOne: {
            filter: { id: lead.id, _dataSourceId: this.dataSource._id.toString() },
            replacement: lead,
            upsert: true,
          },
        }));

        await stagingCollection.bulkWrite(bulkOps, { ordered: false });
      });

      if (await db.listCollections({ name: collectionName }).hasNext()) {
        await db.collection(collectionName).drop();
      }
      await stagingCollection.rename(collectionName, { dropTarget: true });

      console.log(
        `✅ Leads synced and collection swapped successfully (${collectionName})`,
      );
    } catch (error) {
      console.error("Lead sync failed:", error);
      throw error;
    }
  }

  async syncOpportunities(
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting opportunities sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDb);

    const mainName = `${this.dataSource._id}_opportunities`;
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
          _dataSourceId: this.dataSource._id.toString(),
          _dataSourceName: this.dataSource.name,
          _syncedAt: new Date(),
        }));

        const bulkOps = processed.map(opp => ({
          replaceOne: {
            filter: { id: opp.id, _dataSourceId: this.dataSource._id.toString() },
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

    const mainName = `${this.dataSource._id}_contacts`;
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
          _dataSourceId: this.dataSource._id.toString(),
          _dataSourceName: this.dataSource.name,
          _syncedAt: new Date(),
        }));

        const bulkOps = processed.map(contact => ({
          replaceOne: {
            filter: { id: contact.id, _dataSourceId: this.dataSource._id.toString() },
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

    const mainName = `${this.dataSource._id}_users`;
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
          _dataSourceId: this.dataSource._id.toString(),
          _dataSourceName: this.dataSource.name,
          _syncedAt: new Date(),
        }));

        const bulkOps = processed.map(user => ({
          replaceOne: {
            filter: { id: user.id, _dataSourceId: this.dataSource._id.toString() },
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

    const mainName = `${this.dataSource._id}_activities`;
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
          _dataSourceId: this.dataSource._id.toString(),
          _dataSourceName: this.dataSource.name,
          _syncedAt: new Date(),
        }));

        const bulkOps = processed.map(activity => ({
          replaceOne: {
            filter: { id: activity.id, _dataSourceId: this.dataSource._id.toString() },
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

    const mainName = `${this.dataSource._id}_custom_fields`;
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
              _dataSourceId: this.dataSource._id.toString(),
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
                  _dataSourceId: this.dataSource._id.toString(),
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
          await entity.fn(targetDb, new SimpleProgressReporter(entity.name));
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

  private async resolveCollectionName(
    db: Db,
    baseSuffix: string,
  ): Promise<string> {
    const primary = `${this.dataSource._id}_${baseSuffix}`;
    const alt = `${this.dataSource.name.replace(/\s+/g, "_").toLowerCase()}_${baseSuffix}`;

    const primaryExists = await db.listCollections({ name: primary }).hasNext();
    if (primaryExists) return primary;

    const altExists = await db.listCollections({ name: alt }).hasNext();
    if (altExists) return alt;

    return primary;
  }
}

// Simple progress reporter implementation
class SimpleProgressReporter implements ProgressReporter {
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
    console.log();
  }

  private displayProgress() {
    const elapsed = Date.now() - this.startTime.getTime();
    const elapsedStr = this.formatTime(elapsed);

    if (this.totalRecords > 0) {
      const percentage = Math.floor(
        (this.currentRecords / this.totalRecords) * 100,
      );
      const progressBar = this.createProgressBar(percentage);

      process.stdout.write(
        `\r🟢 Syncing ${this.entityName}: ${progressBar} ${percentage}% (${this.currentRecords.toLocaleString()}/${this.totalRecords.toLocaleString()}) | ⏱️  ${elapsedStr}`,
      );
    } else {
      process.stdout.write(
        `\r🟢 Syncing ${this.entityName}: ${this.currentRecords.toLocaleString()} records | ⏱️  ${elapsedStr}`,
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