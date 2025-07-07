import { syncConnectorRegistry } from "./connector-registry";
import { databaseDataSourceManager } from "./database-data-source-manager";
import { getDestinationManager } from "./destination-manager";
import {
  databaseConnectionService,
  ConnectionConfig,
} from "../services/database-connection.service";
import { SyncLogger, FetchState } from "../connectors/base/BaseConnector";
import { Db } from "mongodb";
import { ProgressReporter } from "./progress-reporter";
import axios from "axios";

export interface SyncChunkResult {
  state: FetchState;
  entity: string;
  collectionName: string;
  completed: boolean;
}

export interface SyncChunkOptions {
  dataSourceId: string;
  destinationId: string;
  entity: string;
  isIncremental: boolean;
  state?: FetchState;
  maxIterations?: number;
  logger?: SyncLogger;
}

/**
 * Execute an operation with retry logic
 */
async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  logger?: SyncLogger,
): Promise<T> {
  let attempts = 0;

  while (attempts <= maxRetries) {
    try {
      return await operation();
    } catch (error) {
      attempts++;

      if (attempts > maxRetries) {
        throw error;
      }

      // Handle rate limiting
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        const retryAfter = error.response.headers["retry-after"];
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : 1000 * Math.pow(2, attempts);
        logger?.log(
          "warn",
          `Rate limited. Waiting ${delayMs}ms before retry ${attempts}/${maxRetries}`,
        );
        await sleep(delayMs);
      } else if (isRetryableError(error)) {
        // Exponential backoff for other retryable errors
        const backoff = 500 * Math.pow(2, attempts);
        logger?.log(
          "warn",
          `Retryable error (${getErrorDescription(error)}). Waiting ${backoff}ms before retry ${attempts}/${maxRetries}`,
        );
        await sleep(backoff);
      } else {
        // Non-retryable error
        throw error;
      }
    }
  }

  throw new Error("Max retries exceeded");
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any): boolean {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      // Network errors are retryable
      return true;
    }
    // Retry on server errors, rate limiting, and gateway timeouts
    const status = error.response.status;
    return status >= 500 || status === 429 || status === 408; // 408 = Request Timeout
  }
  return false;
}

/**
 * Get human-readable error description
 */
function getErrorDescription(error: any): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return "Network error";
    }
    const status = error.response.status;
    switch (status) {
      case 500:
        return "Internal Server Error";
      case 502:
        return "Bad Gateway";
      case 503:
        return "Service Unavailable";
      case 504:
        return "Gateway Timeout";
      case 408:
        return "Request Timeout";
      default:
        return `HTTP ${status}`;
    }
  }
  return "Unknown error";
}

/**
 * Sleep utility function
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Performs a single chunk of sync work and returns state for resumption
 */
export async function performSyncChunk(
  options: SyncChunkOptions,
): Promise<SyncChunkResult> {
  const {
    dataSourceId,
    destinationId,
    entity,
    isIncremental,
    state,
    maxIterations = 10,
    logger,
  } = options;

  const syncMode = isIncremental ? "incremental" : "full";
  let db: Db | null = null;

  try {
    // Get the data source
    const dataSource =
      await databaseDataSourceManager.getDataSource(dataSourceId);
    if (!dataSource) {
      throw new Error(`Data source '${dataSourceId}' not found`);
    }

    if (!dataSource.active) {
      throw new Error(`Data source '${dataSource.name}' is not active`);
    }

    // Get connector from registry
    const connector = await syncConnectorRegistry.getConnector(dataSource);
    if (!connector) {
      throw new Error(
        `Failed to create connector for type: ${dataSource.type}`,
      );
    }

    // Check if connector supports resumable fetching
    if (!connector.supportsResumableFetching()) {
      throw new Error(
        `Connector ${dataSource.type} does not support resumable fetching`,
      );
    }

    // Get connection from unified pool
    const connection = await databaseConnectionService.getConnectionById(
      "destination",
      destinationId,
      async (id: string) => {
        const destinationDb = await getDestinationManager().getDestination(id);
        if (!destinationDb) return null;

        return {
          connectionString: destinationDb.connection.connection_string,
          database: destinationDb.connection.database,
        } as ConnectionConfig;
      },
    );
    db = connection.db;

    // Collection setup
    const collectionName = `${dataSource.name}_${entity}`;
    const stagingCollectionName = `${collectionName}_staging`;
    const useStaging = syncMode === "full" && !state; // Only use staging for first chunk of full sync

    const collection = useStaging
      ? db.collection(stagingCollectionName)
      : db.collection(collectionName);

    if (useStaging) {
      // Drop staging collection if exists
      try {
        await db.collection(stagingCollectionName).drop();
      } catch {
        // Ignore if doesn't exist
      }
      await db.createCollection(stagingCollectionName);
    }

    let lastSyncDate: Date | undefined;

    // Get last sync date for incremental (only on first chunk)
    if (syncMode === "incremental" && !state) {
      const lastRecord = await db
        .collection(collectionName)
        .find({ _dataSourceId: dataSource.id })
        .sort({ _syncedAt: -1 })
        .limit(1)
        .toArray();

      if (lastRecord.length > 0) {
        lastSyncDate = lastRecord[0]._syncedAt;
        logger?.log(
          "info",
          `Syncing ${entity} updated after: ${lastSyncDate!.toISOString()}`,
        );
      }
    }

    // Create progress reporter
    const progressReporter = new ProgressReporter(entity, undefined, logger);

    // Fetch chunk from connector with retry logic
    const maxRetries = dataSource.settings?.max_retries || 3;
    const fetchState = await executeWithRetry(
      () =>
        connector.fetchEntityChunk({
          entity,
          state,
          maxIterations,
          ...(lastSyncDate && { since: lastSyncDate }),
          onBatch: async batch => {
            if (batch.length === 0) return;

            // Add metadata to records
            const processedRecords = batch.map(record => ({
              ...record,
              _dataSourceId: dataSource.id,
              _dataSourceName: dataSource.name,
              _syncedAt: new Date(),
            }));

            // Prepare bulk operations
            const bulkOps = processedRecords.map(record => ({
              replaceOne: {
                filter: {
                  id: record.id,
                  _dataSourceId: dataSource.id,
                },
                replacement: record,
                upsert: true,
              },
            }));

            // Write to database
            await collection.bulkWrite(bulkOps, { ordered: false });
          },
          onProgress: (current, total) => {
            progressReporter.reportProgress(current, total);
          },
        }),
      maxRetries,
      logger,
    );

    const completed = !fetchState.hasMore;

    if (completed) {
      progressReporter.reportComplete();

      // Hot swap for full sync (only if this was the first chunk with staging)
      if (useStaging) {
        try {
          await db.collection(collectionName).drop();
        } catch {
          // Ignore if doesn't exist
        }
        await db.collection(stagingCollectionName).rename(collectionName);
      }

      logger?.log(
        "info",
        `✅ ${entity} sync completed (${fetchState.totalProcessed} records)`,
      );
    } else {
      logger?.log(
        "info",
        `📊 ${entity} chunk completed (${fetchState.totalProcessed} records so far, ${fetchState.iterationsInChunk} iterations)`,
      );
    }

    return {
      state: fetchState,
      entity,
      collectionName,
      completed,
    };
  } catch (error) {
    const errorMsg = `Sync chunk failed: ${error instanceof Error ? error.message : String(error)}`;
    logger?.log("error", errorMsg, {
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(errorMsg, { cause: error });
  }
  // Note: We don't close the connection here anymore - it stays in the unified pool
}

/**
 * Orchestrates the sync process using the new architecture
 * where connectors are database-agnostic and all DB operations
 * are handled by the sync layer
 */
export async function performSync(
  dataSourceId: string,
  destinationId: string,
  entities: string[] | undefined,
  isIncremental: boolean = false,
  logger?: SyncLogger,
) {
  logger?.log(
    "debug",
    `performSync called with isIncremental: ${isIncremental}`,
  );
  const syncMode = isIncremental ? "incremental" : "full";
  logger?.log("debug", `Sync mode determined as: ${syncMode}`);
  let db: Db | null = null;

  try {
    // Validate configuration
    const validation = databaseDataSourceManager.validateConfig();
    if (!validation.valid) {
      const errorMsg =
        "Configuration validation failed: " + validation.errors.join(", ");
      logger?.log("error", errorMsg);
      throw new Error(errorMsg);
    }

    // Get the data source
    const dataSource =
      await databaseDataSourceManager.getDataSource(dataSourceId);
    if (!dataSource) {
      const errorMsg = `Data source '${dataSourceId}' not found`;
      logger?.log("error", errorMsg);
      throw new Error(errorMsg);
    }

    if (!dataSource.active) {
      const errorMsg = `Data source '${dataSource.name}' is not active`;
      logger?.log("error", errorMsg);
      throw new Error(errorMsg);
    }

    // Get destination database (just for validation)
    const destinationDb =
      await getDestinationManager().getDestination(destinationId);
    if (!destinationDb) {
      const errorMsg = `Destination database '${destinationId}' not found`;
      logger?.log("error", errorMsg);
      throw new Error(errorMsg);
    }

    // Get connector from registry
    const connector = await syncConnectorRegistry.getConnector(dataSource);
    if (!connector) {
      const errorMsg = `Failed to create connector for type: ${dataSource.type}`;
      logger?.log("error", errorMsg);
      throw new Error(errorMsg);
    }

    // Test connection first with retry logic
    const maxRetries = dataSource.settings?.max_retries || 3;
    const connectionTest = await executeWithRetry(
      () => connector.testConnection(),
      maxRetries,
      logger,
    );
    if (!connectionTest.success) {
      const errorMsg = `Failed to connect to ${dataSource.type}: ${connectionTest.message}`;
      logger?.log("error", errorMsg, { details: connectionTest.details });
      throw new Error(errorMsg);
    }

    logger?.log("info", `Successfully connected to ${dataSource.type}`);
    logger?.log("info", `Starting ${syncMode} sync...`);
    logger?.log("info", `Source: ${dataSource.name} (${dataSource.type})`);
    logger?.log("info", `Destination: ${destinationDb.name}`);

    const startTime = Date.now();

    // Get connection from unified pool
    const connection = await databaseConnectionService.getConnectionById(
      "destination",
      destinationId,
      async (id: string) => {
        const destinationDb = await getDestinationManager().getDestination(id);
        if (!destinationDb) return null;

        return {
          connectionString: destinationDb.connection.connection_string,
          database: destinationDb.connection.database,
        } as ConnectionConfig;
      },
    );
    db = connection.db;

    // Determine which entities to sync
    const availableEntities = connector.getAvailableEntities();
    let entitiesToSync: string[];

    if (entities && entities.length > 0) {
      // Validate requested entities
      const invalidEntities = entities.filter(
        e => !availableEntities.includes(e),
      );
      if (invalidEntities.length > 0) {
        const errorMsg = `Invalid entities for ${dataSource.type} connector: ${invalidEntities.join(", ")}. Available: ${availableEntities.join(", ")}`;
        logger?.log("error", errorMsg);
        throw new Error(errorMsg);
      }
      entitiesToSync = entities;
      logger?.log("info", `Entities: ${entitiesToSync.join(", ")}`);
    } else {
      // Sync all entities
      entitiesToSync = availableEntities;
      logger?.log("info", `Entities: All (${entitiesToSync.join(", ")})`);
    }

    // Sync each entity
    for (const entityName of entitiesToSync) {
      logger?.log("info", `Syncing entity: ${entityName}`);

      // Perform sync using clean architecture
      const collectionName = `${dataSource.name}_${entityName}`;
      const stagingCollectionName = `${collectionName}_staging`;
      const useStaging = syncMode === "full";

      const collection = useStaging
        ? db.collection(stagingCollectionName)
        : db.collection(collectionName);

      if (useStaging) {
        // Drop staging collection if exists
        try {
          await db.collection(stagingCollectionName).drop();
        } catch {
          // Ignore if doesn't exist
        }
        await db.createCollection(stagingCollectionName);
      }

      let recordCount = 0;
      let lastSyncDate: Date | undefined;

      // Get last sync date for incremental
      if (syncMode === "incremental") {
        logger?.log(
          "debug",
          `Looking for last sync date in collection: ${collectionName}`,
        );
        logger?.log("debug", `Using dataSourceId filter: ${dataSource.id}`);

        const lastRecord = await db
          .collection(collectionName)
          .find({ _dataSourceId: dataSource.id })
          .sort({ _syncedAt: -1 })
          .limit(1)
          .toArray();

        logger?.log(
          "debug",
          `Found ${lastRecord.length} records with _dataSourceId: ${dataSource.id}`,
        );

        if (lastRecord.length > 0) {
          lastSyncDate = lastRecord[0]._syncedAt;
          logger?.log(
            "debug",
            `Last record _syncedAt: ${lastRecord[0]._syncedAt}`,
          );
          logger?.log(
            "debug",
            `Last record _dataSourceId: ${lastRecord[0]._dataSourceId}`,
          );
          logger?.log(
            "info",
            `Syncing ${entityName} updated after: ${lastSyncDate!.toISOString()}`,
          );
        } else {
          logger?.log(
            "warn",
            `No previous sync records found for ${entityName} with dataSourceId: ${dataSource.id}`,
          );
        }
      }

      // Create progress reporter for this entity
      const progressReporter = new ProgressReporter(
        entityName,
        undefined,
        logger,
      );

      // Fetch data from connector with retry logic
      const maxRetries = dataSource.settings?.max_retries || 3;
      await executeWithRetry(
        () =>
          connector.fetchEntity({
            entity: entityName,
            ...(lastSyncDate && { since: lastSyncDate }),
            onBatch: async batch => {
              if (batch.length === 0) return;

              // Add metadata to records
              const processedRecords = batch.map(record => ({
                ...record,
                _dataSourceId: dataSource.id,
                _dataSourceName: dataSource.name,
                _syncedAt: new Date(),
              }));

              // Prepare bulk operations
              const bulkOps = processedRecords.map(record => ({
                replaceOne: {
                  filter: {
                    id: record.id,
                    _dataSourceId: dataSource.id,
                  },
                  replacement: record,
                  upsert: true,
                },
              }));

              // Write to database
              await collection.bulkWrite(bulkOps, { ordered: false });
              recordCount += batch.length;
            },
            onProgress: (current, total) => {
              progressReporter.reportProgress(current, total);
            },
          }),
        maxRetries,
        logger,
      );

      // Complete the progress reporting
      progressReporter.reportComplete();

      // Hot swap for full sync
      if (useStaging) {
        // Drop the existing collection and rename staging to main
        try {
          await db.collection(collectionName).drop();
        } catch {
          // Ignore if doesn't exist
        }

        // Rename staging to main
        await db.collection(stagingCollectionName).rename(collectionName);
      }

      logger?.log(
        "info",
        `✅ ${entityName} sync completed (${recordCount} records)`,
      );
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger?.log("info", `Sync completed successfully in ${duration}s`);
  } catch (error) {
    const errorMsg = `Sync failed: ${error instanceof Error ? error.message : String(error)}`;
    logger?.log("error", errorMsg, {
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(errorMsg, { cause: error });
  }
  // Note: We don't close the connection here anymore - it stays in the unified pool
}
