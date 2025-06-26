import {
  BaseConnector,
  ConnectionTestResult,
  SyncOptions,
} from "../base/BaseConnector";
import { CloseSyncService } from "./CloseSyncService";
import axios, { AxiosInstance } from "axios";

export class CloseConnector extends BaseConnector {
  private closeApi: AxiosInstance | null = null;
  private syncService: CloseSyncService | null = null;

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

  private getSyncService(): CloseSyncService {
    if (!this.syncService) {
      this.syncService = new CloseSyncService(this.dataSource);
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

  async syncAll(options: SyncOptions): Promise<void> {
    const syncService = this.getSyncService();
    await syncService.syncAll({
      targetDatabase: options.targetDatabase,
      syncMode: options.syncMode,
    });
  }

  async syncEntity(entity: string, options: SyncOptions): Promise<void> {
    const { targetDatabase, progress } = options;

    if (!targetDatabase) {
      throw new Error("Target database is required for sync");
    }

    const syncService = this.getSyncService();
    await syncService.syncEntity(
      entity,
      targetDatabase,
      progress,
      options.syncMode === "incremental",
    );
  }
}
