import { Db } from 'mongodb';
import { mongoConnection } from './mongodb-connection';

export class QueryExecutor {
  async executeQuery(queryContent: string, databaseId?: string): Promise<any> {
    try {
      console.log(
        `🔍 QueryExecutor.executeQuery called with databaseId: ${databaseId || 'none (will use default)'}`,
      );

      // Get the appropriate database instance
      const dbInstance = databaseId
        ? await mongoConnection.getDatabase(databaseId)
        : await mongoConnection.getDb();

      console.log(
        `🔍 Executing query content${databaseId ? ` on database ${databaseId}` : ''}:\n${queryContent.substring(0, 200)}...`,
      );

      // Create a proxy db object that can access any collection dynamically
      const db = new Proxy(dbInstance, {
        get: (target, prop) => {
          // First check if this property exists on the target (database methods)
          if (prop in target) {
            const value = (target as any)[prop];
            // If it's a function, bind it to the target to maintain 'this' context
            if (typeof value === 'function') {
              return value.bind(target);
            }
            return value;
          }

          // Mongo-shell helper for db.getCollectionInfos([filter], [options])
          if (prop === 'getCollectionInfos') {
            return (filter?: any, options?: any) => {
              return (target as Db).listCollections(filter, options).toArray();
            };
          }

          // Mongo-shell helper for db.getCollectionNames([filter])
          if (prop === 'getCollectionNames') {
            return (filter?: any) => {
              return (target as Db)
                .listCollections(filter, { nameOnly: true })
                .toArray()
                .then((infos) => infos.map((info) => info.name));
            };
          }

          // Provide backwards-compatibility for Mongo-shell style helper db.getCollection(<name>)
          if (prop === 'getCollection') {
            return (name: string) => (target as Db).collection(name);
          }

          // If it's a string and not a database method, treat it as a collection name
          if (typeof prop === 'string') {
            console.log(`📋 Accessing collection: ${prop}`);
            return target.collection(prop);
          }

          return undefined;
        },
      });

      // Execute the query file content directly
      console.log('⚡ Evaluating query...');
      const result = eval(queryContent);
      console.log(`📤 Raw result type: ${typeof result}`);
      console.log(`📤 Raw result constructor: ${result?.constructor?.name}`);
      console.log(
        `📤 Has toArray method: ${typeof result?.toArray === 'function'}`,
      );
      console.log(`📤 Has then method: ${typeof result?.then === 'function'}`);

      // Handle MongoDB cursors and promises
      let finalResult;
      if (result && typeof result.then === 'function') {
        // It's a promise, await it
        console.log('⏳ Awaiting promise...');
        finalResult = await result;
        console.log(`✅ Promise resolved, result type: ${typeof finalResult}`);
      } else if (result && typeof result.toArray === 'function') {
        // It's a MongoDB cursor, convert to array
        console.log('📋 Converting cursor to array...');
        finalResult = await result.toArray();
        console.log(
          `✅ Cursor converted, array length: ${finalResult?.length}`,
        );
      } else {
        // It's a direct result
        console.log('📋 Using direct result');
        finalResult = result;
      }

      console.log(`🎯 Final result type: ${typeof finalResult}`);
      console.log(`🎯 Final result is array: ${Array.isArray(finalResult)}`);
      console.log(
        '🎯 Final result length/value:',
        Array.isArray(finalResult) ? finalResult.length : finalResult,
      );

      // 🌐 Ensure the result can be safely serialised to JSON (avoid circular refs)
      const getCircularReplacer = () => {
        const seen = new WeakSet();
        return (key: string, value: any) => {
          // Handle BigInt explicitly (convert to string)
          if (typeof value === 'bigint') return value.toString();

          if (typeof value === 'object' && value !== null) {
            // Replace common MongoDB driver objects with descriptive strings
            const ctor = value.constructor?.name;
            if (
              ctor === 'Collection' ||
              ctor === 'Db' ||
              ctor === 'MongoClient' ||
              ctor === 'Cursor'
            ) {
              // Provide minimal useful info instead of the full object
              if (ctor === 'Collection') {
                return {
                  _type: 'Collection',
                  name: (value as any).collectionName,
                };
              }
              return `[${ctor}]`;
            }

            // Handle circular structures
            if (seen.has(value)) {
              return '[Circular]';
            }
            seen.add(value);
          }
          return value;
        };
      };

      let serialisableResult: any;
      try {
        serialisableResult = JSON.parse(
          JSON.stringify(finalResult, getCircularReplacer()),
        );
      } catch (stringifyError) {
        console.warn(
          '⚠️ Failed to fully serialise result, falling back to string representation',
        );
        serialisableResult = String(finalResult);
      }

      return serialisableResult;
    } catch (error) {
      console.error('❌ Query execution error:', error);
      throw new Error(
        `Query execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
