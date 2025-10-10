import {
  BaseConnector,
  ConnectionTestResult,
  FetchOptions,
  ResumableFetchOptions,
  FetchState,
  WebhookVerificationResult,
  WebhookHandlerOptions,
  WebhookEventMapping,
} from "../base/BaseConnector";
import axios, { AxiosInstance } from "axios";
import crypto from "crypto";

export class CloseConnector extends BaseConnector {
  private closeApi: AxiosInstance | null = null;

  static getConfigSchema() {
    return {
      fields: [
        {
          name: "api_key",
          label: "API Key",
          type: "password",
          required: true,
          helperText: "Close API Key (generate in Close settings)",
        },
        {
          name: "api_base_url",
          label: "API Base URL",
          type: "string",
          required: false,
          default: "https://api.close.com/api/v1",
        },
      ],
    };
  }

  getMetadata() {
    return {
      name: "Close",
      version: "1.0.0",
      description: "Connector for Close CRM",
      supportedEntities: [
        "leads",
        "opportunities",
        "activities",
        "contacts",
        "users",
        "custom_fields",
      ],
    };
  }

  validateConfig() {
    const base = super.validateConfig();
    const errors = [...base.errors];

    if (!this.dataSource.config.api_key) {
      errors.push("Close API key is required");
    }

    return { valid: errors.length === 0, errors };
  }

  private getCloseClient(): AxiosInstance {
    if (!this.closeApi) {
      if (!this.dataSource.config.api_key) {
        throw new Error("Close API key not configured");
      }

      this.closeApi = axios.create({
        baseURL: "https://api.close.com/api/v1",
        auth: {
          username: this.dataSource.config.api_key,
          password: "",
        },
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
    return this.closeApi;
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

      const api = this.getCloseClient();

      // Test connection by fetching user info
      await api.get("/me/");

      return {
        success: true,
        message: "Successfully connected to Close API",
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to connect to Close API",
        details: axios.isAxiosError(error) ? error.message : String(error),
      };
    }
  }

  getAvailableEntities(): string[] {
    return [
      "leads",
      "opportunities",
      "activities",
      "contacts",
      "users",
      "custom_fields",
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

    // Special handling for custom_fields and users (non-paginated)
    if (entity === "custom_fields") {
      if (!state || state.totalProcessed === 0) {
        await this.fetchAllCustomFields(options);
        return {
          totalProcessed: -1,
          hasMore: false,
          iterationsInChunk: 1,
        };
      }
      return {
        totalProcessed: state.totalProcessed,
        hasMore: false,
        iterationsInChunk: 0,
      };
    }

    if (entity === "users") {
      return await this.fetchUsersChunk(options);
    }

    const api = this.getCloseClient();
    const batchSize = options.batchSize || this.getBatchSize();
    const rateLimitDelay = options.rateLimitDelay || this.getRateLimitDelay();

    // Initialize or restore state
    let offset = state?.offset || 0;
    let recordCount = state?.totalProcessed || 0;
    let hasMore = true;
    let iterations = 0;

    // Get total count if this is the first chunk
    let totalCount: number | undefined = state?.metadata?.totalCount;
    if (!state && onProgress) {
      totalCount = await this.fetchTotalCount(entity, since);
      if (totalCount !== undefined) {
        onProgress(0, totalCount);
      }
    }

    while (hasMore && iterations < maxIterations) {
      let response: any;
      const params: any = {
        _limit: batchSize,
        _skip: offset,
        _order_by: "id", // Add consistent ordering for pagination stability
      };

      try {
        let endpoint: string;
        switch (entity) {
          case "leads":
            endpoint = "/lead/";
            break;
          case "opportunities":
            endpoint = "/opportunity/";
            break;
          case "activities":
            endpoint = "/activity/";
            break;
          case "contacts":
            endpoint = "/contact/";
            break;
          default:
            throw new Error(`Unsupported entity: ${entity}`);
        }

        // For incremental sync, use POST with query in body
        if (since) {
          const dateFilter = since.toISOString().split("T")[0];
          const postData = {
            _params: {
              _limit: batchSize,
              _skip: offset,
              _order_by: "-date_updated",
              query: `date_updated>="${dateFilter}"`,
            },
          };

          response = await api.post(endpoint, postData, {
            headers: {
              "x-http-method-override": "GET",
            },
          });
        } else {
          response = await api.get(endpoint, { params });
        }

        const data = response.data.data || [];

        if (data.length > 0) {
          await onBatch(data);
          recordCount += data.length;

          if (onProgress) {
            onProgress(recordCount, totalCount);
          }
        }

        hasMore = response.data.has_more || false;

        if (hasMore) {
          offset += batchSize;
          iterations++;

          // Rate limiting
          await this.sleep(rateLimitDelay);
        } else {
          // No more data
          break;
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          const retryAfter = parseInt(
            error.response.headers["retry-after"] || "60",
          );
          console.warn(`Rate limited. Waiting ${retryAfter} seconds...`);
          await this.sleep(retryAfter * 1000);
          // Don't increment iterations for rate limit retries
        } else {
          throw error;
        }
      }
    }

    return {
      offset,
      totalProcessed: recordCount,
      hasMore,
      iterationsInChunk: iterations,
      metadata: { totalCount },
    };
  }

  private async fetchUsersChunk(
    options: ResumableFetchOptions,
  ): Promise<FetchState> {
    const { onBatch, onProgress, state } = options;
    const api = this.getCloseClient();
    const batchSize = options.batchSize || this.getBatchSize();
    const rateLimitDelay = options.rateLimitDelay || this.getRateLimitDelay();
    const maxIterations = options.maxIterations || 10;

    let offset = state?.offset || 0;
    let recordCount = state?.totalProcessed || 0;
    let hasMore = true;
    let iterations = 0;

    let totalCount: number | undefined = state?.metadata?.totalCount;
    if (!state && onProgress) {
      try {
        const countResponse = await api.get("/user/", {
          params: { _limit: 0 },
        });
        totalCount = countResponse.data.total_results;
        onProgress(0, totalCount);
      } catch (error) {
        console.warn("Could not fetch total count for users:", error);
      }
    }

    while (hasMore && iterations < maxIterations) {
      try {
        const params = {
          _limit: batchSize,
          _skip: offset,
          // Note: /user/ endpoint doesn't support _order_by parameter
        };

        const response = await api.get("/user/", { params });
        const data = response.data.data || [];

        if (data.length > 0) {
          await onBatch(data);
          recordCount += data.length;

          if (onProgress) {
            onProgress(recordCount, totalCount);
          }
        }

        hasMore = response.data.has_more || false;

        if (hasMore) {
          offset += batchSize;
          iterations++;
          await this.sleep(rateLimitDelay);
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          const retryAfter = parseInt(
            error.response.headers["retry-after"] || "60",
          );
          console.warn(`Rate limited. Waiting ${retryAfter} seconds...`);
          await this.sleep(retryAfter * 1000);
        } else {
          throw error;
        }
      }
    }

    return {
      offset,
      totalProcessed: recordCount,
      hasMore,
      iterationsInChunk: iterations,
      metadata: { totalCount },
    };
  }

  async fetchEntity(options: FetchOptions): Promise<void> {
    const { entity, onBatch, onProgress, since } = options;

    // Special handling for custom_fields
    if (entity === "custom_fields") {
      await this.fetchAllCustomFields(options);
      return;
    }

    // Special handling for users - always do full sync
    if (entity === "users") {
      await this.fetchAllUsers(options);
      return;
    }

    const api = this.getCloseClient();
    const batchSize = options.batchSize || this.getBatchSize();
    const rateLimitDelay = options.rateLimitDelay || this.getRateLimitDelay();

    let hasMore = true;
    let offset = 0;
    let recordCount = 0;
    let totalCount: number | undefined;

    // Try to get total count first for better progress reporting
    if (onProgress) {
      totalCount = await this.fetchTotalCount(entity, since);
      if (totalCount !== undefined) {
        onProgress(0, totalCount);
      }
    }

    while (hasMore) {
      let response: any;
      const params: any = {
        _limit: batchSize,
        _skip: offset,
        _order_by: "id", // Add consistent ordering for pagination stability
      };

      // Fetch data based on entity type
      try {
        let endpoint: string;
        switch (entity) {
          case "leads":
            endpoint = "/lead/";
            break;
          case "opportunities":
            endpoint = "/opportunity/";
            break;
          case "activities":
            endpoint = "/activity/";
            break;
          case "contacts":
            endpoint = "/contact/";
            break;
          case "users":
            endpoint = "/user/";
            break;
          default:
            throw new Error(`Unsupported entity: ${entity}`);
        }

        // For incremental sync, use POST with query in body (Close API requirement)
        if (since) {
          const dateFilter = since.toISOString().split("T")[0]; // Format as YYYY-MM-DD
          const postData = {
            _params: {
              _limit: batchSize,
              _skip: offset,
              _order_by: "-date_updated",
              query: `date_updated>="${dateFilter}"`,
            },
          };

          response = await api.post(endpoint, postData, {
            headers: {
              "x-http-method-override": "GET",
            },
          });
        } else {
          // Regular GET request for full sync
          response = await api.get(endpoint, { params });
        }

        const data = response.data.data || [];

        // Pass batch to callback
        if (data.length > 0) {
          await onBatch(data);
          recordCount += data.length;

          if (onProgress) {
            onProgress(recordCount, totalCount);
          }
        }

        // Check for more pages
        hasMore = response.data.has_more || false;

        if (hasMore) {
          offset += batchSize;

          // Rate limiting
          await this.sleep(rateLimitDelay);
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          // Handle rate limiting
          const retryAfter = parseInt(
            error.response.headers["retry-after"] || "60",
          );
          console.warn(`Rate limited. Waiting ${retryAfter} seconds...`);
          await this.sleep(retryAfter * 1000);
          // Don't increment offset, retry the same page
        } else {
          throw error;
        }
      }
    }
  }

  private async fetchAllCustomFields(options: FetchOptions): Promise<void> {
    const { onBatch, onProgress } = options;
    const api = this.getCloseClient();

    // Custom field endpoints to fetch from
    const customFieldEndpoints = [
      { endpoint: "/custom_field/lead/", type: "lead" },
      { endpoint: "/custom_field/contact/", type: "contact" },
      { endpoint: "/custom_field/opportunity/", type: "opportunity" },
      { endpoint: "/custom_field/shared/", type: "shared" },
    ];

    let totalFields = 0;
    let processedFields = 0;

    // First, get total count
    if (onProgress) {
      for (const { endpoint } of customFieldEndpoints) {
        try {
          const response = await api.get(endpoint, { params: { _limit: 0 } });
          totalFields += response.data.total_results || 0;
        } catch (error) {
          // Skip if endpoint doesn't exist or errors
          console.warn(`Could not fetch count from ${endpoint}:`, error);
        }
      }
      onProgress(0, totalFields);
    }

    // Fetch from each custom field endpoint
    for (const { endpoint, type } of customFieldEndpoints) {
      try {
        const response = await api.get(endpoint);
        const fields = response.data.data || [];

        // Add type information to each field
        const fieldsWithType = fields.map((field: any) => ({
          ...field,
          custom_field_type: type,
        }));

        if (fieldsWithType.length > 0) {
          await onBatch(fieldsWithType);
          processedFields += fieldsWithType.length;

          if (onProgress) {
            onProgress(processedFields, totalFields);
          }
        }
      } catch (error) {
        // Log but continue with other endpoints
        console.warn(`Error fetching from ${endpoint}:`, error);
      }
    }
  }

  private async fetchAllUsers(options: FetchOptions): Promise<void> {
    const { onBatch, onProgress } = options;
    const api = this.getCloseClient();
    const batchSize = options.batchSize || this.getBatchSize();
    const rateLimitDelay = options.rateLimitDelay || this.getRateLimitDelay();

    let hasMore = true;
    let offset = 0;
    let recordCount = 0;
    let totalCount: number | undefined;

    // Try to get total count first for better progress reporting
    if (onProgress) {
      try {
        const countResponse = await api.get("/user/", {
          params: { _limit: 0 },
        });
        totalCount = countResponse.data.total_results;
        onProgress(0, totalCount);
      } catch (error) {
        console.warn("Could not fetch total count for users:", error);
      }
    }

    while (hasMore) {
      try {
        const params = {
          _limit: batchSize,
          _skip: offset,
          // Note: /user/ endpoint doesn't support _order_by parameter
        };

        const response = await api.get("/user/", { params });
        const data = response.data.data || [];

        // Pass batch to callback
        if (data.length > 0) {
          await onBatch(data);
          recordCount += data.length;

          if (onProgress) {
            onProgress(recordCount, totalCount);
          }
        }

        // Check for more pages
        hasMore = response.data.has_more || false;

        if (hasMore) {
          offset += batchSize;

          // Rate limiting
          await this.sleep(rateLimitDelay);
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          // Handle rate limiting
          const retryAfter = parseInt(
            error.response.headers["retry-after"] || "60",
          );
          console.warn(`Rate limited. Waiting ${retryAfter} seconds...`);
          await this.sleep(retryAfter * 1000);
          // Don't increment offset, retry the same page
        } else {
          throw error;
        }
      }
    }
  }

  private async fetchTotalCount(
    entity: string,
    since?: Date,
  ): Promise<number | undefined> {
    try {
      const api = this.getCloseClient();

      // Special handling for custom_fields
      if (entity === "custom_fields") {
        const customFieldEndpoints = [
          "/custom_field/lead/",
          "/custom_field/contact/",
          "/custom_field/opportunity/",
          "/custom_field/shared/",
        ];

        let totalCount = 0;
        for (const endpoint of customFieldEndpoints) {
          try {
            const response = await api.get(endpoint, { params: { _limit: 0 } });
            totalCount += response.data.total_results || 0;
          } catch (error) {
            // Skip if endpoint doesn't exist
            console.warn(`Could not fetch count from ${endpoint}:`, error);
          }
        }
        return totalCount > 0 ? totalCount : undefined;
      }

      let endpoint: string;
      switch (entity) {
        case "leads":
          endpoint = "/lead/";
          break;
        case "opportunities":
          endpoint = "/opportunity/";
          break;
        case "activities":
          endpoint = "/activity/";
          break;
        case "contacts":
          endpoint = "/contact/";
          break;
        case "users":
          endpoint = "/user/";
          break;
        default:
          return undefined;
      }

      let response: any;

      // For incremental sync with date filter, use POST request
      if (since) {
        const dateFilter = since.toISOString().split("T")[0]; // Format as YYYY-MM-DD
        const postData = {
          _params: {
            _limit: 0,
            _fields: "id",
            query: `date_updated>="${dateFilter}"`,
          },
        };

        response = await api.post(endpoint, postData, {
          headers: {
            "x-http-method-override": "GET",
          },
        });
      } else {
        // Regular GET request for full sync
        const params = {
          _limit: 0,
          _fields: "id",
        };
        response = await api.get(endpoint, { params });
      }

      // Close API returns total_results in the response
      return response.data.total_results || undefined;
    } catch (error) {
      console.warn(`Could not fetch total count for ${entity}:`, error);
      return undefined;
    }
  }

  /**
   * Check if connector supports webhooks
   */
  supportsWebhooks(): boolean {
    return true;
  }

  /**
   * Verify webhook signature and parse event
   */
  async verifyWebhook(
    options: WebhookHandlerOptions,
  ): Promise<WebhookVerificationResult> {
    const { payload, headers, secret } = options;

    const signature = headers["close-signature"];
    if (!signature || typeof signature !== "string") {
      return {
        valid: false,
        error: "Missing close-signature header",
      };
    }

    if (!secret) {
      return {
        valid: false,
        error: "Missing webhook secret",
      };
    }

    try {
      // Close.io uses HMAC-SHA256 signature
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(typeof payload === "string" ? payload : JSON.stringify(payload))
        .digest("hex");

      if (signature !== expectedSignature) {
        return {
          valid: false,
          error: "Invalid signature",
        };
      }

      // Parse the event from the payload
      const event = typeof payload === "string" ? JSON.parse(payload) : payload;

      return {
        valid: true,
        event,
      };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Failed to verify webhook",
      };
    }
  }

  /**
   * Get webhook event mapping
   */
  getWebhookEventMapping(eventType: string): WebhookEventMapping | null {
    const mappings: Record<string, WebhookEventMapping> = {
      // Leads
      "lead.created": { entity: "leads", operation: "upsert" },
      "lead.updated": { entity: "leads", operation: "upsert" },
      "lead.deleted": { entity: "leads", operation: "delete" },

      // Contacts
      "contact.created": { entity: "contacts", operation: "upsert" },
      "contact.updated": { entity: "contacts", operation: "upsert" },
      "contact.deleted": { entity: "contacts", operation: "delete" },

      // Opportunities
      "opportunity.created": { entity: "opportunities", operation: "upsert" },
      "opportunity.updated": { entity: "opportunities", operation: "upsert" },
      "opportunity.deleted": { entity: "opportunities", operation: "delete" },

      // Activities
      "activity.created": { entity: "activities", operation: "upsert" },
      "activity.updated": { entity: "activities", operation: "upsert" },
      "activity.deleted": { entity: "activities", operation: "delete" },
    };

    return mappings[eventType] || null;
  }

  /**
   * Get supported webhook event types
   */
  getSupportedWebhookEvents(): string[] {
    return [
      // Leads
      "lead.created",
      "lead.updated",
      "lead.deleted",
      // Contacts
      "contact.created",
      "contact.updated",
      "contact.deleted",
      // Opportunities
      "opportunity.created",
      "opportunity.updated",
      "opportunity.deleted",
      // Activities
      "activity.created",
      "activity.updated",
      "activity.deleted",
    ];
  }

  /**
   * Extract entity data from webhook event
   */
  extractWebhookData(event: any): { id: string; data: any } | null {
    if (!event || !event.data) {
      return null;
    }

    // Close.io webhook structure has data at the root level
    const data = event.data || event;
    return {
      id: data.id,
      data: data,
    };
  }
}
