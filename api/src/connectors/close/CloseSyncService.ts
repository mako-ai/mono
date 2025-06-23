import axios from "axios";
import * as dotenv from "dotenv";
import { IDataSource } from "../../database/workspace-schema";
import {
  BaseSyncService,
  ProgressReporter,
  SimpleProgressReporter,
} from "../base/BaseSyncService";

dotenv.config();

export class CloseSyncService extends BaseSyncService {
  private closeApiKey: string;
  private closeApiUrl: string;

  constructor(dataSource: IDataSource) {
    super(dataSource);

    // Get Close configuration
    if (!dataSource.config.api_key) {
      throw new Error(
        `Close API key is required for data source ${dataSource._id}`,
      );
    }

    this.closeApiKey = dataSource.config.api_key;
    this.closeApiUrl =
      dataSource.config.api_base_url || "https://api.close.com/api/v1";

    // Override settings for Close-specific defaults
    this.settings.batchSize = dataSource.settings?.sync_batch_size || 100;
    this.settings.rateLimitDelay =
      dataSource.settings?.rate_limit_delay_ms || 200;
  }

  /**
   * Test Close connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // Test connection by fetching user info
      await axios.get(`${this.closeApiUrl}/me/`, {
        headers: {
          Authorization: `Basic ${Buffer.from(this.closeApiKey + ":").toString(
            "base64",
          )}`,
          Accept: "application/json",
        },
      });

      return {
        success: true,
        message: "Close connection successful",
      };
    } catch (error) {
      return {
        success: false,
        message: `Close connection failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Fetch data from Close API with pagination
   */
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

    let totalFetched = 0;
    let expectedTotal = 0;

    while (hasMore) {
      const response = await this.executeWithRetry(async () => {
        const res = await axios.get(`${this.closeApiUrl}/${endpoint}`, {
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
        return res;
      }, `fetch Close ${endpoint}`);

      const data = response.data.data || [];

      // Track total results if available
      if (response.data.total_results !== undefined && expectedTotal === 0) {
        expectedTotal = response.data.total_results;
      }

      if (onBatch) {
        await onBatch(data);
      } else {
        results.push(...data);
      }

      totalFetched += data.length;

      if (progress && data.length > 0) {
        progress.reportBatch(data.length);
      }

      // Check if we should continue
      hasMore = response.data.has_more || false;

      // Additional check: stop if we've fetched the expected total
      if (expectedTotal > 0 && totalFetched >= expectedTotal) {
        console.log(
          `Stopping: fetched ${totalFetched} records, expected ${expectedTotal}`,
        );
        hasMore = false;
      }

      // Also stop if we got an empty batch
      if (data.length === 0) {
        console.log("Stopping: received empty batch");
        hasMore = false;
      }

      // Log mismatch between total_results and actual fetched
      if (!hasMore && totalFetched > expectedTotal && expectedTotal > 0) {
        console.log(
          `⚠️ Fetched more records than expected: ${totalFetched} > ${expectedTotal}`,
        );
      }

      skip += this.settings.batchSize;

      if (hasMore) {
        await this.delay(this.settings.rateLimitDelay);
      }
    }

    if (progress) {
      progress.reportComplete();
    }

    return results;
  }

  /**
   * Sync all Close entities
   */
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

  // Sync methods using base class patterns
  async syncLeads(targetDb?: any, progress?: ProgressReporter): Promise<void> {
    console.log(`Starting leads sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDb);

    try {
      await this.syncWithStaging(
        "leads",
        async (batchCallback?: (batch: any[]) => Promise<void>) => {
          await this.fetchCloseData("lead", {}, progress, batchCallback);
          return [];
        },
        lead => this.processRecordWithMetadata(lead),
        db,
        progress,
      );
    } finally {
      await this.disconnect();
    }
  }

  async syncLeadsIncremental(
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting incremental leads sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDb);

    await this.syncIncremental(
      "leads",
      async (lastSyncDate?: Date) => {
        const params: any = {};
        if (lastSyncDate) {
          params.query = { updated_gt: lastSyncDate.toISOString() };
        }
        return this.fetchCloseData("lead", params, progress);
      },
      lead => this.processRecordWithMetadata(lead),
      db,
      progress,
    );
  }

  async syncOpportunities(
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting opportunities sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDb);

    try {
      await this.syncWithStaging(
        "opportunities",
        async (batchCallback?: (batch: any[]) => Promise<void>) => {
          // fetchCloseData handles the batch callback internally
          await this.fetchCloseData("opportunity", {}, progress, batchCallback);
          return []; // Return empty array since we're using batch callback
        },
        opp => this.processRecordWithMetadata(opp),
        db,
        progress,
      );
    } finally {
      await this.disconnect();
    }
  }

  async syncOpportunitiesIncremental(
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(
      `Starting incremental opportunities sync for: ${this.dataSource.name}`,
    );
    const { db } = await this.getMongoConnection(targetDb);

    await this.syncIncremental(
      "opportunities",
      async (lastSyncDate?: Date) => {
        const params: any = {};
        if (lastSyncDate) {
          params.query = { updated_gt: lastSyncDate.toISOString() };
        }
        return this.fetchCloseData("opportunity", params, progress);
      },
      opp => this.processRecordWithMetadata(opp),
      db,
      progress,
    );
  }

  async syncContacts(
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting contacts sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDb);

    try {
      await this.syncWithStaging(
        "contacts",
        async (batchCallback?: (batch: any[]) => Promise<void>) => {
          await this.fetchCloseData("contact", {}, progress, batchCallback);
          return [];
        },
        contact => this.processRecordWithMetadata(contact),
        db,
        progress,
      );
    } finally {
      await this.disconnect();
    }
  }

  async syncContactsIncremental(
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(
      `Starting incremental contacts sync for: ${this.dataSource.name}`,
    );
    const { db } = await this.getMongoConnection(targetDb);

    await this.syncIncremental(
      "contacts",
      async (lastSyncDate?: Date) => {
        const params: any = {};
        if (lastSyncDate) {
          params.query = { updated_gt: lastSyncDate.toISOString() };
        }
        return this.fetchCloseData("contact", params, progress);
      },
      contact => this.processRecordWithMetadata(contact),
      db,
      progress,
    );
  }

  async syncUsers(targetDb?: any, progress?: ProgressReporter): Promise<void> {
    console.log(`Starting users sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDb);

    try {
      await this.syncWithStaging(
        "users",
        async (batchCallback?: (batch: any[]) => Promise<void>) => {
          await this.fetchCloseData("user", {}, progress, batchCallback);
          return [];
        },
        user => this.processRecordWithMetadata(user),
        db,
        progress,
      );
    } finally {
      await this.disconnect();
    }
  }

  async syncUsersIncremental(
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting incremental users sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDb);

    await this.syncIncremental(
      "users",
      async (lastSyncDate?: Date) => {
        const params: any = {};
        if (lastSyncDate) {
          params.query = { updated_gt: lastSyncDate.toISOString() };
        }
        return this.fetchCloseData("user", params, progress);
      },
      user => this.processRecordWithMetadata(user),
      db,
      progress,
    );
  }

  async syncActivities(
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting activities sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDb);

    try {
      await this.syncWithStaging(
        "activities",
        async (batchCallback?: (batch: any[]) => Promise<void>) => {
          await this.fetchCloseData("activity", {}, progress, batchCallback);
          return [];
        },
        activity => this.processRecordWithMetadata(activity),
        db,
        progress,
      );
    } finally {
      await this.disconnect();
    }
  }

  async syncActivitiesIncremental(
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(
      `Starting incremental activities sync for: ${this.dataSource.name}`,
    );
    const { db } = await this.getMongoConnection(targetDb);

    await this.syncIncremental(
      "activities",
      async (lastSyncDate?: Date) => {
        const params: any = {};
        if (lastSyncDate) {
          params.query = { updated_gt: lastSyncDate.toISOString() };
        }
        return this.fetchCloseData("activity", params, progress);
      },
      activity => this.processRecordWithMetadata(activity),
      db,
      progress,
    );
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
              ...this.processRecordWithMetadata(field),
              field_type: fieldType.replace("custom_field/", ""),
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

  async syncCustomFieldsIncremental(
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(
      `Starting incremental custom fields sync for: ${this.dataSource.name}`,
    );
    const { db } = await this.getMongoConnection(targetDb);

    const mainName = `${this.dataSource._id}_custom_fields`;
    const collection = db.collection(mainName);

    // Custom fields don't support filtering by date, so we'll just do a full sync
    console.log(
      "Custom fields don't support incremental sync, performing full update",
    );

    try {
      await this.fetchCloseData("custom_field", {}, progress, async batch => {
        if (batch.length === 0) return;
        const processed = batch.map(customField =>
          this.processRecordWithMetadata(customField),
        );

        const bulkOps = processed.map(customField => ({
          replaceOne: {
            filter: {
              id: customField.id,
              _dataSourceId: this.dataSource._id.toString(),
            },
            replacement: customField,
            upsert: true,
          },
        }));

        await collection.bulkWrite(bulkOps, { ordered: false });
      });

      console.log(`✅ Custom fields sync completed (${mainName})`);
    } catch (error) {
      console.error("Custom field sync failed:", error);
      throw error;
    }
  }

  protected getCollectionPrefix(): string {
    return this.dataSource.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
  }
}

// Re-export for backward compatibility
export { ProgressReporter };
