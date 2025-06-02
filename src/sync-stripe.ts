import Stripe from "stripe";
import { MongoClient, Db, Collection } from "mongodb";
import { dataSourceManager } from "./data-source-manager";
import type { DataSourceConfig } from "./data-source-manager";
import * as dotenv from "dotenv";

dotenv.config();

interface SyncStats {
  totalRecords: number;
  batchesProcessed: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
}

class StripeSyncService {
  private stripe: Stripe;
  private mongoConnections: Map<string, { client: MongoClient; db: Db }> =
    new Map();
  private dataSource: DataSourceConfig;
  private settings: {
    batchSize: number;
    rateLimitDelay: number;
    maxRetries: number;
  };

  constructor(dataSource: DataSourceConfig) {
    this.dataSource = dataSource;

    // Get Stripe configuration
    if (!dataSource.connection.api_key) {
      throw new Error(
        `Stripe API key is required for data source ${dataSource.id}`
      );
    }

    console.log(`Initializing Stripe client for ${dataSource.name}`);
    console.log(
      `API key loaded: ${dataSource.connection.api_key ? "Yes" : "No"}`
    );
    console.log(
      `API key prefix: ${dataSource.connection.api_key?.substring(0, 10)}...`
    );

    this.stripe = new Stripe(dataSource.connection.api_key, {
      // Add timeout to prevent hanging
      timeout: 60000, // 60 seconds
      maxNetworkRetries: 2,
    });

    // Get settings with defaults
    const globalConfig = dataSourceManager.getGlobalConfig();
    this.settings = {
      batchSize: dataSource.settings.sync_batch_size || 50,
      rateLimitDelay: dataSource.settings.rate_limit_delay_ms || 300,
      maxRetries:
        dataSource.settings.max_retries || globalConfig.max_retries || 5,
    };
  }

  private async getMongoConnection(
    targetDbId: string = "local_dev.analytics_db"
  ): Promise<{ client: MongoClient; db: Db }> {
    // Check if connection already exists
    if (this.mongoConnections.has(targetDbId)) {
      return this.mongoConnections.get(targetDbId)!;
    }

    // Get target database configuration
    const targetDb = dataSourceManager.getMongoDBDatabase(targetDbId);
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
      `Connected to MongoDB: ${targetDb.name} for Stripe source: ${this.dataSource.name}`
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
    params: any = {}
  ): Promise<T[]> {
    const results: T[] = [];
    let hasMore = true;
    let startingAfter: string | undefined = undefined;
    let page = 0;

    console.log(`Starting to fetch Stripe data with params:`, params);

    while (hasMore) {
      try {
        page++;
        console.log(`Fetching page ${page}...`);

        const requestParams = {
          ...params,
          limit: this.settings.batchSize,
          ...(startingAfter && { starting_after: startingAfter }),
        };

        console.log(`Request params:`, requestParams);

        const response = await listMethod(requestParams);

        console.log(`Page ${page} fetched: ${response.data.length} items`);

        results.push(...response.data);
        hasMore = response.has_more;

        if (hasMore && response.data.length > 0) {
          startingAfter = (response.data[response.data.length - 1] as any).id;
          console.log(
            `More data available, waiting ${this.settings.rateLimitDelay}ms before next request...`
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
              `Authentication failed. Please check your Stripe API key.`
            );
            console.error(
              `Current API key starts with: ${this.dataSource.connection.api_key?.substring(0, 10)}...`
            );
          }
        }

        throw error;
      }
    }

    console.log(`Finished fetching Stripe data: ${results.length} total items`);
    return results;
  }

  async syncCustomers(targetDbId?: string): Promise<void> {
    console.log(`Starting customers sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const customers = await this.fetchAllStripeData((params) =>
        this.stripe.customers.list(params)
      );
      console.log(`Fetched ${customers.length} customers from Stripe`);

      // Use collection name with source ID prefix
      const collectionName = `${this.dataSource.id}_customers`;
      const collection = db.collection(collectionName);

      // Process customers with data source reference
      const processedCustomers = customers.map((customer) => ({
        ...customer,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedCustomers.length > 0) {
        const bulkOps = processedCustomers.map((customer) => ({
          replaceOne: {
            filter: { id: customer.id, _dataSourceId: this.dataSource.id },
            replacement: customer,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${result.upsertedCount + result.modifiedCount} customers in collection ${collectionName}`
        );
      }
    } catch (error) {
      console.error("Customer sync failed:", error);
      throw error;
    }
  }

  async syncSubscriptions(targetDbId?: string): Promise<void> {
    console.log(`Starting subscriptions sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const subscriptions = await this.fetchAllStripeData(
        (params) => this.stripe.subscriptions.list(params),
        { status: "all" }
      );
      console.log(`Fetched ${subscriptions.length} subscriptions from Stripe`);

      // Use collection name with source ID prefix
      const collectionName = `${this.dataSource.id}_subscriptions`;
      const collection = db.collection(collectionName);

      // Process subscriptions with data source reference
      const processedSubscriptions = subscriptions.map((subscription) => ({
        ...subscription,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedSubscriptions.length > 0) {
        const bulkOps = processedSubscriptions.map((subscription) => ({
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
          } subscriptions in collection ${collectionName}`
        );
      }
    } catch (error) {
      console.error("Subscription sync failed:", error);
      throw error;
    }
  }

  async syncCharges(targetDbId?: string): Promise<void> {
    console.log(`Starting charges sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const charges = await this.fetchAllStripeData((params) =>
        this.stripe.charges.list(params)
      );
      console.log(`Fetched ${charges.length} charges from Stripe`);

      // Use collection name with source ID prefix
      const collectionName = `${this.dataSource.id}_charges`;
      const collection = db.collection(collectionName);

      // Process charges with data source reference
      const processedCharges = charges.map((charge) => ({
        ...charge,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedCharges.length > 0) {
        const bulkOps = processedCharges.map((charge) => ({
          replaceOne: {
            filter: { id: charge.id, _dataSourceId: this.dataSource.id },
            replacement: charge,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${result.upsertedCount + result.modifiedCount} charges in collection ${collectionName}`
        );
      }
    } catch (error) {
      console.error("Charge sync failed:", error);
      throw error;
    }
  }

  async syncInvoices(targetDbId?: string): Promise<void> {
    console.log(`Starting invoices sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const invoices = await this.fetchAllStripeData((params) =>
        this.stripe.invoices.list(params)
      );
      console.log(`Fetched ${invoices.length} invoices from Stripe`);

      // Use collection name with source ID prefix
      const collectionName = `${this.dataSource.id}_invoices`;
      const collection = db.collection(collectionName);

      // Process invoices with data source reference
      const processedInvoices = invoices.map((invoice) => ({
        ...invoice,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedInvoices.length > 0) {
        const bulkOps = processedInvoices.map((invoice) => ({
          replaceOne: {
            filter: { id: invoice.id, _dataSourceId: this.dataSource.id },
            replacement: invoice,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${result.upsertedCount + result.modifiedCount} invoices in collection ${collectionName}`
        );
      }
    } catch (error) {
      console.error("Invoice sync failed:", error);
      throw error;
    }
  }

  async syncProducts(targetDbId?: string): Promise<void> {
    console.log(`Starting products sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const products = await this.fetchAllStripeData(
        (params) => this.stripe.products.list(params),
        { active: true }
      );
      console.log(`Fetched ${products.length} products from Stripe`);

      // Use collection name with source ID prefix
      const collectionName = `${this.dataSource.id}_products`;
      const collection = db.collection(collectionName);

      // Process products with data source reference
      const processedProducts = products.map((product) => ({
        ...product,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedProducts.length > 0) {
        const bulkOps = processedProducts.map((product) => ({
          replaceOne: {
            filter: { id: product.id, _dataSourceId: this.dataSource.id },
            replacement: product,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${result.upsertedCount + result.modifiedCount} products in collection ${collectionName}`
        );
      }
    } catch (error) {
      console.error("Product sync failed:", error);
      throw error;
    }
  }

  async syncPlans(targetDbId?: string): Promise<void> {
    console.log(`Starting plans sync for: ${this.dataSource.name}`);
    const { db } = await this.getMongoConnection(targetDbId);

    try {
      const plans = await this.fetchAllStripeData((params) =>
        this.stripe.plans.list(params)
      );
      console.log(`Fetched ${plans.length} plans from Stripe`);

      // Use collection name with source ID prefix
      const collectionName = `${this.dataSource.id}_plans`;
      const collection = db.collection(collectionName);

      // Process plans with data source reference
      const processedPlans = plans.map((plan) => ({
        ...plan,
        _dataSourceId: this.dataSource.id,
        _dataSourceName: this.dataSource.name,
        _syncedAt: new Date(),
      }));

      if (processedPlans.length > 0) {
        const bulkOps = processedPlans.map((plan) => ({
          replaceOne: {
            filter: { id: plan.id, _dataSourceId: this.dataSource.id },
            replacement: plan,
            upsert: true,
          },
        }));

        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `Upserted ${result.upsertedCount + result.modifiedCount} plans in collection ${collectionName}`
        );
      }
    } catch (error) {
      console.error("Plan sync failed:", error);
      throw error;
    }
  }

  async syncAll(targetDbId?: string): Promise<void> {
    console.log(
      `\n🔄 Starting full sync for data source: ${this.dataSource.name}`
    );
    console.log(`Target database: ${targetDbId || "local_dev.analytics_db"}`);
    const startTime = Date.now();

    try {
      // Sync all data types
      await this.syncCustomers(targetDbId);
      await this.syncSubscriptions(targetDbId);
      await this.syncCharges(targetDbId);
      await this.syncInvoices(targetDbId);
      await this.syncProducts(targetDbId);
      await this.syncPlans(targetDbId);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(
        `✅ Full sync completed for ${this.dataSource.name} in ${duration}s`
      );
    } catch (error) {
      console.error(`❌ Sync failed for ${this.dataSource.name}:`, error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Load data source configuration
function loadDataSourceConfig(): DataSourceConfig[] {
  try {
    // Validate configuration first
    const validation = dataSourceManager.validateConfig();
    if (!validation.valid) {
      console.error("Configuration validation failed:");
      validation.errors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }

    return dataSourceManager.getDataSourcesByType("stripe");
  } catch (error) {
    console.error("Failed to load configuration:", error);
    console.error(
      "Make sure config/config.yaml exists and environment variables are set"
    );
    process.exit(1);
  }
}

// Main execution
async function main() {
  const dataSources = loadDataSourceConfig();

  if (dataSources.length === 0) {
    console.log("No active Stripe data sources found.");
    process.exit(0);
  }

  console.log(`Found ${dataSources.length} active Stripe data source(s)`);

  // Check command line arguments
  const args = process.argv.slice(2);
  const targetDbId = args.find((arg) => arg.startsWith("--db="))?.split("=")[1];
  const specificSourceId = args.find((arg) => !arg.startsWith("--"));

  if (specificSourceId) {
    // Sync specific data source
    const source = dataSources.find((s) => s.id === specificSourceId);
    if (!source) {
      console.error(
        `Data source '${specificSourceId}' not found or not active`
      );
      console.log("\nAvailable Stripe data sources:");
      dataSources.forEach((s) => console.log(`  - ${s.id}: ${s.name}`));
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
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { StripeSyncService };
