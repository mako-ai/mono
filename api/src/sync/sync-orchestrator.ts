import { syncConnectorRegistry } from "./connector-registry";
import { databaseDataSourceManager } from "./database-data-source-manager";
import { getDestinationManager } from "./destination-manager";
import { SyncLogger } from "../connectors/base/BaseConnector";
import { MongoClient, Db } from "mongodb";
import { ProgressReporter } from "./progress-reporter";

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
  let mongoConnection: { client: MongoClient; db: Db } | null = null;

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

    // Get destination database
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

    // Test connection first
    const connectionTest = await connector.testConnection();
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

    // Connect to MongoDB for direct operations
    const client = new MongoClient(destinationDb.connection.connection_string);
    await client.connect();
    const db = client.db(destinationDb.connection.database);
    mongoConnection = { client, db };

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

      // Fetch data from connector
      await connector.fetchEntity({
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
      });

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
  } finally {
    // Clean up all database connections
    try {
      if (mongoConnection) {
        await mongoConnection.client.close();
        logger?.log("info", "MongoDB connection closed");
      }
    } catch (cleanupError) {
      logger?.log("warn", "Error during database cleanup:", cleanupError);
    }
  }
}
