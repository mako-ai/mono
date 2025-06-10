import { MongoClient, Db } from 'mongodb';
import { Client as PgClient } from 'pg';
import * as mysql from 'mysql2/promise';
import { Database as SqliteDatabase } from 'sqlite3';
import { open } from 'sqlite';
import { ConnectionPool } from 'mssql';
import { IDatabase } from '../database/workspace-schema';

export interface QueryResult {
  success: boolean;
  data?: any;
  error?: string;
  rowCount?: number;
  fields?: any[];
}

export class DatabaseConnectionService {
  private connections: Map<string, any> = new Map();

  /**
   * Test database connection
   */
  async testConnection(
    database: IDatabase,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      switch (database.type) {
        case 'mongodb':
          return await this.testMongoDBConnection(database);
        case 'postgresql':
          return await this.testPostgreSQLConnection(database);
        case 'mysql':
          return await this.testMySQLConnection(database);
        case 'sqlite':
          return await this.testSQLiteConnection(database);
        case 'mssql':
          return await this.testMSSQLConnection(database);
        default:
          return {
            success: false,
            error: `Unsupported database type: ${database.type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute query on database
   */
  async executeQuery(
    database: IDatabase,
    query: any,
    options?: any,
  ): Promise<QueryResult> {
    try {
      switch (database.type) {
        case 'mongodb':
          return await this.executeMongoDBQuery(database, query, options);
        case 'postgresql':
          return await this.executePostgreSQLQuery(database, query);
        case 'mysql':
          return await this.executeMySQLQuery(database, query);
        case 'sqlite':
          return await this.executeSQLiteQuery(database, query);
        case 'mssql':
          return await this.executeMSSQLQuery(database, query);
        default:
          return {
            success: false,
            error: `Unsupported database type: ${database.type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get database connection
   */
  async getConnection(database: IDatabase): Promise<any> {
    const key = database._id.toString();

    if (this.connections.has(key)) {
      return this.connections.get(key);
    }

    let connection: any;

    switch (database.type) {
      case 'mongodb':
        connection = await this.createMongoDBConnection(database);
        break;
      case 'postgresql':
        connection = await this.createPostgreSQLConnection(database);
        break;
      case 'mysql':
        connection = await this.createMySQLConnection(database);
        break;
      case 'sqlite':
        connection = await this.createSQLiteConnection(database);
        break;
      case 'mssql':
        connection = await this.createMSSQLConnection(database);
        break;
      default:
        throw new Error(`Unsupported database type: ${database.type}`);
    }

    this.connections.set(key, connection);
    return connection;
  }

  /**
   * Close database connection
   */
  async closeConnection(databaseId: string): Promise<void> {
    const connection = this.connections.get(databaseId);
    if (!connection) return;

    try {
      if (connection instanceof MongoClient) {
        await connection.close();
      } else if (connection.end) {
        await connection.end();
      } else if (connection.close) {
        await connection.close();
      }
    } catch (error) {
      console.error('Error closing connection:', error);
    } finally {
      this.connections.delete(databaseId);
    }
  }

  /**
   * Close all connections
   */
  async closeAllConnections(): Promise<void> {
    const promises = Array.from(this.connections.keys()).map(id =>
      this.closeConnection(id),
    );
    await Promise.all(promises);
  }

  // MongoDB specific methods
  private async testMongoDBConnection(
    database: IDatabase,
  ): Promise<{ success: boolean; error?: string }> {
    let client: MongoClient | null = null;
    try {
      const connectionString = this.buildMongoDBConnectionString(database);
      client = new MongoClient(connectionString);
      await client.connect();
      await client.db().admin().ping();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'MongoDB connection failed',
      };
    } finally {
      if (client) {
        await client.close();
      }
    }
  }

  private async createMongoDBConnection(
    database: IDatabase,
  ): Promise<MongoClient> {
    const connectionString = this.buildMongoDBConnectionString(database);
    const client = new MongoClient(connectionString);
    await client.connect();
    return client;
  }

  private buildMongoDBConnectionString(database: IDatabase): string {
    const conn = database.connection;

    // If connection string is provided, use it directly
    if (conn.connectionString) {
      return conn.connectionString;
    }

    // Build connection string from individual parameters
    let connectionString = 'mongodb://';

    if (conn.username && conn.password) {
      connectionString += `${encodeURIComponent(conn.username)}:${encodeURIComponent(conn.password)}@`;
    }

    connectionString += `${conn.host || 'localhost'}:${conn.port || 27017}`;

    if (conn.database) {
      connectionString += `/${conn.database}`;
    }

    const params: string[] = [];

    if (conn.authSource) {
      params.push(`authSource=${conn.authSource}`);
    }

    if (conn.replicaSet) {
      params.push(`replicaSet=${conn.replicaSet}`);
    }

    if (conn.ssl) {
      params.push('ssl=true');
    }

    if (params.length > 0) {
      connectionString += `?${params.join('&')}`;
    }

    return connectionString;
  }

  private async executeMongoDBQuery(
    database: IDatabase,
    query: any,
    _options?: any,
  ): Promise<QueryResult> {
    const client = (await this.getConnection(database)) as MongoClient;
    const db = client.db(database.connection.database);

    try {
      // Handle different MongoDB operations
      if (typeof query === 'string') {
        // Parse JavaScript-style query
        const result = await this.executeMongoDBJavaScriptQuery(db, query);
        return { success: true, data: result };
      } else if (query.collection && query.operation) {
        // Handle structured query
        const collection = db.collection(query.collection);
        let result: any;

        switch (query.operation) {
          case 'find':
            result = await collection
              .find(query.filter || {}, query.options || {})
              .toArray();
            break;
          case 'findOne':
            result = await collection.findOne(
              query.filter || {},
              query.options || {},
            );
            break;
          case 'aggregate':
            result = await collection
              .aggregate(query.pipeline || [], query.options || {})
              .toArray();
            break;
          case 'insertMany':
            result = await collection.insertMany(
              query.documents || [],
              query.options || {},
            );
            break;
          case 'updateMany':
            result = await collection.updateMany(
              query.filter || {},
              query.update || {},
              query.options || {},
            );
            break;
          case 'deleteMany':
            result = await collection.deleteMany(
              query.filter || {},
              query.options || {},
            );
            break;
          case 'updateOne':
            result = await collection.updateOne(
              query.filter || {},
              query.update || {},
              query.options || {},
            );
            break;
          case 'deleteOne':
            result = await collection.deleteOne(
              query.filter || {},
              query.options || {},
            );
            break;
          default:
            return {
              success: false,
              error: `Unsupported MongoDB operation: ${query.operation}`,
            };
        }

        return { success: true, data: result };
      } else {
        return { success: false, error: 'Invalid MongoDB query format' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'MongoDB query failed',
      };
    }
  }

  private async executeMongoDBJavaScriptQuery(
    db: Db,
    query: string,
  ): Promise<any> {
    console.log('🔍 Executing query:', query.substring(0, 200) + '...');

    // Create a proxy db object that can access any collection dynamically
    const dbProxy = new Proxy(db, {
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
              .then(infos => infos.map(info => info.name));
          };
        }

        // Provide backwards-compatibility for Mongo-shell style helper db.getCollection(<n>)
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

    try {
      // Execute the query content directly - much simpler and more reliable
      console.log('⚡ Evaluating query...');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const db = dbProxy; // Make db available in eval context for evaluated queries
      const result = eval(query);

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
        console.log(
          `✅ Promise resolved constructor: ${finalResult?.constructor?.name}`,
        );
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

      // Ensure the result can be safely serialized to JSON (avoid circular refs)
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
              ctor === 'Cursor' ||
              ctor === 'AggregationCursor' ||
              ctor === 'FindCursor'
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

      let serializedResult: any;
      try {
        serializedResult = JSON.parse(
          JSON.stringify(finalResult, getCircularReplacer()),
        );
      } catch (stringifyError) {
        console.warn(
          '⚠️ Failed to fully serialize result, falling back to string representation',
        );
        serializedResult = String(finalResult);
      }

      return serializedResult;
    } catch (error) {
      console.error('❌ Error in executeMongoDBJavaScriptQuery:', error);
      throw error;
    }
  }

  // PostgreSQL specific methods
  private async testPostgreSQLConnection(
    database: IDatabase,
  ): Promise<{ success: boolean; error?: string }> {
    let client: PgClient | null = null;
    try {
      client = new PgClient({
        host: database.connection.host,
        port: database.connection.port || 5432,
        database: database.connection.database,
        user: database.connection.username,
        password: database.connection.password,
        ssl: database.connection.ssl ? { rejectUnauthorized: false } : false,
      });
      await client.connect();
      await client.query('SELECT 1');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'PostgreSQL connection failed',
      };
    } finally {
      if (client) {
        await client.end();
      }
    }
  }

  private async createPostgreSQLConnection(
    database: IDatabase,
  ): Promise<PgClient> {
    const client = new PgClient({
      host: database.connection.host,
      port: database.connection.port || 5432,
      database: database.connection.database,
      user: database.connection.username,
      password: database.connection.password,
      ssl: database.connection.ssl ? { rejectUnauthorized: false } : false,
    });
    await client.connect();
    return client;
  }

  private async executePostgreSQLQuery(
    database: IDatabase,
    query: string,
  ): Promise<QueryResult> {
    const client = (await this.getConnection(database)) as PgClient;
    try {
      const result = await client.query(query);
      return {
        success: true,
        data: result.rows,
        rowCount: result.rowCount ?? undefined,
        fields: result.fields,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'PostgreSQL query failed',
      };
    }
  }

  // MySQL specific methods
  private async testMySQLConnection(
    database: IDatabase,
  ): Promise<{ success: boolean; error?: string }> {
    let connection: mysql.Connection | null = null;
    try {
      connection = await mysql.createConnection({
        host: database.connection.host,
        port: database.connection.port || 3306,
        database: database.connection.database,
        user: database.connection.username,
        password: database.connection.password,
        ssl: database.connection.ssl
          ? { rejectUnauthorized: false }
          : undefined,
      });
      await connection.ping();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'MySQL connection failed',
      };
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  private async createMySQLConnection(
    database: IDatabase,
  ): Promise<mysql.Connection> {
    const connection = await mysql.createConnection({
      host: database.connection.host,
      port: database.connection.port || 3306,
      database: database.connection.database,
      user: database.connection.username,
      password: database.connection.password,
      ssl: database.connection.ssl ? { rejectUnauthorized: false } : undefined,
    });
    return connection;
  }

  private async executeMySQLQuery(
    database: IDatabase,
    query: string,
  ): Promise<QueryResult> {
    const connection = (await this.getConnection(database)) as mysql.Connection;
    try {
      const [rows, fields] = await connection.execute(query);
      return {
        success: true,
        data: rows,
        fields: fields,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'MySQL query failed',
      };
    }
  }

  // SQLite specific methods
  private async testSQLiteConnection(
    database: IDatabase,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const db = await open({
        filename: database.connection.database || ':memory:',
        driver: SqliteDatabase,
      });
      await db.get('SELECT 1');
      await db.close();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'SQLite connection failed',
      };
    }
  }

  private async createSQLiteConnection(database: IDatabase): Promise<any> {
    const db = await open({
      filename: database.connection.database || ':memory:',
      driver: SqliteDatabase,
    });
    return db;
  }

  private async executeSQLiteQuery(
    database: IDatabase,
    query: string,
  ): Promise<QueryResult> {
    const db = await this.getConnection(database);
    try {
      const result = await db.all(query);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'SQLite query failed',
      };
    }
  }

  // MSSQL specific methods
  private async testMSSQLConnection(
    database: IDatabase,
  ): Promise<{ success: boolean; error?: string }> {
    let pool: ConnectionPool | null = null;
    try {
      pool = new ConnectionPool({
        server: database.connection.host!,
        port: database.connection.port || 1433,
        database: database.connection.database!,
        user: database.connection.username!,
        password: database.connection.password!,
        options: {
          encrypt: database.connection.ssl || false,
          trustServerCertificate: true,
        },
      });
      await pool.connect();
      await pool.request().query('SELECT 1');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'MSSQL connection failed',
      };
    } finally {
      if (pool) {
        await pool.close();
      }
    }
  }

  private async createMSSQLConnection(
    database: IDatabase,
  ): Promise<ConnectionPool> {
    const pool = new ConnectionPool({
      server: database.connection.host!,
      port: database.connection.port || 1433,
      database: database.connection.database!,
      user: database.connection.username!,
      password: database.connection.password!,
      options: {
        encrypt: database.connection.ssl || false,
        trustServerCertificate: true,
      },
    });
    await pool.connect();
    return pool;
  }

  private async executeMSSQLQuery(
    database: IDatabase,
    query: string,
  ): Promise<QueryResult> {
    const pool = (await this.getConnection(database)) as ConnectionPool;
    try {
      const result = await pool.request().query(query);
      return {
        success: true,
        data: result.recordset,
        rowCount: result.rowsAffected[0],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'MSSQL query failed',
      };
    }
  }
}

// Export singleton instance
export const databaseConnectionService = new DatabaseConnectionService();
