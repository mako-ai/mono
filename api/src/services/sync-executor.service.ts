import { spawn } from "child_process";
import * as path from "path";

/**
 * Execute sync using the existing sync CLI tool
 * This approach reuses all the existing sync logic without duplicating code
 */
export async function performSync(
  dataSourceId: string,
  destinationDatabaseId: string,
  entityFilter?: string[],
  isIncremental: boolean = false,
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

    console.log(`Executing sync command: ts-node ${args.join(" ")}`);

    // Spawn the sync process using ts-node
    const syncProcess = spawn("ts-node", args, {
      cwd: path.join(__dirname, "../../.."),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let error = "";

    syncProcess.stdout.on("data", data => {
      const text = data.toString();
      output += text;
      console.log(text.trim());
    });

    syncProcess.stderr.on("data", data => {
      const text = data.toString();
      error += text;
      console.error(text.trim());
    });

    syncProcess.on("close", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Sync process exited with code ${code}: ${error || output}`,
          ),
        );
      }
    });

    syncProcess.on("error", err => {
      reject(new Error(`Failed to start sync process: ${err.message}`));
    });
  });
}
