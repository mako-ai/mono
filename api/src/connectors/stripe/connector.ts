import {
  BaseConnector,
  ConnectionTestResult,
  FetchOptions,
  ResumableFetchOptions,
  FetchState,
} from "../base/BaseConnector";
import Stripe from "stripe";

export class StripeConnector extends BaseConnector {
  private stripe: Stripe | null = null;

  // Schema describing required configuration for this connector (used by frontend)
  static getConfigSchema() {
    return {
      fields: [
        {
          name: "api_key",
          label: "API Key",
          type: "password",
          required: true,
          helperText: "Your Stripe secret API key",
        },
        {
          name: "api_base_url",
          label: "API Base URL",
          type: "string",
          required: false,
          default: "https://api.stripe.com",
        },
      ],
    };
  }

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

      // Test connection by fetching account info
      await stripe.accounts.retrieve();

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

  /**
   * Check if connector supports resumable fetching
   */
  supportsResumableFetching(): boolean {
    return true;
  }

  /**
   * Fetch a chunk of data with resumable state
   */
  async fetchEntityChunk(options: ResumableFetchOptions): Promise<FetchState> {
    const { entity, onBatch, onProgress, since, state } = options;
    const maxIterations = options.maxIterations || 10;

    const stripe = this.getStripeClient();
    const batchSize = options.batchSize || this.getBatchSize();
    const rateLimitDelay = options.rateLimitDelay || this.getRateLimitDelay();

    // Initialize or restore state
    let startingAfter: string | undefined = state?.cursor;
    let recordCount = state?.totalProcessed || 0;
    let hasMore = true;
    let iterations = 0;

    // Report initial progress (Stripe doesn't provide total counts)
    if (!state && onProgress) {
      onProgress(0, undefined);
    }

    while (hasMore && iterations < maxIterations) {
      let response: any;

      // Fetch data based on entity type
      switch (entity) {
        case "customers":
          response = await stripe.customers.list({
            limit: batchSize,
            ...(startingAfter && { starting_after: startingAfter }),
            ...(since && {
              created: { gte: Math.floor(since.getTime() / 1000) },
            }),
          });
          break;

        case "subscriptions":
          response = await stripe.subscriptions.list({
            limit: batchSize,
            ...(startingAfter && { starting_after: startingAfter }),
            ...(since && {
              created: { gte: Math.floor(since.getTime() / 1000) },
            }),
          });
          break;

        case "charges":
          response = await stripe.charges.list({
            limit: batchSize,
            ...(startingAfter && { starting_after: startingAfter }),
            ...(since && {
              created: { gte: Math.floor(since.getTime() / 1000) },
            }),
          });
          break;

        case "invoices":
          response = await stripe.invoices.list({
            limit: batchSize,
            ...(startingAfter && { starting_after: startingAfter }),
            ...(since && {
              created: { gte: Math.floor(since.getTime() / 1000) },
            }),
          });
          break;

        case "products":
          response = await stripe.products.list({
            limit: batchSize,
            ...(startingAfter && { starting_after: startingAfter }),
            ...(since && {
              created: { gte: Math.floor(since.getTime() / 1000) },
            }),
          });
          break;

        case "plans":
          response = await stripe.plans.list({
            limit: batchSize,
            ...(startingAfter && { starting_after: startingAfter }),
            ...(since && {
              created: { gte: Math.floor(since.getTime() / 1000) },
            }),
          });
          break;

        default:
          throw new Error(`Unsupported entity: ${entity}`);
      }

      // Pass batch to callback
      if (response.data.length > 0) {
        await onBatch(response.data);
        recordCount += response.data.length;

        if (onProgress) {
          onProgress(recordCount, undefined);
        }
      }

      // Check for more pages
      hasMore = response.has_more;

      if (hasMore && response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
        iterations++;

        // Rate limiting
        await this.sleep(rateLimitDelay);
      } else {
        // No more data
        break;
      }
    }

    return {
      cursor: startingAfter,
      totalProcessed: recordCount,
      hasMore,
      iterationsInChunk: iterations,
    };
  }

  async fetchEntity(options: FetchOptions): Promise<void> {
    const { entity, onBatch, onProgress, since } = options;

    const stripe = this.getStripeClient();
    const batchSize = options.batchSize || this.getBatchSize();
    const rateLimitDelay = options.rateLimitDelay || this.getRateLimitDelay();

    let hasMore = true;
    let startingAfter: string | undefined;
    let recordCount = 0;

    // Report initial progress (Stripe doesn't provide total counts)
    if (onProgress) {
      onProgress(0, undefined);
    }

    while (hasMore) {
      let response: any;

      // Fetch data based on entity type
      switch (entity) {
        case "customers":
          response = await stripe.customers.list({
            limit: batchSize,
            ...(startingAfter && { starting_after: startingAfter }),
            ...(since && {
              created: { gte: Math.floor(since.getTime() / 1000) },
            }),
          });
          break;

        case "subscriptions":
          response = await stripe.subscriptions.list({
            limit: batchSize,
            ...(startingAfter && { starting_after: startingAfter }),
            ...(since && {
              created: { gte: Math.floor(since.getTime() / 1000) },
            }),
          });
          break;

        case "charges":
          response = await stripe.charges.list({
            limit: batchSize,
            ...(startingAfter && { starting_after: startingAfter }),
            ...(since && {
              created: { gte: Math.floor(since.getTime() / 1000) },
            }),
          });
          break;

        case "invoices":
          response = await stripe.invoices.list({
            limit: batchSize,
            ...(startingAfter && { starting_after: startingAfter }),
            ...(since && {
              created: { gte: Math.floor(since.getTime() / 1000) },
            }),
          });
          break;

        case "products":
          response = await stripe.products.list({
            limit: batchSize,
            ...(startingAfter && { starting_after: startingAfter }),
            ...(since && {
              created: { gte: Math.floor(since.getTime() / 1000) },
            }),
          });
          break;

        case "plans":
          response = await stripe.plans.list({
            limit: batchSize,
            ...(startingAfter && { starting_after: startingAfter }),
            ...(since && {
              created: { gte: Math.floor(since.getTime() / 1000) },
            }),
          });
          break;

        default:
          throw new Error(`Unsupported entity: ${entity}`);
      }

      // Pass batch to callback
      if (response.data.length > 0) {
        await onBatch(response.data);
        recordCount += response.data.length;

        if (onProgress) {
          onProgress(recordCount, undefined);
        }
      }

      // Check for more pages
      hasMore = response.has_more;

      if (hasMore && response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;

        // Rate limiting
        await this.sleep(rateLimitDelay);
      }
    }
  }
}
