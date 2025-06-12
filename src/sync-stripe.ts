import Stripe from "stripe";
import { MongoClient, Db } from "mongodb";
import {
  databaseDataSourceManager,
  DataSourceConfig,
} from "./database-data-source-manager";
import type { ProgressReporter } from "./sync";
import * as dotenv from "dotenv";

dotenv.config();

export class StripeSyncService {
  private stripe: Stripe;
  private mongoConnections: Map<string, { client: MongoClient; db: Db }> =
    new Map();
  private settings: {
    batchSize: number;
    rateLimitDelay: number;
    timezone: string;
  };

  constructor(private dataSource: DataSourceConfig) {
    const apiKey = dataSource.connection.api_key;
    if (!apiKey) {
      throw new Error("Stripe API key is required");
    }

    this.stripe = new Stripe(apiKey, {
      apiVersion: "2023-10-16",
    });

    // Get settings with defaults
    this.settings = {
      batchSize: dataSource.settings.sync_batch_size || 50,
      rateLimitDelay: dataSource.settings.rate_limit_delay_ms || 300,
      timezone: dataSource.settings.timezone || "UTC",
    };
  }

  async syncAll(targetDb?: any): Promise<void> {
    console.log(`\n🔄 Starting full sync for ${this.dataSource.name}`);

    // Sync in order to handle dependencies
    await this.syncCustomers(targetDb);
    await this.syncProducts(targetDb);
    await this.syncPlans(targetDb);
    await this.syncSubscriptions(targetDb);
    await this.syncCharges(targetDb);
    await this.syncInvoices(targetDb);

    console.log(`\n✅ Full sync completed for ${this.dataSource.name}`);
  }

  async connectToDatabase(targetDb?: any): Promise<{
    client: MongoClient;
    db: Db;
  }> {
    if (!targetDb) {
      throw new Error("Target database configuration is required");
    }

    const client = new MongoClient(targetDb.connection.connection_string);
    await client.connect();
    const db = client.db(targetDb.connection.database);

    return { client, db };
  }

  private async getMongoConnection(
    targetDbId: string = "local_dev.analytics_db",
  ): Promise<{ client: MongoClient; db: Db }> {
    // Check if connection already exists
    if (this.mongoConnections.has(targetDbId)) {
      return this.mongoConnections.get(targetDbId)!;
    }

    // Get target database configuration
    const targetDb = databaseDataSourceManager.getMongoDBDatabase(targetDbId);
    if (!targetDb || targetDb.type !== "mongodb") {
      throw new Error(`MongoDB data source '${targetDbId}' not found`);
    }

    // Create new connection
    const client = new MongoClient(targetDb.connection.connection_string!);
    await client.connect();
    const db = client.db(targetDb.connection.database);

    const connection = { client, db };
    this.mongoConnections.set(targetDbId, connection);

    console.log(
      `Connected to MongoDB: ${targetDb.name} for Stripe source: ${this.dataSource.name}`,
    );
    return connection;
  }

  private async disconnect(): Promise<void> {
    for (const [dbId, connection] of this.mongoConnections.entries()) {
      await connection.client.close();
      console.log(`Disconnected from MongoDB: ${dbId}`);
    }
    this.mongoConnections.clear();
  }

  private async fetchAllStripeData<T>(
    listMethod: (params: any) => Stripe.ApiListPromise<T>,
    params: any = {},
    progress?: ProgressReporter,
  ): Promise<T[]> {
    const results: T[] = [];
    let hasMore = true;
    let startingAfter: string | undefined = undefined;
    let page = 0;

    console.log("Starting to fetch Stripe data with params:", params);

    while (hasMore) {
      try {
        page++;
        console.log(`Fetching page ${page}...`);

        const requestParams = {
          ...params,
          limit: this.settings.batchSize,
          ...(startingAfter && { starting_after: startingAfter }),
        };

        console.log("Request params:", requestParams);

        const response = await listMethod(requestParams);

        console.log(`Page ${page} fetched: ${response.data.length} items`);

        results.push(...response.data);

        // Report batch completion
        if (progress && response.data.length > 0) {
          progress.reportBatch(response.data.length);
        }

        hasMore = response.has_more;

        if (hasMore && response.data.length > 0) {
          startingAfter = (response.data[response.data.length - 1] as any).id;
          console.log(
            `More data available, waiting ${this.settings.rateLimitDelay}ms before next request...`,
          );
          // Apply rate limiting
          await this.delay(this.settings.rateLimitDelay);
        }
      } catch (error) {
        console.error(`Error fetching Stripe data on page ${page}:`, error);

        // Check if it's a Stripe error
        if (error instanceof Stripe.errors.StripeError) {
          console.error(`Stripe API Error: ${error.type} - ${error.message}`);
          console.error(`Error code: ${error.code}`);

          // Check for specific error types
          if (error.type === "StripeAuthenticationError") {
            console.error(
              "Authentication failed. Please check your Stripe API key.",
            );
            console.error(
              `Current API key starts with: ${this.dataSource.connection.api_key?.substring(0, 10)}...`,
            );
          }
        }

        throw error;
      }
    }

    // Report completion
    if (progress) {
      progress.reportComplete();
    }

    console.log(`Finished fetching Stripe data: ${results.length} total items`);
    return results;
  }

  async syncCustomers(
    targetDbId?: string,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting customers sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const customers = await this.fetchAllStripeData(
        params => this.stripe.customers.list(params),
        {},
        progress,
      );
      console.log(`Fetched ${customers.length} customers from Stripe`);

      // Use collection name with source ID prefix
      const collectionName = `${this.dataSource.id}_customers`;
      const collection = db.collection(collectionName);

      // Process customers with data source reference
      const processedCustomers = customers.map(customer => ({
        ...customer,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedCustomers.length > 0) {
        const bulkOps = processedCustomers.map(customer => ({
          replaceOne: {
            filter: { id: customer.id, _dataSourceId: this.dataSource.id },
            replacement: customer,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${result.upsertedCount + result.modifiedCount} customers in collection ${collectionName}`,
        );
      }
    } catch (error) {
      console.error("Customer sync failed:", error);
      throw error;
    }
  }

  async syncSubscriptions(
    targetDbId?: string,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting subscriptions sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const subscriptions = await this.fetchAllStripeData(
        params => this.stripe.subscriptions.list(params),
        { status: "all" },
        progress,
      );
      console.log(`Fetched ${subscriptions.length} subscriptions from Stripe`);

      // Use collection name with source ID prefix
      const collectionName = `${this.dataSource.id}_subscriptions`;
      const collection = db.collection(collectionName);

      // Process subscriptions with data source reference
      const processedSubscriptions = subscriptions.map(subscription => ({
        ...subscription,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedSubscriptions.length > 0) {
        const bulkOps = processedSubscriptions.map(subscription => ({
          replaceOne: {
            filter: { id: subscription.id, _dataSourceId: this.dataSource.id },
            replacement: subscription,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${
            result.upsertedCount + result.modifiedCount
          } subscriptions in collection ${collectionName}`,
        );
      }
    } catch (error) {
      console.error("Subscription sync failed:", error);
      throw error;
    }
  }

  async syncCharges(
    targetDbId?: string,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting charges sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const charges = await this.fetchAllStripeData(
        params => this.stripe.charges.list(params),
        {},
        progress,
      );
      console.log(`Fetched ${charges.length} charges from Stripe`);

      // Use collection name with source ID prefix
      const collectionName = `${this.dataSource.id}_charges`;
      const collection = db.collection(collectionName);

      // Process charges with data source reference
      const processedCharges = charges.map(charge => ({
        ...charge,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedCharges.length > 0) {
        const bulkOps = processedCharges.map(charge => ({
          replaceOne: {
            filter: { id: charge.id, _dataSourceId: this.dataSource.id },
            replacement: charge,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${result.upsertedCount + result.modifiedCount} charges in collection ${collectionName}`,
        );
      }
    } catch (error) {
      console.error("Charge sync failed:", error);
      throw error;
    }
  }

  async syncInvoices(
    targetDbId?: string,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting invoices sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const invoices = await this.fetchAllStripeData(
        params => this.stripe.invoices.list(params),
        {},
        progress,
      );
      console.log(`Fetched ${invoices.length} invoices from Stripe`);

      // Use collection name with source ID prefix
      const collectionName = `${this.dataSource.id}_invoices`;
      const collection = db.collection(collectionName);

      // Process invoices with data source reference
      const processedInvoices = invoices.map(invoice => ({
        ...invoice,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedInvoices.length > 0) {
        const bulkOps = processedInvoices.map(invoice => ({
          replaceOne: {
            filter: { id: invoice.id, _dataSourceId: this.dataSource.id },
            replacement: invoice,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${result.upsertedCount + result.modifiedCount} invoices in collection ${collectionName}`,
        );
      }
    } catch (error) {
      console.error("Invoice sync failed:", error);
      throw error;
    }
  }

  async syncProducts(
    targetDbId?: string,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting products sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const products = await this.fetchAllStripeData(
        params => this.stripe.products.list(params),
        { active: true },
        progress,
      );
      console.log(`Fetched ${products.length} products from Stripe`);

      // Use collection name with source ID prefix
      const collectionName = `${this.dataSource.id}_products`;
      const collection = db.collection(collectionName);

      // Process products with data source reference
      const processedProducts = products.map(product => ({
        ...product,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedProducts.length > 0) {
        const bulkOps = processedProducts.map(product => ({
          replaceOne: {
            filter: { id: product.id, _dataSourceId: this.dataSource.id },
            replacement: product,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${result.upsertedCount + result.modifiedCount} products in collection ${collectionName}`,
        );
      }
    } catch (error) {
      console.error("Product sync failed:", error);
      throw error;
    }
  }

  async syncPlans(
    targetDbId?: string,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting plans sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const plans = await this.fetchAllStripeData(
        params => this.stripe.plans.list(params),
        {},
        progress,
      );
      console.log(`Fetched ${plans.length} plans from Stripe`);

      // Use collection name with source ID prefix
      const collectionName = `${this.dataSource.id}_plans`;
      const collection = db.collection(collectionName);

      // Process plans with data source reference
      const processedPlans = plans.map(plan => ({
        ...plan,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedPlans.length > 0) {
        const bulkOps = processedPlans.map(plan => ({
          replaceOne: {
            filter: { id: plan.id, _dataSourceId: this.dataSource.id },
            replacement: plan,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${result.upsertedCount + result.modifiedCount} plans in collection ${collectionName}`,
        );
      }
    } catch (error) {
      console.error("Plan sync failed:", error);
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getDataSources() {
    return databaseDataSourceManager.getDataSourcesByType("stripe");
  }
}

// Load data source configuration
async function loadDataSourceConfig(): Promise<DataSourceConfig[]> {
  try {
    // Validate configuration first
    const validation = databaseDataSourceManager.validateConfig();
    if (!validation.valid) {
      console.error("Configuration validation failed:");
      validation.errors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    return databaseDataSourceManager.getDataSourcesByType("stripe");
  } catch (error) {
    console.error("Failed to load configuration:", error);
    console.error(
      "Make sure config/config.yaml exists and is properly formatted",
    );
    process.exit(1);
  }
}

// Main execution
async function main() {
  const dataSources = await loadDataSourceConfig();

  if (dataSources.length === 0) {
    console.log("No active Stripe data sources found.");
    process.exit(0);
  }

  console.log(`Found ${dataSources.length} active Stripe data source(s)`);

  // Check command line arguments
  const args = process.argv.slice(2);
  const targetDbId = args.find(arg => arg.startsWith("--db="))?.split("=")[1];
  const specificSourceId = args.find(arg => !arg.startsWith("--"));

  if (specificSourceId) {
    // Sync specific data source
    const source = dataSources.find(s => s.id === specificSourceId);
    if (!source) {
      console.error(
        `Data source '${specificSourceId}' not found or not active`,
      );
      console.log("\nAvailable Stripe data sources:");
      dataSources.forEach(s => console.log(`  - ${s.id}: ${s.name}`));
      process.exit(1);
    }

    const syncService = new StripeSyncService(source);
    await syncService.syncAll(targetDbId);
  } else {
    // Sync all data sources
    for (const dataSource of dataSources) {
      const syncService = new StripeSyncService(dataSource);
      await syncService.syncAll(targetDbId);
    }
  }

  console.log("\n✅ All syncs completed successfully!");
}

// Execute if run directly
if (require.main === module) {
  main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
