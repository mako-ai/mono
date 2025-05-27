import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

export interface TenantSource {
  api_key: string;
  api_base_url?: string;
  enabled: boolean;
}

export interface TenantSources {
  close?: TenantSource;
  stripe?: TenantSource;
  [key: string]: TenantSource | undefined;
}

export interface TenantSettings {
  sync_batch_size?: number;
  rate_limit_delay_ms?: number;
  timezone?: string;
  [key: string]: any;
}

export interface TenantConfig {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  sources: TenantSources;
  settings: TenantSettings;
}

export interface GlobalConfig {
  max_retries: number;
  mongodb: {
    database: string;
    connection_string: string;
  };
  logging: {
    level: string;
    include_api_responses: boolean;
  };
}

export interface ConfigFile {
  tenants: { [key: string]: Omit<TenantConfig, "id"> };
  global: GlobalConfig;
}

class TenantManager {
  private config: ConfigFile | null = null;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath =
      configPath || path.join(process.cwd(), "config", "tenants.yaml");
  }

  /**
   * Load and parse the tenant configuration file
   */
  loadConfig(): ConfigFile {
    if (this.config) {
      return this.config as ConfigFile;
    }

    try {
      if (!fs.existsSync(this.configPath)) {
        throw new Error(
          `Tenant configuration file not found: ${this.configPath}`
        );
      }

      const fileContents = fs.readFileSync(this.configPath, "utf8");
      const rawConfig = yaml.load(fileContents) as ConfigFile;

      // Process environment variable substitution
      this.config = this.processEnvironmentVariables(rawConfig);

      return this.config as ConfigFile;
    } catch (error) {
      throw new Error(`Failed to load tenant configuration: ${error}`);
    }
  }

  /**
   * Get all active tenants
   */
  getActiveTenants(): TenantConfig[] {
    const config = this.loadConfig();

    return Object.entries(config.tenants)
      .filter(([_, tenant]) => tenant.active)
      .map(([id, tenant]) => ({
        id,
        ...tenant,
        // Merge global settings with tenant-specific settings
        settings: {
          ...this.getDefaultSettings(),
          ...tenant.settings,
        },
      }));
  }

  /**
   * Get a specific tenant by ID
   */
  getTenant(tenantId: string): TenantConfig | null {
    const config = this.loadConfig();

    if (!config.tenants[tenantId]) {
      return null;
    }

    const tenant = config.tenants[tenantId];

    return {
      id: tenantId,
      ...tenant,
      settings: {
        ...this.getDefaultSettings(),
        ...tenant.settings,
      },
    };
  }

  /**
   * Get tenants that have a specific source enabled
   */
  getTenantsWithSource(sourceName: string): TenantConfig[] {
    return this.getActiveTenants().filter(
      (tenant) => tenant.sources[sourceName]?.enabled === true
    );
  }

  /**
   * Get global configuration
   */
  getGlobalConfig(): GlobalConfig {
    const config = this.loadConfig();
    return config.global;
  }

  /**
   * List all tenant IDs
   */
  listTenantIds(): string[] {
    const config = this.loadConfig();
    return Object.keys(config.tenants);
  }

  /**
   * List active tenant IDs
   */
  listActiveTenantIds(): string[] {
    return this.getActiveTenants().map((t) => t.id);
  }

  /**
   * Validate tenant configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const config = this.loadConfig();

      // Validate global config
      if (!config.global) {
        errors.push("Global configuration is missing");
      }

      // Validate tenants
      if (!config.tenants || Object.keys(config.tenants).length === 0) {
        errors.push("No tenants configured");
      }

      // Validate each tenant
      Object.entries(config.tenants).forEach(([id, tenant]) => {
        if (!tenant.name) {
          errors.push(`Tenant '${id}' is missing a name`);
        }

        if (!tenant.sources || Object.keys(tenant.sources).length === 0) {
          errors.push(`Tenant '${id}' has no sources configured`);
        }

        // Validate sources
        Object.entries(tenant.sources).forEach(([sourceName, source]) => {
          if (source?.enabled && !source.api_key) {
            errors.push(
              `Tenant '${id}' source '${sourceName}' is enabled but missing api_key`
            );
          }
        });
      });

      return { valid: errors.length === 0, errors };
    } catch (error) {
      errors.push(`Configuration validation failed: ${error}`);
      return { valid: false, errors };
    }
  }

  /**
   * Process environment variable substitution in configuration
   */
  private processEnvironmentVariables(config: any): any {
    const processed = JSON.parse(JSON.stringify(config));

    const replaceEnvVars = (obj: any): any => {
      if (typeof obj === "string") {
        // Replace ${VAR_NAME} with environment variable values
        return obj.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
          const value = process.env[envVar];
          if (value === undefined) {
            console.warn(
              `Environment variable ${envVar} is not set, using empty string`
            );
            return "";
          }
          return value;
        });
      } else if (Array.isArray(obj)) {
        return obj.map(replaceEnvVars);
      } else if (obj && typeof obj === "object") {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = replaceEnvVars(value);
        }
        return result;
      }
      return obj;
    };

    return replaceEnvVars(processed);
  }

  /**
   * Get default settings merged from global config
   */
  private getDefaultSettings(): TenantSettings {
    const global = this.getGlobalConfig();

    return {
      sync_batch_size: 100,
      rate_limit_delay_ms: 200,
      timezone: "UTC",
      max_retries: global.max_retries,
    };
  }
}

// Export singleton instance
export const tenantManager = new TenantManager();

// Export class for custom instances
export { TenantManager };
