import { MongoClient, Db } from "mongodb";
import { IDataSource } from "../../database/workspace-schema";
import { AxiosError } from "axios";

/**
 * Progress reporter interface for tracking sync progress
 */
export interface ProgressReporter {
  updateTotal(total: number): void;
  reportBatch(batchSize: number): void;
  reportComplete(): void;
}

/**
 * Sync settings with defaults
 */
export interface SyncSettings {
  batchSize: number;
  rateLimitDelay: number;
  maxRetries: number;
  timeout?: number;
  timezone?: string;
}

/**
 * Base class for all sync services
 * Provides common functionality for MongoDB operations, progress reporting, and error handling
 */
export abstract class BaseSyncService {
  protected dataSource: IDataSource;
  protected settings: SyncSettings;
  private mongoConnections: Map<string, { client: MongoClient; db: Db }> =
    new Map();
  protected enableBackups = false; // Backups disabled by default; staging directly replaces live collection

  constructor(dataSource: IDataSource) {
    this.dataSource = dataSource;

    // Initialize settings with defaults
    this.settings = {
      batchSize: dataSource.settings?.sync_batch_size || 100,
      rateLimitDelay: dataSource.settings?.rate_limit_delay_ms || 200,
      maxRetries: dataSource.settings?.max_retries || 5,
      timeout: dataSource.settings?.timeout_ms || 30000,
      timezone: dataSource.settings?.timezone || "UTC",
    };
  }

  /**
   * Get MongoDB connection with connection pooling
   */
  protected async getMongoConnection(
    targetDb: any,
  ): Promise<{ client: MongoClient; db: Db }> {
    // Handle both object and string formats for backward compatibility
    if (!targetDb) {
      throw new Error("No target database specified");
    }

    // If targetDb is an object with connection info, use it directly
    if (typeof targetDb === "object" && targetDb.connection) {
      const connectionKey = targetDb.id || targetDb.name;

      // Check if connection already exists
      if (this.mongoConnections.has(connectionKey)) {
        const existingConnection = this.mongoConnections.get(connectionKey);
        if (existingConnection) {
          return existingConnection;
        }
      }

      // Create new connection
      const client = new MongoClient(targetDb.connection.connection_string);
      await client.connect();
      const db = client.db(targetDb.connection.database);

      const connection = { client, db };
      this.mongoConnections.set(connectionKey, connection);

      console.log(
        `Connected to MongoDB: ${targetDb.name} for ${this.dataSource.type} source: ${this.dataSource.name}`,
      );
      return connection;
    }

    // Legacy string format not supported in base class
    throw new Error(
      "Target database must be an object with connection properties",
    );
  }

  /**
   * Disconnect all MongoDB connections
   */
  protected async disconnect(): Promise<void> {
    for (const [dbId, connection] of this.mongoConnections.entries()) {
      await connection.client.close();
      console.log(`Disconnected from MongoDB: ${dbId}`);
    }
    this.mongoConnections.clear();
  }

  /**
   * Create a collection-safe identifier from the data source
   */
  protected getCollectionPrefix(): string {
    // Use data source ID as primary identifier
    return this.dataSource._id.toString();
  }

  /**
   * Get collection name for an entity
   */
  protected getCollectionName(entity: string): string {
    return `${this.getCollectionPrefix()}_${entity}`;
  }

  /**
   * Resolve collection name with fallback for legacy names
   */
  protected async resolveCollectionName(
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

  /**
   * Hot swap collections for zero-downtime updates
   */
  protected async hotSwapCollections(
    db: Db,
    stagingCollections: string[],
    targetCollections: string[],
  ): Promise<void> {
    const timestamp = Date.now();

    console.log("🔄 Starting hot swap of collections...");

    try {
      if (this.enableBackups) {
        // Step 1: Rename existing collections to backup
        for (let i = 0; i < targetCollections.length; i++) {
          const targetCollection = targetCollections[i];
          const backupCollection = `${targetCollection}_backup_${timestamp}`;

          try {
            await db.collection(targetCollection).rename(backupCollection);
            console.log(
              `📦 Backed up ${targetCollection} → ${backupCollection}`,
            );
          } catch (error: any) {
            if (error.code === 26) {
              console.log(
                `📝 Collection ${targetCollection} doesn't exist yet (first sync)`,
              );
            } else {
              throw error;
            }
          }
        }
      }

      // Step 2: Rename staging collections to target names
      for (let i = 0; i < stagingCollections.length; i++) {
        const stagingCollection = stagingCollections[i];
        const targetCollection = targetCollections[i];

        // If backups disabled, ensure any existing target collection is dropped before rename
        if (!this.enableBackups) {
          try {
            await db.collection(targetCollection).drop();
          } catch (err: any) {
            if (err.code !== 26) throw err; // ignore namespace not found
          }
          await db
            .collection(stagingCollection)
            .rename(targetCollection, { dropTarget: true });
        } else {
          await db.collection(stagingCollection).rename(targetCollection);
        }
        console.log(`✨ Promoted ${stagingCollection} → ${targetCollection}`);
      }

      // Step 3 (optional): schedule cleanup of backups
      if (this.enableBackups) {
        setTimeout(() => {
          targetCollections.forEach(targetCollection => {
            const backupCollection = `${targetCollection}_backup_${timestamp}`;
            db.collection(backupCollection)
              .drop()
              .then(() => {
                console.log(`🗑️  Cleaned up backup: ${backupCollection}`);
              })
              .catch(() => {
                /* ignore */
              });
          });
        }, 60000);
      }

      console.log("✅ Hot swap completed successfully!");
    } catch (error) {
      console.error("❌ Hot swap failed:", error);

      // Attempt to rollback by renaming backup collections back
      console.log("🔄 Attempting rollback...");
      for (const targetCollection of targetCollections) {
        const backupCollection = `${targetCollection}_backup_${timestamp}`;
        try {
          await db.collection(backupCollection).rename(targetCollection);
          console.log(
            `↩️  Rolled back ${backupCollection} → ${targetCollection}`,
          );
        } catch (rollbackError) {
          console.error(
            `❌ Rollback failed for ${targetCollection}:`,
            rollbackError,
          );
        }
      }

      throw error;
    }
  }

  /**
   * Perform sync with staging collections and hot swap
   */
  protected async syncWithStaging<T>(
    entityName: string,
    fetchData: (batchCallback?: (batch: T[]) => Promise<void>) => Promise<T[]>,
    processRecord: (record: T) => any,
    db: Db,
    progress?: ProgressReporter,
  ): Promise<void> {
    const mainCollectionName = this.getCollectionName(entityName);
    const stagingCollectionName = `${mainCollectionName}_staging`;

    // Prepare staging collection
    if (await db.listCollections({ name: stagingCollectionName }).hasNext()) {
      await db.collection(stagingCollectionName).drop();
    }
    const stagingCollection = db.collection(stagingCollectionName);

    // Explicitly create the staging collection so it is visible immediately in the DB UI
    try {
      await db.createCollection(stagingCollectionName);
    } catch (err: any) {
      // If collection already exists (race in rare cases), ignore
      if (err.codeName !== "NamespaceExists") throw err;
    }

    try {
      // Create batch callback for streaming writes
      const batchCallback = async (batch: T[]) => {
        if (batch.length === 0) return;

        const processedRecords = batch.map(record => processRecord(record));

        const bulkOps = processedRecords.map(record => ({
          replaceOne: {
            filter: {
              id: (record as any).id,
              _dataSourceId: this.dataSource._id.toString(),
            },
            replacement: record,
            upsert: true,
          },
        }));

        await stagingCollection.bulkWrite(bulkOps, { ordered: false });
      };

      // Call fetchData with batch callback for streaming
      await fetchData(batchCallback);

      // Hot swap collections
      await this.hotSwapCollections(
        db,
        [stagingCollectionName],
        [mainCollectionName],
      );

      console.log(
        `✅ ${entityName} synced and collection swapped successfully (${mainCollectionName})`,
      );
    } catch (error) {
      console.error(`${entityName} sync failed:`, error);
      throw error;
    } finally {
      if (progress) {
        progress.reportComplete();
      }
    }
  }

  /**
   * Perform incremental sync with direct upserts
   */
  protected async syncIncremental<T>(
    entityName: string,
    fetchData: (lastSyncDate?: Date) => Promise<T[]>,
    processRecord: (record: T) => any,
    db: Db,
    progress?: ProgressReporter,
  ): Promise<void> {
    const collectionName = this.getCollectionName(entityName);
    const collection = db.collection(collectionName);

    // Get the last sync timestamp
    const lastSync = await collection
      .find({ _dataSourceId: this.dataSource._id.toString() })
      .sort({ _syncedAt: -1 })
      .limit(1)
      .toArray();

    const lastSyncDate = lastSync.length > 0 ? lastSync[0]._syncedAt : null;

    if (lastSyncDate) {
      console.log(
        `Syncing ${entityName} updated after: ${lastSyncDate.toISOString()}`,
      );
    } else {
      console.log(
        `No previous sync found for ${entityName}, performing full incremental sync`,
      );
    }

    try {
      let totalSynced = 0;

      const batchCallback = async (batch: T[]) => {
        if (batch.length === 0) return;

        const processedRecords = batch.map(record => processRecord(record));

        const bulkOps = processedRecords.map(record => ({
          replaceOne: {
            filter: {
              id: (record as any).id,
              _dataSourceId: this.dataSource._id.toString(),
            },
            replacement: record,
            upsert: true,
          },
        }));

        await collection.bulkWrite(bulkOps, { ordered: false });
        totalSynced += batch.length;

        if (progress) {
          progress.reportBatch(batch.length);
        }
      };

      // Fetch data with last sync date
      const records = await (fetchData as any)(lastSyncDate, batchCallback);

      // If no batch callback support, process all at once
      if (records && records.length > 0) {
        const processedRecords = records.map((record: T) =>
          processRecord(record),
        );

        const bulkOps = processedRecords.map((record: any) => ({
          replaceOne: {
            filter: {
              id: record.id,
              _dataSourceId: this.dataSource._id.toString(),
            },
            replacement: record,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps, { ordered: false });
        totalSynced = result.upsertedCount + result.modifiedCount;
      }

      console.log(
        `✅ Incremental ${entityName} sync completed: ${totalSynced} records updated (${collectionName})`,
      );
    } catch (error) {
      console.error(`Incremental ${entityName} sync failed:`, error);
      throw error;
    } finally {
      if (progress) {
        progress.reportComplete();
      }
    }
  }

  /**
   * Check if an error is retryable
   */
  protected isRetryableError(error: any): boolean {
    if (!error) return false;

    // Network errors
    const retryableNetworkErrors = [
      "ECONNRESET",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "ENOTFOUND",
      "ECONNABORTED",
    ];
    if (error.code && retryableNetworkErrors.includes(error.code)) return true;

    // HTTP status codes
    if (error.response) {
      const status = error.response.status;
      if (status && [500, 502, 503, 504, 429].includes(status)) {
        return true;
      }
    }

    // Axios specific
    if (error.isAxiosError) {
      return this.isRetryableAxiosError(error);
    }

    return false;
  }

  /**
   * Check if an axios error is retryable
   */
  protected isRetryableAxiosError(error: AxiosError): boolean {
    if (!error.response) {
      // Network errors, timeouts, etc. are retryable
      return true;
    }

    const status = error.response.status;
    // Retry on server errors (5xx) and rate limiting (429)
    return status >= 500 || status === 429;
  }

  /**
   * Delay utility for rate limiting
   */
  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Process records with standard metadata
   */
  protected processRecordWithMetadata(record: any): any {
    return {
      ...record,
      _dataSourceId: this.dataSource._id.toString(),
      _dataSourceName: this.dataSource.name,
      _syncedAt: new Date(),
    };
  }

  /**
   * Execute with retry logic
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    let attempts = 0;

    while (attempts <= this.settings.maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        const isRetryable = this.isRetryableError(error);
        attempts++;

        if (!isRetryable || attempts > this.settings.maxRetries) {
          console.error(
            `❌ Failed ${operationName} after ${attempts} attempt(s).`,
            error,
          );
          throw error;
        }

        // Handle rate limiting
        if (error.response?.status === 429) {
          const retryAfterHeader = error.response.headers?.["retry-after"];
          const retryAfterSeconds = retryAfterHeader
            ? parseInt(retryAfterHeader, 10)
            : NaN;
          const delayMs = !isNaN(retryAfterSeconds)
            ? retryAfterSeconds * 1000
            : 1000 * Math.pow(2, attempts);

          console.warn(
            `⏳ Rate limited on ${operationName}. Waiting ${delayMs}ms before retrying (attempt ${attempts}/${this.settings.maxRetries}).`,
          );
          await this.delay(delayMs);
        } else {
          const backoff = 500 * Math.pow(2, attempts);
          console.warn(
            `⚠️  Error in ${operationName} (attempt ${attempts}/${this.settings.maxRetries}). Retrying in ${backoff}ms...`,
          );
          await this.delay(backoff);
        }
      }
    }

    throw new Error(
      `Failed ${operationName} after ${this.settings.maxRetries} attempts`,
    );
  }

  /**
   * Get value from object using dot notation path
   */
  protected getValueByPath(obj: any, path: string): any {
    return path.split(".").reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  /**
   * Abstract method to test connection
   */
  abstract testConnection(): Promise<{ success: boolean; message: string }>;

  /**
   * Abstract method to sync all entities
   */
  abstract syncAll(targetDb?: any): Promise<void>;
}

/**
 * Simple progress reporter implementation
 */
export class SimpleProgressReporter implements ProgressReporter {
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
    // If we've exceeded the total, update it
    if (this.totalRecords > 0 && this.currentRecords > this.totalRecords) {
      this.totalRecords = this.currentRecords;
    }
    this.displayProgress();
  }

  reportComplete() {
    // If we have more records than expected, use actual count
    if (this.currentRecords > this.totalRecords) {
      this.totalRecords = this.currentRecords;
    }
    this.displayProgress();
    console.log();
  }

  private displayProgress() {
    const elapsed = Date.now() - this.startTime.getTime();
    const elapsedStr = this.formatTime(elapsed);

    if (this.totalRecords > 0) {
      let percentage = Math.floor(
        (this.currentRecords / this.totalRecords) * 100,
      );
      // Clamp percentage to 100%
      if (percentage > 100) percentage = 100;

      const progressBar = this.createProgressBar(percentage);

      const rate = this.currentRecords / (elapsed / 1000);
      const remaining =
        ((this.totalRecords - this.currentRecords) / rate) * 1000;
      const remainingStr = remaining > 0 ? this.formatTime(remaining) : "0s";

      process.stdout.write(
        `\r🟢 Syncing ${this.entityName}: ${progressBar} ${percentage}% (${this.currentRecords.toLocaleString()}/${this.totalRecords.toLocaleString()}) | ⏱️  ${elapsedStr} elapsed | 🕒 ${remainingStr} left`,
      );
    } else {
      process.stdout.write(
        `\r🟢 Syncing ${this.entityName}: ${this.currentRecords.toLocaleString()} records fetched | ⏱️  ${elapsedStr} elapsed`,
      );
    }
  }

  private createProgressBar(percentage: number): string {
    const width = 20;
    // Ensure filled doesn't exceed width
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
