import { MongoClient, Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { dataSourceManager } from './data-source-manager';

dotenv.config();

class QueryRunner {
  private connections: Map<string, { client: MongoClient; db: Db }> = new Map();
  private currentDataSource: string = 'analytics_db';

  constructor() {
    // Initialize with primary database
    const primaryDb = dataSourceManager.getPrimaryDatabase();
    if (primaryDb) {
      this.currentDataSource = primaryDb.id;
    }
  }

  private async getConnection(
    dataSourceId?: string,
  ): Promise<{ client: MongoClient; db: Db }> {
    const sourceId = dataSourceId || this.currentDataSource;

    // Check if connection already exists
    if (this.connections.has(sourceId)) {
      return this.connections.get(sourceId)!;
    }

    // Get data source configuration
    const dataSource = dataSourceManager.getDataSource(sourceId);
    if (!dataSource || dataSource.type !== 'mongodb') {
      throw new Error(`MongoDB data source '${sourceId}' not found`);
    }

    // Create new connection
    const client = new MongoClient(dataSource.connection.connection_string!);
    await client.connect();
    const db = client.db(dataSource.connection.database);

    const connection = { client, db };
    this.connections.set(sourceId, connection);

    console.log(`Connected to MongoDB: ${dataSource.name}`);
    return connection;
  }

  async executeQuery(
    queryFilePath: string,
    dataSourceId?: string,
  ): Promise<any[]> {
    try {
      const { db } = await this.getConnection(dataSourceId);

      // Read the query file
      const absolutePath = path.isAbsolute(queryFilePath)
        ? queryFilePath
        : path.join(process.cwd(), queryFilePath);

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Query file not found: ${absolutePath}`);
      }

      const queryContent = fs.readFileSync(absolutePath, 'utf8');

      // Parse the MongoDB aggregation pipeline
      let pipeline;
      try {
        // Remove any JavaScript comments and parse
        const cleanedQuery = queryContent.replace(/\/\/.*$/gm, '').trim();
        pipeline = JSON.parse(cleanedQuery);
      } catch (parseError) {
        throw new Error(`Failed to parse query JSON: ${parseError}`);
      }

      // Ensure pipeline is an array
      if (!Array.isArray(pipeline)) {
        pipeline = [pipeline];
      }

      // Extract collection name from the first stage if it's a $from stage
      let collectionName = 'leads'; // default collection
      if (
        pipeline.length > 0 &&
        pipeline[0].$from &&
        typeof pipeline[0].$from === 'string'
      ) {
        collectionName = pipeline[0].$from;
        pipeline.shift(); // Remove the $from stage
      }

      console.log(`Executing query on collection: ${collectionName}`);
      console.log(
        `Using data source: ${dataSourceId || this.currentDataSource}`,
      );

      // Execute the aggregation pipeline
      const collection = db.collection(collectionName);
      const results = await collection.aggregate(pipeline).toArray();

      console.log(`Query returned ${results.length} results`);
      return results;
    } catch (error) {
      console.error('Query execution failed:', error);
      throw error;
    }
  }

  async listCollections(dataSourceId?: string): Promise<string[]> {
    try {
      const { db } = await this.getConnection(dataSourceId);
      const collections = await db.listCollections().toArray();
      return collections.map((col) => col.name);
    } catch (error) {
      console.error('Failed to list collections:', error);
      throw error;
    }
  }

  async getCollectionStats(
    collectionName: string,
    dataSourceId?: string,
  ): Promise<any> {
    try {
      const { db } = await this.getConnection(dataSourceId);
      const stats = await db.command({ collStats: collectionName });
      return stats;
    } catch (error) {
      console.error('Failed to get collection stats:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    for (const [sourceId, connection] of this.connections.entries()) {
      await connection.client.close();
      console.log(`Disconnected from MongoDB: ${sourceId}`);
    }
    this.connections.clear();
  }

  /**
   * List all available MongoDB data sources
   */
  listAvailableDataSources(): {
    id: string;
    name: string;
    description?: string;
  }[] {
    return dataSourceManager.getMongoDBSources().map((source) => ({
      id: source.id,
      name: source.name,
      description: source.description,
    }));
  }

  /**
   * Switch the default data source for queries
   */
  setDefaultDataSource(dataSourceId: string): void {
    const source = dataSourceManager.getDataSource(dataSourceId);
    if (!source || source.type !== 'mongodb') {
      throw new Error(`MongoDB data source '${dataSourceId}' not found`);
    }
    this.currentDataSource = dataSourceId;
    console.log(`Default data source set to: ${source.name}`);
  }
}

export default QueryRunner;
