import { IDataSource } from "../../database/workspace-schema";

export interface SyncLogger {
  log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    metadata?: any,
  ): void;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: any;
}

// Callback types for streaming data
export type DataBatchCallback<T = any> = (batch: T[]) => Promise<void>;
export type ProgressCallback = (current: number, total?: number) => void;

// Options for fetching data
export interface FetchOptions {
  entity: string;
  batchSize?: number;
  onBatch: DataBatchCallback;
  onProgress?: ProgressCallback;
  since?: Date; // For incremental syncs
  rateLimitDelay?: number;
  maxRetries?: number;
}

export abstract class BaseConnector {
  protected dataSource: IDataSource;

  constructor(dataSource: IDataSource) {
    this.dataSource = dataSource;
  }

  /**
   * Test the connection to the data source
   */
  abstract testConnection(): Promise<ConnectionTestResult>;

  /**
   * Get available entities that can be fetched from this source
   */
  abstract getAvailableEntities(): string[];

  /**
   * Fetch data for a specific entity using callbacks
   * The connector should call onBatch for each batch of data fetched
   * and onProgress to report progress
   */
  abstract fetchEntity(options: FetchOptions): Promise<void>;

  /**
   * Get connector metadata
   */
  abstract getMetadata(): {
    name: string;
    version: string;
    description: string;
    author?: string;
    supportedEntities: string[];
  };

  /**
   * Validate data source configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.dataSource.name) {
      errors.push("Data source name is required");
    }

    if (!this.dataSource.type) {
      errors.push("Data source type is required");
    }

    if (!this.dataSource.config) {
      errors.push("Data source configuration is required");
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get rate limit delay from settings
   */
  protected getRateLimitDelay(): number {
    return this.dataSource.settings?.rate_limit_delay_ms || 200;
  }

  /**
   * Get batch size from settings
   */
  protected getBatchSize(): number {
    return this.dataSource.settings?.sync_batch_size || 100;
  }

  /**
   * Sleep for rate limiting
   */
  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Connector registry interface
 */
export interface ConnectorMetadata {
  type: string;
  connector: typeof BaseConnector;
  metadata: {
    name: string;
    version: string;
    description: string;
    author?: string;
    supportedEntities: string[];
  };
}
