import {
  BaseConnector,
  ConnectionTestResult,
  SyncOptions,
} from "../base/BaseConnector";
import { GraphQLSyncService } from "./GraphQLSyncService";
import axios, { AxiosInstance } from "axios";

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
        {
          name: "queries",
          label: "GraphQL Queries",
          type: "object_array",
          required: true,
          itemFields: [
            {
              name: "name",
              label: "Query Name",
              type: "string",
              required: true,
              placeholder: "items",
              helperText: "Name for this query (used for collection naming)",
            },
            {
              name: "query",
              label: "GraphQL Query",
              type: "textarea",
              required: true,
              rows: 12,
              placeholder:
                "query GetData($limit: Int!, $offset: Int!) {\n  items(limit: $limit, offset: $offset) {\n    id\n    name\n    created_at\n  }\n  items_aggregate {\n    aggregate {\n      count\n    }\n  }\n}",
              helperText: "Your GraphQL query with pagination support",
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
              helperText:
                "Number of records per request (uses $limit variable)",
            },
          ],
          helperText:
            "Define one or more GraphQL queries. Each query will be synced to its own MongoDB collection.",
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

    // Validate queries array (new format)
    if (
      !this.dataSource.config.queries ||
      this.dataSource.config.queries.length === 0
    ) {
      errors.push("At least one GraphQL query must be configured");
    } else {
      this.dataSource.config.queries.forEach((query: any, index: number) => {
        if (!query.name) {
          errors.push(`Query ${index + 1} is missing a name`);
        }
        if (!query.query) {
          errors.push(`Query ${index + 1} is missing the GraphQL query`);
        }
        if (!query.data_path) {
          errors.push(`Query ${index + 1} is missing the data path`);
        }
        // Validate headers JSON if provided at connector level (only once)
      });

      // Validate headers JSON if provided (at top level)
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

  private getSyncService(): GraphQLSyncService {
    return new GraphQLSyncService(this.dataSource);
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
    if (!this.dataSource.config.queries) return [];
    return this.dataSource.config.queries.map((q: any) => q.name);
  }

  async syncAll(options: SyncOptions): Promise<void> {
    const syncService = this.getSyncService();
    await syncService.syncAll({
      targetDatabase: options.targetDatabase,
      syncMode: options.syncMode,
      progress: options.progress,
    });
  }

  async syncEntity(entity: string, options: SyncOptions): Promise<void> {
    const { targetDatabase, progress, syncMode } = options;

    if (!targetDatabase) {
      throw new Error("Target database is required for sync");
    }

    const syncService = this.getSyncService();
    await syncService.syncEntity(entity, targetDatabase, progress, syncMode);
  }
}
