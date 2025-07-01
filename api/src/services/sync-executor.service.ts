import { performSync as performSyncOrchestrated } from "../sync/sync-orchestrator";

// Logger interface for sync execution
export interface SyncLogger {
  log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    metadata?: any,
  ): void;
}

/**
 * Execute sync using the refactored sync orchestrator
 */
export async function performSync(
  dataSourceId: string,
  destinationDatabaseId: string,
  entityFilter?: string[],
  isIncremental: boolean = false,
  logger?: SyncLogger,
): Promise<void> {
  // Log sync context
  logger?.log("info", `Sync mode: ${isIncremental ? "incremental" : "full"}`);
  if (entityFilter && entityFilter.length > 0) {
    logger?.log("info", `Entity filter: ${entityFilter.join(", ")}`);
  }
  logger?.log("info", `Data source: ${dataSourceId}`);
  logger?.log("info", `Destination: ${destinationDatabaseId}`);

  try {
    await performSyncOrchestrated(
      dataSourceId,
      destinationDatabaseId,
      entityFilter,
      isIncremental,
      logger,
    );
    logger?.log("info", "Sync process completed successfully");
  } catch (error) {
    const errorMsg = `Sync process failed: ${error instanceof Error ? error.message : String(error)}`;
    logger?.log("error", errorMsg);
    throw new Error(errorMsg, { cause: error });
  }
}
