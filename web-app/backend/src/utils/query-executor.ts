import { Db } from "mongodb";
import { mongoConnection } from "./mongodb-connection";

export class QueryExecutor {
  async executeQuery(queryContent: string): Promise<any> {
    try {
      const dbInstance = await mongoConnection.getDb();

      console.log(
        `🔍 Executing query content:\n${queryContent.substring(0, 200)}...`
      );

      // Create a proxy db object that can access any collection dynamically
      const db = new Proxy(dbInstance, {
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
    }
  }
}
