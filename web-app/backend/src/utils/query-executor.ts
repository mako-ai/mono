import { MongoClient, Db } from "mongodb";
import dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: "./.env" });

// Simple configuration loader for the web app
function loadConfig() {
  // Use environment variables primarily (which are set in docker-compose)
  const mongoUrl =
    process.env.MONGODB_CONNECTION_STRING || "mongodb://mongodb:27017";
  const database = process.env.MONGODB_DATABASE || "close_analytics";

  console.log(`🔌 Connecting to MongoDB: ${mongoUrl}/${database}`);

  return {
    mongodb: {
      connection_string: mongoUrl,
      database: database,
    },
  };
}

export class QueryExecutor {
  private client: MongoClient;
  private db!: Db;

  constructor() {
    const config = loadConfig();
    this.client = new MongoClient(config.mongodb.connection_string);
  }

  private async connect(): Promise<void> {
    await this.client.connect();
    const config = loadConfig();
    this.db = this.client.db(config.mongodb.database);
  }

  private async disconnect(): Promise<void> {
    await this.client.close();
  }

  async executeQuery(queryContent: string): Promise<any> {
    try {
      await this.connect();

      console.log(
        `🔍 Executing query content:\n${queryContent.substring(0, 200)}...`
      );

      // Create a proxy db object that can access any collection dynamically
      const db = new Proxy(this.db, {
        get: (target, prop) => {
          if (typeof prop === "string") {
            console.log(`📋 Accessing collection: ${prop}`);
            // Return the collection for any property access
            return target.collection(prop);
          }
          return (target as any)[prop];
        },
      });

      // Execute the query file content directly
      console.log(`⚡ Evaluating query...`);
      const result = eval(queryContent);
      console.log(`📤 Raw result type: ${typeof result}`);
      console.log(`📤 Raw result constructor: ${result?.constructor?.name}`);
      console.log(
        `📤 Has toArray method: ${typeof result?.toArray === "function"}`
      );
      console.log(`📤 Has then method: ${typeof result?.then === "function"}`);

      // Handle MongoDB cursors and promises
      let finalResult;
      if (result && typeof result.then === "function") {
        // It's a promise, await it
        console.log(`⏳ Awaiting promise...`);
        finalResult = await result;
        console.log(`✅ Promise resolved, result type: ${typeof finalResult}`);
      } else if (result && typeof result.toArray === "function") {
        // It's a MongoDB cursor, convert to array
        console.log(`📋 Converting cursor to array...`);
        finalResult = await result.toArray();
        console.log(
          `✅ Cursor converted, array length: ${finalResult?.length}`
        );
      } else {
        // It's a direct result
        console.log(`📋 Using direct result`);
        finalResult = result;
      }

      console.log(`🎯 Final result type: ${typeof finalResult}`);
      console.log(`🎯 Final result is array: ${Array.isArray(finalResult)}`);
      console.log(
        `🎯 Final result length/value:`,
        Array.isArray(finalResult) ? finalResult.length : finalResult
      );

      return finalResult;
    } catch (error) {
      console.error(`❌ Query execution error:`, error);
      throw new Error(
        `Query execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await this.disconnect();
    }
  }
}
