import {
  BaseConnector,
  ConnectionTestResult,
  SyncOptions,
} from "../base/BaseConnector";
import { MongoClient } from "mongodb";
import axios, { AxiosInstance } from "axios";

// Simple object path getter function
function get(obj: any, path: string, defaultValue?: any): any {
  const keys = path.split(".");
  let result = obj;

  for (const key of keys) {
    if (result && typeof result === "object" && key in result) {
      result = result[key];
    } else {
      return defaultValue;
    }
  }

  return result;
}

export class GraphQLConnector extends BaseConnector {
  private graphqlClient: AxiosInstance | null = null;

  static getConfigSchema() {
    return {
      fields: [
        {
          name: "endpoint",
          label: "GraphQL Endpoint URL",
          type: "string",
          required: true,
          placeholder: "https://api.example.com/graphql",
          helperText: "The GraphQL endpoint URL (not encrypted)",
        },
        {
          name: "headers",
          label: "Custom Headers (JSON)",
          type: "textarea",
          required: false,
          rows: 6,
          encrypted: true,
          placeholder: `{
  "Authorization": "Bearer your-token-here",
  "X-API-Key": "your-api-key",
  "x-hasura-admin-secret": "your-hasura-secret",
  "X-Custom-Header": "custom-value"
}`,
          helperText:
            "Authentication and custom headers as JSON (encrypted when saved)",
        },
        // GraphQL Query
        {
          name: "query",
          label: "GraphQL Query",
          type: "textarea",
          required: true,
          rows: 12,
          placeholder: `query GetData($limit: Int!, $offset: Int!) {
  items(limit: $limit, offset: $offset) {
    id
    name
    created_at
  }
  items_aggregate {
    aggregate {
      count
    }
  }
}`,
          helperText: "Your GraphQL query with pagination support",
        },
        {
          name: "query_name",
          label: "Query Name",
          type: "string",
          required: true,
          placeholder: "items",
          helperText: "Name for this query (used for collection naming)",
        },
        {
          name: "data_path",
          label: "Data Path",
          type: "string",
          required: true,
          placeholder: "data.items",
          helperText: "JSONPath to the data array in the response",
        },
        {
          name: "total_count_path",
          label: "Total Count Path",
          type: "string",
          required: false,
          placeholder: "data.items_aggregate.aggregate.count",
          helperText: "JSONPath to total count (for progress tracking)",
        },
        // Pagination configuration
        {
          name: "has_next_page_path",
          label: "Has Next Page Path",
          type: "string",
          required: false,
          placeholder: "data.items.pageInfo.hasNextPage",
          helperText: "JSONPath for cursor-based pagination (optional)",
        },
        {
          name: "cursor_path",
          label: "Cursor Path",
          type: "string",
          required: false,
          placeholder: "data.items.pageInfo.endCursor",
          helperText: "JSONPath for next cursor value (optional)",
        },
        {
          name: "batch_size",
          label: "Batch Size",
          type: "number",
          required: false,
          default: 100,
          placeholder: "100",
          helperText: "Number of records per request (uses $limit variable)",
        },
      ],
    };
  }

  getMetadata() {
    return {
      name: "GraphQL",
      version: "1.0.0",
      description: "Generic GraphQL API connector",
      supportedEntities: this.getAvailableEntities(),
    };
  }

  validateConfig() {
    const base = super.validateConfig();
    const errors = [...base.errors];

    if (!this.dataSource.config.endpoint) {
      errors.push("GraphQL endpoint is required");
    }

    // Check if using new form-based config or legacy config
    const hasFormConfig =
      this.dataSource.config.query && this.dataSource.config.query_name;
    const hasLegacyConfig =
      this.dataSource.config.queries &&
      this.dataSource.config.queries.length > 0;

    if (!hasFormConfig && !hasLegacyConfig) {
      errors.push(
        "Either GraphQL query (new format) or queries array (legacy) must be configured",
      );
    }

    // Validate new form-based config
    if (hasFormConfig) {
      if (!this.dataSource.config.query_name) {
        errors.push("Query name is required");
      }
      if (!this.dataSource.config.data_path) {
        errors.push("Data path is required");
      }

      // Validate headers JSON if provided
      if (
        this.dataSource.config.headers &&
        typeof this.dataSource.config.headers === "string"
      ) {
        try {
          JSON.parse(this.dataSource.config.headers);
        } catch {
          errors.push("Headers must be valid JSON format");
        }
      }
    }

    // Validate legacy queries array
    if (hasLegacyConfig && this.dataSource.config.queries) {
      this.dataSource.config.queries.forEach((query: any, index: number) => {
        if (!query.name) {
          errors.push(`Query ${index + 1} is missing a name`);
        }
        if (!query.query) {
          errors.push(`Query ${index + 1} is missing the GraphQL query`);
        }
      });
    }

    return { valid: errors.length === 0, errors };
  }

  private getGraphQLClient(): AxiosInstance {
    if (!this.graphqlClient) {
      if (!this.dataSource.config.endpoint) {
        throw new Error("GraphQL endpoint not configured");
      }

      // Build headers from JSON field
      const headers: { [key: string]: string } = {
        "Content-Type": "application/json",
      };

      // Parse headers from JSON string if provided
      if (this.dataSource.config.headers) {
        try {
          let parsedHeaders: any;

          if (typeof this.dataSource.config.headers === "string") {
            // Parse JSON string
            parsedHeaders = JSON.parse(this.dataSource.config.headers);
          } else if (typeof this.dataSource.config.headers === "object") {
            // Already an object (legacy format)
            parsedHeaders = this.dataSource.config.headers;
          }

          if (parsedHeaders && typeof parsedHeaders === "object") {
            Object.assign(headers, parsedHeaders);
          }
        } catch (error) {
          console.warn("Failed to parse headers JSON:", error);
          throw new Error("Invalid JSON format in headers field");
        }
      }

      this.graphqlClient = axios.create({
        baseURL: this.dataSource.config.endpoint,
        headers,
      });
    }
    return this.graphqlClient;
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

      const client = this.getGraphQLClient();

      // Test connection with introspection query
      const response = await client.post("", {
        query: `
          query {
            __schema {
              queryType {
                name
              }
            }
          }
        `,
      });

      if (response.data.errors) {
        return {
          success: false,
          message: "GraphQL endpoint returned errors",
          details: response.data.errors,
        };
      }

      return {
        success: true,
        message: "Successfully connected to GraphQL endpoint",
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to connect to GraphQL endpoint",
        details: axios.isAxiosError(error) ? error.message : String(error),
      };
    }
  }

  getAvailableEntities(): string[] {
    // Handle new form-based config
    if (this.dataSource.config.query && this.dataSource.config.query_name) {
      return [this.dataSource.config.query_name];
    }

    // Handle legacy queries array
    if (!this.dataSource.config.queries) {
      return [];
    }
    return this.dataSource.config.queries.map((q: any) => q.name);
  }

  async syncAll(options: SyncOptions): Promise<void> {
    // Handle new form-based config
    if (this.dataSource.config.query && this.dataSource.config.query_name) {
      await this.syncEntity(this.dataSource.config.query_name, options);
      return;
    }

    // Handle legacy queries array
    if (
      !this.dataSource.config.queries ||
      this.dataSource.config.queries.length === 0
    ) {
      throw new Error("No queries configured");
    }

    for (const queryConfig of this.dataSource.config.queries) {
      await this.syncEntity(queryConfig.name, options);
    }
  }

  async syncEntity(entity: string, options: SyncOptions): Promise<void> {
    const { targetDatabase, progress } = options;

    if (!targetDatabase) {
      throw new Error("Target database is required for sync");
    }

    let queryConfig: any;

    // Handle new form-based config
    if (
      this.dataSource.config.query &&
      this.dataSource.config.query_name &&
      this.dataSource.config.query_name.toLowerCase() === entity.toLowerCase()
    ) {
      queryConfig = {
        name: this.dataSource.config.query_name,
        query: this.dataSource.config.query,
        dataPath: this.dataSource.config.data_path,
        totalCountPath: this.dataSource.config.total_count_path,
        hasNextPagePath: this.dataSource.config.has_next_page_path,
        cursorPath: this.dataSource.config.cursor_path,
        // Add standard variables for pagination
        variables: {
          limit: this.dataSource.config.batch_size || 100,
          offset: 0,
        },
      };
    } else {
      // Handle legacy queries array
      queryConfig = this.dataSource.config.queries?.find(
        (q: any) => q.name.toLowerCase() === entity.toLowerCase(),
      );
    }

    if (!queryConfig) {
      throw new Error(`Query configuration not found for entity: ${entity}`);
    }

    await this.syncQuery(queryConfig, targetDatabase, progress);
  }

  private async syncQuery(queryConfig: any, targetDb: any, progress?: any) {
    const client = this.getGraphQLClient();
    const delay = this.getRateLimitDelay();

    const mongoClient = new MongoClient(targetDb.connection.connection_string);
    await mongoClient.connect();
    const db = mongoClient.db(targetDb.connection.database);
    const collection = db.collection(
      `graphql_${queryConfig.name.toLowerCase()}`,
    );

    try {
      let hasMore = true;
      let cursor: any = null;
      let totalSynced = 0;

      while (hasMore) {
        // Build variables with cursor if applicable
        const variables = {
          ...(queryConfig.variables || {}),
          ...(cursor && queryConfig.cursorPath ? { cursor } : {}),
        };

        // Execute GraphQL query
        const response = await client.post("", {
          query: queryConfig.query,
          variables,
        });

        if (response.data.errors) {
          throw new Error(
            `GraphQL query errors: ${JSON.stringify(response.data.errors)}`,
          );
        }

        // Extract data from response using configured path
        const data = queryConfig.dataPath
          ? get(response.data.data, queryConfig.dataPath)
          : response.data.data;

        if (!Array.isArray(data)) {
          throw new Error(
            "Query result is not an array. Check your dataPath configuration.",
          );
        }

        if (data.length > 0) {
          const documents = data.map((item: any) => ({
            ...item,
            _syncedAt: new Date(),
            _dataSourceId: this.dataSource._id.toString(),
          }));

          // Use a unique field if specified, otherwise use the whole document for matching
          const uniqueField = queryConfig.uniqueField || "id";

          await collection.bulkWrite(
            documents.map((doc: any) => ({
              replaceOne: {
                filter:
                  uniqueField && doc[uniqueField]
                    ? { [uniqueField]: doc[uniqueField] }
                    : doc,
                replacement: doc,
                upsert: true,
              },
            })),
          );

          totalSynced += documents.length;
          if (progress) {
            progress.reportBatch(documents.length);
          }
        }

        // Check if there are more pages
        if (queryConfig.hasNextPagePath) {
          hasMore = get(response.data.data, queryConfig.hasNextPagePath, false);
        } else if (queryConfig.cursorPath && data.length > 0) {
          // Extract cursor from last item
          cursor = get(data[data.length - 1], queryConfig.cursorPath);
          hasMore = cursor !== null && cursor !== undefined;
        } else {
          // No pagination configured, assume single page
          hasMore = false;
        }

        if (hasMore) {
          await this.sleep(delay);
        }
      }

      if (progress) {
        progress.reportComplete();
      }

      console.log(`✓ Synced ${totalSynced} items from ${queryConfig.name}`);
    } finally {
      await mongoClient.close();
    }
  }
}
