import axios, { AxiosInstance } from "axios";
import * as dotenv from "dotenv";
import { IDataSource } from "../../database/workspace-schema";
import {
  BaseSyncService,
  ProgressReporter,
  SimpleProgressReporter,
} from "../base/BaseSyncService";

dotenv.config();

/**
 * Entity configuration for Close sync
 */
interface EntityConfig {
  name: string;
  endpoint: string;
  collectionSuffix: string;
  supportsIncremental: boolean;
  dateField?: string;
  customProcessing?: (record: any) => any;
}

/**
 * Close API client for handling all API interactions (Single Responsibility)
 */
class CloseApiClient {
  private axios: AxiosInstance;

  constructor(apiKey: string, apiUrl: string) {
    this.axios = axios.create({
      baseURL: apiUrl,
      headers: {
        Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
        Accept: "application/json",
      },
    });
  }

  async get(endpoint: string, params?: any) {
    return this.axios.get(endpoint, { params });
  }

  async post(endpoint: string, data: any, params?: any) {
    return this.axios.post(endpoint, data, {
      params,
      headers: {
        "Content-Type": "application/json",
        "x-http-method-override": "GET",
      },
    });
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.get("/me/");
      return { success: true, message: "Close connection successful" };
    } catch (error) {
      return {
        success: false,
        message: `Close connection failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }
}

/**
 * Close sync service with configuration-driven entity syncing
 * Reduces code from ~1341 lines to ~450 lines (67% reduction)
 */
export class CloseSyncService extends BaseSyncService {
  private apiClient: CloseApiClient;
  private entityConfigs: Map<string, EntityConfig>;

  constructor(dataSource: IDataSource) {
    super(dataSource);

    // Validate and initialize API client
    if (!dataSource.config.api_key) {
      throw new Error(
        `Close API key is required for data source ${dataSource._id}`,
      );
    }

    const apiUrl =
      dataSource.config.api_base_url || "https://api.close.com/api/v1";
    this.apiClient = new CloseApiClient(dataSource.config.api_key, apiUrl);

    // Initialize entity configurations (DRY - no more duplicate methods)
    this.entityConfigs = new Map([
      [
        "leads",
        {
          name: "leads",
          endpoint: "lead",
          collectionSuffix: "leads",
          supportsIncremental: true,
          dateField: "date_updated",
        },
      ],
      [
        "opportunities",
        {
          name: "opportunities",
          endpoint: "opportunity",
          collectionSuffix: "opportunities",
          supportsIncremental: true,
          dateField: "date_updated",
        },
      ],
      [
        "contacts",
        {
          name: "contacts",
          endpoint: "contact",
          collectionSuffix: "contacts",
          supportsIncremental: true,
          dateField: "date_updated",
        },
      ],
      [
        "activities",
        {
          name: "activities",
          endpoint: "activity",
          collectionSuffix: "activities",
          supportsIncremental: true,
          dateField: "date_updated",
        },
      ],
      [
        "users",
        {
          name: "users",
          endpoint: "user",
          collectionSuffix: "users",
          supportsIncremental: true,
          dateField: "date_updated",
        },
      ],
      [
        "custom_fields",
        {
          name: "custom_fields",
          endpoint: "custom_field",
          collectionSuffix: "custom_fields",
          supportsIncremental: false,
          customProcessing: (record: any) => ({
            ...this.processRecordWithMetadata(record),
            field_type: record.type || "unknown",
          }),
        },
      ],
    ]);

    // Override settings for Close-specific defaults
    this.settings.batchSize = dataSource.settings?.sync_batch_size || 100;
    this.settings.rateLimitDelay =
      dataSource.settings?.rate_limit_delay_ms || 200;
  }

  /**
   * Test Close connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    return this.apiClient.testConnection();
  }

  /**
   * Sync all Close entities
   */
  async syncAll(targetDb?: any): Promise<void> {
    console.log(
      `\n🔄 Starting full sync for data source: ${this.dataSource.name}`,
    );
    const startTime = Date.now();
    const failedEntities: string[] = [];

    try {
      for (const [entityName] of this.entityConfigs) {
        try {
          const progress = new SimpleProgressReporter(entityName);
          await this.syncEntity(entityName, targetDb, progress, false);
        } catch (err) {
          failedEntities.push(entityName);
          console.error(`❌ Failed to sync ${entityName}:`, err);
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

  /**
   * Generic entity sync method (DRY - replaces 12 specific methods)
   */
  async syncEntity(
    entityName: string,
    targetDb?: any,
    progress?: ProgressReporter,
    incremental: boolean = false,
  ): Promise<void> {
    const config = this.entityConfigs.get(entityName);
    if (!config) {
      throw new Error(`Unknown entity type: ${entityName}`);
    }

    console.log(
      `Starting ${incremental ? "incremental " : ""}${entityName} sync for: ${this.dataSource.name}`,
    );

    const { db } = await this.getMongoConnection(targetDb);

    try {
      if (incremental && config.supportsIncremental) {
        await this.performIncrementalSync(config, db, progress);
      } else {
        await this.performFullSync(config, db, progress);
      }
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Perform full sync using staging collections (leverages BaseSyncService)
   */
  private async performFullSync(
    config: EntityConfig,
    db: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    // Handle custom fields specially as they have multiple sub-types
    if (config.name === "custom_fields") {
      await this.syncCustomFieldsSpecial(db, progress);
      return;
    }

    // Use BaseSyncService's syncWithStaging method
    await this.syncWithStaging(
      config.collectionSuffix,
      async (batchCallback?: (batch: any[]) => Promise<void>) => {
        await this.fetchCloseData(config.endpoint, {}, progress, batchCallback);
        return [];
      },
      record =>
        config.customProcessing
          ? config.customProcessing(record)
          : this.processRecordWithMetadata(record),
      db,
      progress,
    );
  }

  /**
   * Perform incremental sync (simplified and DRY)
   */
  private async performIncrementalSync(
    config: EntityConfig,
    db: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    const collectionName = this.getCollectionName(config.collectionSuffix);
    const collection = db.collection(collectionName);

    // Get last sync date
    const lastSyncDoc = await collection
      .find({ _dataSourceId: this.dataSource._id.toString() })
      .sort({ _syncedAt: -1 })
      .limit(1)
      .toArray();

    const lastSyncDate =
      lastSyncDoc.length > 0 ? lastSyncDoc[0]._syncedAt : null;

    if (lastSyncDate) {
      console.log(
        `Syncing ${config.name} updated after: ${lastSyncDate.toISOString()}`,
      );
    } else {
      console.log(
        `No previous sync found for ${config.name}, performing full incremental sync`,
      );
    }

    const dateFilter = lastSyncDate
      ? lastSyncDate.toISOString()
      : "2020-01-01T00:00:00Z";

    const params = {
      query: `${config.dateField || "date_updated"}>="${dateFilter}"`,
      _order_by: `-${config.dateField || "date_updated"}`,
    };

    // Get total count for progress tracking
    if (progress) {
      await this.updateProgressTotal(config.endpoint, params, progress);
    }

    // Fetch and process in batches
    let skip = 0;
    let hasMore = true;
    let processed = 0;

    while (hasMore) {
      const response = await this.executeWithRetry(async () => {
        return this.apiClient.post(`/${config.endpoint}/`, {
          _params: {
            ...params,
            _skip: skip,
            _limit: this.settings.batchSize,
          },
        });
      }, `fetch ${config.name} batch at offset ${skip}`);

      const records = response.data.data || [];
      hasMore = response.data.has_more || false;

      if (records.length > 0) {
        const bulkOps = records.map((record: any) => {
          const processedRecord = config.customProcessing
            ? config.customProcessing(record)
            : this.processRecordWithMetadata(record);

          return {
            replaceOne: {
              filter: {
                id: processedRecord.id,
                _dataSourceId: this.dataSource._id.toString(),
              },
              replacement: processedRecord,
              upsert: true,
            },
          };
        });

        await collection.bulkWrite(bulkOps, { ordered: false });
        processed += records.length;

        if (progress) {
          progress.reportBatch(records.length);
        }
      }

      skip += this.settings.batchSize;

      if (hasMore) {
        await this.delay(this.settings.rateLimitDelay);
      }
    }

    console.log(
      `\n✅ Incremental ${config.name} sync completed: ${processed} records updated`,
    );
  }

  /**
   * Fetch data from Close API with pagination (simplified)
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

    // Get total count for progress tracking
    if (progress) {
      await this.updateProgressTotal(endpoint, params, progress);
    }

    while (hasMore) {
      const response = await this.executeWithRetry(async () => {
        return this.apiClient.get(`/${endpoint}`, {
          ...params,
          _skip: skip,
          _limit: this.settings.batchSize,
        });
      }, `fetch Close ${endpoint}`);

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

      // Stop if no data returned
      if (data.length === 0) {
        hasMore = false;
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
   * Update progress reporter with total count
   */
  private async updateProgressTotal(
    endpoint: string,
    params: any,
    progress: ProgressReporter,
  ): Promise<void> {
    try {
      const countResponse = await this.apiClient.get(`/${endpoint}`, {
        ...params,
        _limit: 0,
        _fields: "id",
      });

      if (countResponse.data.total_results) {
        progress.updateTotal(countResponse.data.total_results);
      }
    } catch {
      console.log(
        "Could not fetch total count, continuing without total progress",
      );
    }
  }

  /**
   * Special handling for custom fields (only exception due to multiple sub-types)
   */
  private async syncCustomFieldsSpecial(
    db: any,
    progress?: ProgressReporter,
  ): Promise<void> {
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

  /**
   * Override to handle Close-specific error scenarios
   */
  protected isRetryableError(error: any): boolean {
    if (!error) return false;

    // Check for Close API search errors (400 with field-errors)
    if (
      error.response?.status === 400 &&
      error.response?.data?.["field-errors"]
    ) {
      console.error(
        "Close API field errors:",
        JSON.stringify(error.response.data["field-errors"], null, 2),
      );
      return false; // Don't retry field errors
    }

    // Use base class retry logic for other errors
    return super.isRetryableError(error);
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
