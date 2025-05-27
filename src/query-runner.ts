import { MongoClient, Db } from "mongodb";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { tenantManager } from "./tenant-manager";

dotenv.config();

class QueryRunner {
  private client: MongoClient;
  private db!: Db;

  constructor() {
    const globalConfig = tenantManager.getGlobalConfig();
    this.client = new MongoClient(globalConfig.mongodb.connection_string);
  }

  private async connect(): Promise<void> {
    await this.client.connect();
    const globalConfig = tenantManager.getGlobalConfig();
    this.db = this.client.db(globalConfig.mongodb.database);
    console.log("Connected to MongoDB");
  }

  private async disconnect(): Promise<void> {
    await this.client.close();
    console.log("Disconnected from MongoDB");
  }

  private loadQueryFile(queryName: string): string {
    const queryPath = path.join(process.cwd(), "queries", `${queryName}.js`);

    if (!fs.existsSync(queryPath)) {
      throw new Error(`Query file not found: ${queryPath}`);
    }

    return fs.readFileSync(queryPath, "utf8");
  }

  async executeQuery(queryName: string): Promise<void> {
    try {
      await this.connect();

      console.log(`\n=== Executing query: ${queryName} ===`);

      const queryContent = this.loadQueryFile(queryName);
      console.log("Query content:");
      console.log(queryContent);
      console.log("\n" + "=".repeat(50));

      // Create a proxy db object that can access any collection dynamically
      const db = new Proxy(this.db, {
        get: (target, prop) => {
          if (typeof prop === "string") {
            // Return the collection for any property access
            return target.collection(prop);
          }
          return (target as any)[prop];
        },
      });

      // Execute the query file content directly
      const result = eval(queryContent);

      // Handle MongoDB cursors and promises
      let finalResult;
      if (result && typeof result.then === "function") {
        // It's a promise, await it
        finalResult = await result;
      } else if (result && typeof result.toArray === "function") {
        // It's a MongoDB cursor, convert to array
        finalResult = await result.toArray();
      } else {
        // It's a direct result
        finalResult = result;
      }

      console.log("\nQuery Results:");
      console.log("=".repeat(50));

      if (Array.isArray(finalResult)) {
        if (finalResult.length === 0) {
          console.log("No results found.");
        } else {
          console.log(`Found ${finalResult.length} result(s):\n`);
          finalResult.forEach((doc, index) => {
            console.log(`${index + 1}.`, JSON.stringify(doc, null, 2));
            if (index < finalResult.length - 1) console.log();
          });
        }
      } else {
        console.log(JSON.stringify(finalResult, null, 2));
      }
    } catch (error) {
      console.error("Query execution failed:", error);
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }

  listAvailableQueries(): void {
    const queriesDir = path.join(process.cwd(), "queries");

    if (!fs.existsSync(queriesDir)) {
      console.log("No queries directory found.");
      return;
    }

    const queryFiles = fs
      .readdirSync(queriesDir)
      .filter((file) => file.endsWith(".js"))
      .map((file) => file.replace(".js", ""));

    if (queryFiles.length === 0) {
      console.log("No query files found in the queries directory.");
      return;
    }

    console.log("Available queries:");
    queryFiles.forEach((query) => {
      console.log(`  - ${query}`);
    });
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: pnpm run query <query_name>");
    console.log("       pnpm run query --list");
    console.log("\nExample: pnpm run query leads_by_csm");
    process.exit(1);
  }

  const queryRunner = new QueryRunner();

  if (args[0] === "--list" || args[0] === "-l") {
    queryRunner.listAvailableQueries();
    return;
  }

  const queryName = args[0];
  await queryRunner.executeQuery(queryName);
}

if (require.main === module) {
  main();
}
