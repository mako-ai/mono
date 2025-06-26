import {
  BaseConnector,
  ConnectionTestResult,
  SyncOptions,
} from "../base/BaseConnector";
import { StripeSyncService } from "./StripeSyncService";
import Stripe from "stripe";

export class StripeConnector extends BaseConnector {
  private stripe: Stripe | null = null;
  private syncService: StripeSyncService | null = null;

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

  private getSyncService(): StripeSyncService {
    if (!this.syncService) {
      this.syncService = new StripeSyncService(this.dataSource);
    }
    return this.syncService;
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

      const syncService = this.getSyncService();
      return await syncService.testConnection();
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
    const useStaging = syncMode !== "incremental";

    // Use the generic syncEntity method
    await syncService.syncEntity(entity, targetDatabase, progress, useStaging);
  }
}
