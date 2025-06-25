import { spawn } from "child_process";
import * as path from "path";

// Logger interface for sync execution
export interface SyncLogger {
  log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    metadata?: any,
  ): void;
}

/**
 * Execute sync using the existing sync CLI tool
 * This approach reuses all the existing sync logic without duplicating code
 */
export async function performSync(
  dataSourceId: string,
  destinationDatabaseId: string,
  entityFilter?: string[],
  isIncremental: boolean = false,
  logger?: SyncLogger,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Path to the sync script
    const syncScript = path.join(__dirname, "../../../sync/sync.ts");

    // Build command arguments
    const args = [syncScript, dataSourceId, destinationDatabaseId];

    // Add entity if specified (only supports one entity at a time)
    if (entityFilter && entityFilter.length > 0) {
      args.push(entityFilter[0]);
    }

    // Add incremental flag if needed
    if (isIncremental) {
      args.push("--incremental");
    }

    const command = `ts-node ${args.join(" ")}`;
    console.log(`Executing sync command: ${command}`);
    logger?.log("info", `Executing sync command: ${command}`);

    // Log sync context
    logger?.log("info", `Sync mode: ${isIncremental ? "incremental" : "full"}`);
    if (entityFilter && entityFilter.length > 0) {
      logger?.log("info", `Entity filter: ${entityFilter[0]}`);
    }
    logger?.log("info", `Data source: ${dataSourceId}`);
    logger?.log("info", `Destination: ${destinationDatabaseId}`);

    // Spawn the sync process using ts-node
    const syncProcess = spawn("ts-node", args, {
      cwd: path.join(__dirname, "../../.."),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let error = "";

    syncProcess.stdout.on("data", data => {
      const text = data.toString().trim();
      if (text) {
        output += text + "\n";
        console.log(text);
        // Log each line of sync output
        text.split("\n").forEach((line: string) => {
          if (line.trim()) {
            logger?.log("info", line.trim());
          }
        });
      }
    });

    syncProcess.stderr.on("data", data => {
      const text = data.toString().trim();
      if (text) {
        error += text + "\n";
        console.error(text);
        // Log each line of sync errors
        text.split("\n").forEach((line: string) => {
          if (line.trim()) {
            logger?.log("error", line.trim());
          }
        });
      }
    });

    syncProcess.on("close", code => {
      if (code === 0) {
        logger?.log(
          "info",
          `Sync process completed successfully (exit code: ${code})`,
        );
        resolve();
      } else {
        const errorMsg = `Sync process exited with code ${code}: ${error || output}`;
        logger?.log("error", errorMsg);
        reject(new Error(errorMsg));
      }
    });

    syncProcess.on("error", err => {
      const errorMsg = `Failed to start sync process: ${err.message}`;
      logger?.log("error", errorMsg);
      reject(new Error(errorMsg));
    });
  });
}
