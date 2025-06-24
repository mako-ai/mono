import Stripe from "stripe";
import { IDataSource } from "../../database/workspace-schema";
import { BaseSyncService, ProgressReporter } from "../base/BaseSyncService";
import * as dotenv from "dotenv";

dotenv.config();

export class StripeSyncService extends BaseSyncService {
  private stripe: Stripe;

  constructor(dataSource: IDataSource) {
    super(dataSource);

    const apiKey = dataSource.config.api_key;
    if (!apiKey) {
      throw new Error("Stripe API key is required");
    }

    this.stripe = new Stripe(apiKey, {
      apiVersion: "2023-10-16",
    });

    // Override batch size for Stripe (they have lower default limits)
    this.settings.batchSize = dataSource.settings?.sync_batch_size || 50;
    this.settings.rateLimitDelay =
      dataSource.settings?.rate_limit_delay_ms || 300;

    // Backups disabled globally via BaseSyncService
  }

  // Create a collection-safe identifier from the data source name
  protected getCollectionPrefix(): string {
    return this.dataSource.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
  }

  /**
   * Test Stripe connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // Test by fetching account info
      await this.stripe.accounts.retrieve();
      return {
        success: true,
        message: "Stripe connection successful",
      };
    } catch (error) {
      return {
        success: false,
        message: `Stripe connection failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Fetch all data from Stripe with pagination
   */
  private async fetchAllStripeData<T>(
    listMethod: (params: any) => Stripe.ApiListPromise<T>,
    params: any = {},
    progress?: ProgressReporter,
    onBatch?: (records: T[]) => Promise<void>,
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

        if (onBatch) {
          await onBatch(response.data as unknown as T[]);
        } else {
          results.push(...response.data);
        }

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
              `Current API key starts with: ${this.dataSource.config.api_key?.substring(0, 10)}...`,
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

  /**
   * Sync all Stripe entities
   */
  async syncAll(targetDb?: any): Promise<void> {
    console.log(
      `\n🔄 Starting full sync with staging for ${this.dataSource.name}`,
    );

    // Get database connection
    const { db } = await this.getMongoConnection(targetDb);

    const entities = [
      "customers",
      "products",
      "plans",
      "subscriptions",
      "charges",
      "invoices",
    ];
    const stagingCollections: string[] = [];
    const targetCollections: string[] = [];

    try {
      // Sync all entities to staging collections
      console.log("📊 Syncing to staging collections...");

      const timestamp = Date.now();

      for (const entity of entities) {
        const baseCollectionName = `${this.getCollectionPrefix()}_${entity}`;
        const stagingCollectionName = `${baseCollectionName}_staging_${timestamp}`;

        stagingCollections.push(stagingCollectionName);
        targetCollections.push(baseCollectionName);

        console.log(`\n🔄 Syncing ${entity} to staging...`);

        switch (entity) {
          case "customers":
            await this.syncCustomersToStaging(db, stagingCollectionName);
            break;
          case "products":
            await this.syncProductsToStaging(db, stagingCollectionName);
            break;
          case "plans":
            await this.syncPlansToStaging(db, stagingCollectionName);
            break;
          case "subscriptions":
            await this.syncSubscriptionsToStaging(db, stagingCollectionName);
            break;
          case "charges":
            await this.syncChargesToStaging(db, stagingCollectionName);
            break;
          case "invoices":
            await this.syncInvoicesToStaging(db, stagingCollectionName);
            break;
        }
      }

      // If all syncs successful, perform hot swap
      await this.hotSwapCollections(db, stagingCollections, targetCollections);

      console.log(
        `\n✅ Full sync with hot swap completed for ${this.dataSource.name}`,
      );
    } catch (error) {
      console.error("❌ Full sync failed, cleaning up staging collections...");

      // Clean up staging collections on error
      for (const stagingCollection of stagingCollections) {
        try {
          await db.collection(stagingCollection).drop();
          console.log(
            `🗑️  Cleaned up staging collection: ${stagingCollection}`,
          );
        } catch {
          // Ignore cleanup errors
        }
      }

      throw error;
    }
  }

  /**
   * Direct sync without staging (for individual entities)
   */
  async syncAllDirect(targetDb?: any): Promise<void> {
    console.log(
      `\n🔄 Starting direct sync (upsert mode) for ${this.dataSource.name}`,
    );

    // Sync in order to handle dependencies with direct upserts
    await this.syncCustomers(targetDb);
    await this.syncProducts(targetDb);
    await this.syncPlans(targetDb);
    await this.syncSubscriptions(targetDb);
    await this.syncCharges(targetDb);
    await this.syncInvoices(targetDb);

    console.log(`\n✅ Direct sync completed for ${this.dataSource.name}`);
  }

  /**
   * Sync entity with staging
   */
  async syncEntityWithStaging(entity: string, targetDb?: any): Promise<void> {
    console.log(
      `\n🔄 Starting staging sync for ${entity} in ${this.dataSource.name}`,
    );

    // Get database connection
    const { db } = await this.getMongoConnection(targetDb);

    const timestamp = Date.now();
    const baseCollectionName = `${this.getCollectionPrefix()}_${entity}`;
    const stagingCollectionName = `${baseCollectionName}_staging_${timestamp}`;

    try {
      // Sync specific entity to staging collection
      switch (entity.toLowerCase()) {
        case "customers":
        case "customer":
          await this.syncCustomersToStaging(db, stagingCollectionName);
          break;
        case "subscriptions":
        case "subscription":
          await this.syncSubscriptionsToStaging(db, stagingCollectionName);
          break;
        case "charges":
        case "charge":
          await this.syncChargesToStaging(db, stagingCollectionName);
          break;
        case "invoices":
        case "invoice":
          await this.syncInvoicesToStaging(db, stagingCollectionName);
          break;
        case "products":
        case "product":
          await this.syncProductsToStaging(db, stagingCollectionName);
          break;
        case "plans":
        case "plan":
          await this.syncPlansToStaging(db, stagingCollectionName);
          break;
        default:
          throw new Error(`Unknown entity: ${entity}`);
      }

      // Hot swap single collection
      await this.hotSwapCollections(
        db,
        [stagingCollectionName],
        [baseCollectionName],
      );

      console.log(
        `\n✅ Staging sync completed for ${entity} in ${this.dataSource.name}`,
      );
    } catch (error) {
      console.error(`❌ Staging sync failed for ${entity}, cleaning up...`);

      // Clean up staging collection on error
      try {
        await db.collection(stagingCollectionName).drop();
        console.log(
          `🗑️  Cleaned up staging collection: ${stagingCollectionName}`,
        );
      } catch {
        // Ignore cleanup errors
      }

      throw error;
    }
  }

  // Direct sync methods (without staging)
  async syncCustomers(
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting customers sync for: ${this.dataSource.name}`);

    const { db } = await this.getMongoConnection(targetDb);

    try {
      const customers = await this.fetchAllStripeData(
        params => this.stripe.customers.list(params),
        {},
        progress,
      );
      console.log(`Fetched ${customers.length} customers from Stripe`);

      // Use collection name with source name prefix
      const collectionName = `${this.getCollectionPrefix()}_customers`;
      const collection = db.collection(collectionName);

      // Process customers with data source reference
      const processedCustomers = customers.map(customer =>
        this.processRecordWithMetadata(customer),
      );

      if (processedCustomers.length > 0) {
        const bulkOps = processedCustomers.map(customer => ({
          replaceOne: {
            filter: {
              id: customer.id,
              _dataSourceId: this.dataSource._id.toString(),
            },
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
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting subscriptions sync for: ${this.dataSource.name}`);

    const { db } = await this.getMongoConnection(targetDb);

    try {
      const subscriptions = await this.fetchAllStripeData(
        params => this.stripe.subscriptions.list(params),
        { status: "all" },
        progress,
      );
      console.log(`Fetched ${subscriptions.length} subscriptions from Stripe`);

      const collectionName = `${this.getCollectionPrefix()}_subscriptions`;
      const collection = db.collection(collectionName);

      const processedSubscriptions = subscriptions.map(subscription =>
        this.processRecordWithMetadata(subscription),
      );

      if (processedSubscriptions.length > 0) {
        const bulkOps = processedSubscriptions.map(subscription => ({
          replaceOne: {
            filter: {
              id: subscription.id,
              _dataSourceId: this.dataSource._id.toString(),
            },
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
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting charges sync for: ${this.dataSource.name}`);

    const { db } = await this.getMongoConnection(targetDb);

    try {
      const charges = await this.fetchAllStripeData(
        params => this.stripe.charges.list(params),
        {},
        progress,
      );
      console.log(`Fetched ${charges.length} charges from Stripe`);

      const collectionName = `${this.getCollectionPrefix()}_charges`;
      const collection = db.collection(collectionName);

      const processedCharges = charges.map(charge =>
        this.processRecordWithMetadata(charge),
      );

      if (processedCharges.length > 0) {
        const bulkOps = processedCharges.map(charge => ({
          replaceOne: {
            filter: {
              id: charge.id,
              _dataSourceId: this.dataSource._id.toString(),
            },
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
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting invoices sync for: ${this.dataSource.name}`);

    const { db } = await this.getMongoConnection(targetDb);

    try {
      const invoices = await this.fetchAllStripeData(
        params => this.stripe.invoices.list(params),
        {},
        progress,
      );
      console.log(`Fetched ${invoices.length} invoices from Stripe`);

      const collectionName = `${this.getCollectionPrefix()}_invoices`;
      const collection = db.collection(collectionName);

      const processedInvoices = invoices.map(invoice =>
        this.processRecordWithMetadata(invoice),
      );

      if (processedInvoices.length > 0) {
        const bulkOps = processedInvoices.map(invoice => ({
          replaceOne: {
            filter: {
              id: invoice.id,
              _dataSourceId: this.dataSource._id.toString(),
            },
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
    targetDb?: any,
    progress?: ProgressReporter,
  ): Promise<void> {
    console.log(`Starting products sync for: ${this.dataSource.name}`);

    const { db } = await this.getMongoConnection(targetDb);

    try {
      const products = await this.fetchAllStripeData(
        params => this.stripe.products.list(params),
        { active: true },
        progress,
      );
      console.log(`Fetched ${products.length} products from Stripe`);

      const collectionName = `${this.getCollectionPrefix()}_products`;
      const collection = db.collection(collectionName);

      const processedProducts = products.map(product =>
        this.processRecordWithMetadata(product),
      );

      if (processedProducts.length > 0) {
        const bulkOps = processedProducts.map(product => ({
          replaceOne: {
            filter: {
              id: product.id,
              _dataSourceId: this.dataSource._id.toString(),
            },
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

  async syncPlans(targetDb?: any, progress?: ProgressReporter): Promise<void> {
    console.log(`Starting plans sync for: ${this.dataSource.name}`);

    const { db } = await this.getMongoConnection(targetDb);

    try {
      const plans = await this.fetchAllStripeData(
        params => this.stripe.plans.list(params),
        {},
        progress,
      );
      console.log(`Fetched ${plans.length} plans from Stripe`);

      const collectionName = `${this.getCollectionPrefix()}_plans`;
      const collection = db.collection(collectionName);

      const processedPlans = plans.map(plan =>
        this.processRecordWithMetadata(plan),
      );

      if (processedPlans.length > 0) {
        const bulkOps = processedPlans.map(plan => ({
          replaceOne: {
            filter: {
              id: plan.id,
              _dataSourceId: this.dataSource._id.toString(),
            },
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

  // Staging sync methods
  private async syncCustomersToStaging(
    db: any,
    stagingCollectionName: string,
  ): Promise<void> {
    const collection = db.collection(stagingCollectionName);

    await this.fetchAllStripeData(
      params => this.stripe.customers.list(params),
      {},
      undefined,
      async batch => {
        const docs = batch.map(c => this.processRecordWithMetadata(c));
        if (docs.length) await collection.insertMany(docs);
      },
    );
    console.log("✅ Customers streamed into staging");
  }

  private async syncProductsToStaging(
    db: any,
    stagingCollectionName: string,
  ): Promise<void> {
    const collection = db.collection(stagingCollectionName);

    await this.fetchAllStripeData(
      params => this.stripe.products.list(params),
      { active: true },
      undefined,
      async batch => {
        const docs = batch.map(p => this.processRecordWithMetadata(p));
        if (docs.length) await collection.insertMany(docs);
      },
    );
    console.log("✅ Products streamed into staging");
  }

  private async syncPlansToStaging(
    db: any,
    stagingCollectionName: string,
  ): Promise<void> {
    const collection = db.collection(stagingCollectionName);

    await this.fetchAllStripeData(
      params => this.stripe.plans.list(params),
      {},
      undefined,
      async batch => {
        const docs = batch.map(plan => this.processRecordWithMetadata(plan));
        if (docs.length) await collection.insertMany(docs);
      },
    );
    console.log("✅ Plans streamed into staging");
  }

  private async syncSubscriptionsToStaging(
    db: any,
    stagingCollectionName: string,
  ): Promise<void> {
    const collection = db.collection(stagingCollectionName);

    await this.fetchAllStripeData(
      params => this.stripe.subscriptions.list(params),
      { status: "all" },
      undefined,
      async batch => {
        const docs = batch.map(s => this.processRecordWithMetadata(s));
        if (docs.length) await collection.insertMany(docs);
      },
    );
    console.log("✅ Subscriptions streamed into staging");
  }

  private async syncChargesToStaging(
    db: any,
    stagingCollectionName: string,
  ): Promise<void> {
    const collection = db.collection(stagingCollectionName);

    await this.fetchAllStripeData(
      params => this.stripe.charges.list(params),
      {},
      undefined,
      async batch => {
        const docs = batch.map(c => this.processRecordWithMetadata(c));
        if (docs.length) await collection.insertMany(docs);
      },
    );
    console.log("✅ Charges streamed into staging");
  }

  private async syncInvoicesToStaging(
    db: any,
    stagingCollectionName: string,
  ): Promise<void> {
    const collection = db.collection(stagingCollectionName);

    await this.fetchAllStripeData(
      params => this.stripe.invoices.list(params),
      {},
      undefined,
      async batch => {
        const docs = batch.map(inv => this.processRecordWithMetadata(inv));
        if (docs.length) await collection.insertMany(docs);
      },
    );
    console.log("✅ Invoices streamed into staging");
  }
}

// Re-export for backward compatibility
export { ProgressReporter };
