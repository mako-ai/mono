import {
  BaseConnector,
  ConnectionTestResult,
  SyncOptions,
} from "../base/BaseConnector";
import { MongoClient } from "mongodb";
import Stripe from "stripe";

export class StripeConnector extends BaseConnector {
  private stripe: Stripe | null = null;

  getMetadata() {
    return {
      name: "Stripe",
      version: "1.0.0",
      description: "Connector for Stripe payment platform",
      supportedEntities: [
        "customers",
        "subscriptions",
        "charges",
        "invoices",
        "products",
        "plans",
      ],
    };
  }

  validateConfig() {
    const base = super.validateConfig();
    const errors = [...base.errors];

    if (!this.dataSource.config.api_key) {
      errors.push("Stripe API key is required");
    }

    return { valid: errors.length === 0, errors };
  }

  private getStripeClient(): Stripe {
    if (!this.stripe) {
      if (!this.dataSource.config.api_key) {
        throw new Error("Stripe API key not configured");
      }
      this.stripe = new Stripe(this.dataSource.config.api_key, {
        apiVersion: "2023-10-16",
      });
    }
    return this.stripe;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const validation = this.validateConfig();
      if (!validation.valid) {
        return {
          success: false,
          message: "Invalid configuration",
          details: validation.errors,
        };
      }

      const stripe = this.getStripeClient();

      // Test connection by fetching a single customer
      await stripe.customers.list({ limit: 1 });

      return {
        success: true,
        message: "Successfully connected to Stripe API",
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to connect to Stripe API",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  getAvailableEntities(): string[] {
    return [
      "customers",
      "subscriptions",
      "charges",
      "invoices",
      "products",
      "plans",
    ];
  }

  async syncAll(options: SyncOptions): Promise<void> {
    const entities = this.getAvailableEntities();
    for (const entity of entities) {
      await this.syncEntity(entity, options);
    }
  }

  async syncEntity(entity: string, options: SyncOptions): Promise<void> {
    const { targetDatabase, progress } = options;

    if (!targetDatabase) {
      throw new Error("Target database is required for sync");
    }

    switch (entity.toLowerCase()) {
      case "customers":
        await this.syncCustomers(targetDatabase, progress);
        break;
      case "subscriptions":
        await this.syncSubscriptions(targetDatabase, progress);
        break;
      case "charges":
        await this.syncCharges(targetDatabase, progress);
        break;
      case "invoices":
        await this.syncInvoices(targetDatabase, progress);
        break;
      case "products":
        await this.syncProducts(targetDatabase, progress);
        break;
      case "plans":
        await this.syncPlans(targetDatabase, progress);
        break;
      default:
        throw new Error(`Unknown entity: ${entity}`);
    }
  }

  private async syncCustomers(targetDb: any, progress?: any) {
    const stripe = this.getStripeClient();
    const batchSize = this.getBatchSize();
    const delay = this.getRateLimitDelay();

    // Connect to target database
    const client = new MongoClient(targetDb.connection.connection_string);
    await client.connect();
    const db = client.db(targetDb.connection.database);
    const collection = db.collection("stripe_customers");

    try {
      let hasMore = true;
      let startingAfter: string | undefined;
      let totalSynced = 0;

      while (hasMore) {
        const customers = await stripe.customers.list({
          limit: batchSize,
          starting_after: startingAfter,
        });

        if (customers.data.length > 0) {
          const documents = customers.data.map(customer => ({
            stripeId: customer.id,
            ...customer,
            _syncedAt: new Date(),
            _dataSourceId: this.dataSource._id.toString(),
          }));

          await collection.bulkWrite(
            documents.map(doc => ({
              replaceOne: {
                filter: { stripeId: doc.stripeId },
                replacement: doc,
                upsert: true,
              },
            })),
          );

          totalSynced += documents.length;
          if (progress) {
            progress.reportBatch(documents.length);
          }

          startingAfter = customers.data[customers.data.length - 1].id;
        }

        hasMore = customers.has_more;
        if (hasMore) {
          await this.sleep(delay);
        }
      }

      if (progress) {
        progress.reportComplete();
      }

      console.log(`✓ Synced ${totalSynced} customers`);
    } finally {
      await client.close();
    }
  }

  private async syncSubscriptions(targetDb: any, progress?: any) {
    const stripe = this.getStripeClient();
    const batchSize = this.getBatchSize();
    const delay = this.getRateLimitDelay();

    const client = new MongoClient(targetDb.connection.connection_string);
    await client.connect();
    const db = client.db(targetDb.connection.database);
    const collection = db.collection("stripe_subscriptions");

    try {
      let hasMore = true;
      let startingAfter: string | undefined;
      let totalSynced = 0;

      while (hasMore) {
        const subscriptions = await stripe.subscriptions.list({
          limit: batchSize,
          starting_after: startingAfter,
          expand: ["data.customer", "data.items"],
        });

        if (subscriptions.data.length > 0) {
          const documents = subscriptions.data.map(subscription => ({
            stripeId: subscription.id,
            ...subscription,
            _syncedAt: new Date(),
            _dataSourceId: this.dataSource._id.toString(),
          }));

          await collection.bulkWrite(
            documents.map(doc => ({
              replaceOne: {
                filter: { stripeId: doc.stripeId },
                replacement: doc,
                upsert: true,
              },
            })),
          );

          totalSynced += documents.length;
          if (progress) {
            progress.reportBatch(documents.length);
          }

          startingAfter = subscriptions.data[subscriptions.data.length - 1].id;
        }

        hasMore = subscriptions.has_more;
        if (hasMore) {
          await this.sleep(delay);
        }
      }

      if (progress) {
        progress.reportComplete();
      }

      console.log(`✓ Synced ${totalSynced} subscriptions`);
    } finally {
      await client.close();
    }
  }

  private async syncCharges(targetDb: any, progress?: any) {
    const stripe = this.getStripeClient();
    const batchSize = this.getBatchSize();
    const delay = this.getRateLimitDelay();

    const client = new MongoClient(targetDb.connection.connection_string);
    await client.connect();
    const db = client.db(targetDb.connection.database);
    const collection = db.collection("stripe_charges");

    try {
      let hasMore = true;
      let startingAfter: string | undefined;
      let totalSynced = 0;

      while (hasMore) {
        const charges = await stripe.charges.list({
          limit: batchSize,
          starting_after: startingAfter,
        });

        if (charges.data.length > 0) {
          const documents = charges.data.map(charge => ({
            stripeId: charge.id,
            ...charge,
            _syncedAt: new Date(),
            _dataSourceId: this.dataSource._id.toString(),
          }));

          await collection.bulkWrite(
            documents.map(doc => ({
              replaceOne: {
                filter: { stripeId: doc.stripeId },
                replacement: doc,
                upsert: true,
              },
            })),
          );

          totalSynced += documents.length;
          if (progress) {
            progress.reportBatch(documents.length);
          }

          startingAfter = charges.data[charges.data.length - 1].id;
        }

        hasMore = charges.has_more;
        if (hasMore) {
          await this.sleep(delay);
        }
      }

      if (progress) {
        progress.reportComplete();
      }

      console.log(`✓ Synced ${totalSynced} charges`);
    } finally {
      await client.close();
    }
  }

  private async syncInvoices(targetDb: any, progress?: any) {
    const stripe = this.getStripeClient();
    const batchSize = this.getBatchSize();
    const delay = this.getRateLimitDelay();

    const client = new MongoClient(targetDb.connection.connection_string);
    await client.connect();
    const db = client.db(targetDb.connection.database);
    const collection = db.collection("stripe_invoices");

    try {
      let hasMore = true;
      let startingAfter: string | undefined;
      let totalSynced = 0;

      while (hasMore) {
        const invoices = await stripe.invoices.list({
          limit: batchSize,
          starting_after: startingAfter,
        });

        if (invoices.data.length > 0) {
          const documents = invoices.data.map(invoice => ({
            stripeId: invoice.id,
            ...invoice,
            _syncedAt: new Date(),
            _dataSourceId: this.dataSource._id.toString(),
          }));

          await collection.bulkWrite(
            documents.map(doc => ({
              replaceOne: {
                filter: { stripeId: doc.stripeId },
                replacement: doc,
                upsert: true,
              },
            })),
          );

          totalSynced += documents.length;
          if (progress) {
            progress.reportBatch(documents.length);
          }

          startingAfter = invoices.data[invoices.data.length - 1].id;
        }

        hasMore = invoices.has_more;
        if (hasMore) {
          await this.sleep(delay);
        }
      }

      if (progress) {
        progress.reportComplete();
      }

      console.log(`✓ Synced ${totalSynced} invoices`);
    } finally {
      await client.close();
    }
  }

  private async syncProducts(targetDb: any, progress?: any) {
    const stripe = this.getStripeClient();
    const batchSize = this.getBatchSize();
    const delay = this.getRateLimitDelay();

    const client = new MongoClient(targetDb.connection.connection_string);
    await client.connect();
    const db = client.db(targetDb.connection.database);
    const collection = db.collection("stripe_products");

    try {
      let hasMore = true;
      let startingAfter: string | undefined;
      let totalSynced = 0;

      while (hasMore) {
        const products = await stripe.products.list({
          limit: batchSize,
          starting_after: startingAfter,
        });

        if (products.data.length > 0) {
          const documents = products.data.map(product => ({
            stripeId: product.id,
            ...product,
            _syncedAt: new Date(),
            _dataSourceId: this.dataSource._id.toString(),
          }));

          await collection.bulkWrite(
            documents.map(doc => ({
              replaceOne: {
                filter: { stripeId: doc.stripeId },
                replacement: doc,
                upsert: true,
              },
            })),
          );

          totalSynced += documents.length;
          if (progress) {
            progress.reportBatch(documents.length);
          }

          startingAfter = products.data[products.data.length - 1].id;
        }

        hasMore = products.has_more;
        if (hasMore) {
          await this.sleep(delay);
        }
      }

      if (progress) {
        progress.reportComplete();
      }

      console.log(`✓ Synced ${totalSynced} products`);
    } finally {
      await client.close();
    }
  }

  private async syncPlans(targetDb: any, progress?: any) {
    const stripe = this.getStripeClient();
    const batchSize = this.getBatchSize();
    const delay = this.getRateLimitDelay();

    const client = new MongoClient(targetDb.connection.connection_string);
    await client.connect();
    const db = client.db(targetDb.connection.database);
    const collection = db.collection("stripe_plans");

    try {
      let hasMore = true;
      let startingAfter: string | undefined;
      let totalSynced = 0;

      while (hasMore) {
        const plans = await stripe.plans.list({
          limit: batchSize,
          starting_after: startingAfter,
        });

        if (plans.data.length > 0) {
          const documents = plans.data.map(plan => ({
            stripeId: plan.id,
            ...plan,
            _syncedAt: new Date(),
            _dataSourceId: this.dataSource._id.toString(),
          }));

          await collection.bulkWrite(
            documents.map(doc => ({
              replaceOne: {
                filter: { stripeId: doc.stripeId },
                replacement: doc,
                upsert: true,
              },
            })),
          );

          totalSynced += documents.length;
          if (progress) {
            progress.reportBatch(documents.length);
          }

          startingAfter = plans.data[plans.data.length - 1].id;
        }

        hasMore = plans.has_more;
        if (hasMore) {
          await this.sleep(delay);
        }
      }

      if (progress) {
        progress.reportComplete();
      }

      console.log(`✓ Synced ${totalSynced} plans`);
    } finally {
      await client.close();
    }
  }
}
