#!/usr/bin/env ts-node

import * as dotenv from "dotenv";
import { tenantManager } from "../src/tenant-manager";

// Load environment variables from .env file
dotenv.config();

const command = process.argv[2];

switch (command) {
  case "validate":
    validateConfig();
    break;
  case "list":
    listTenants();
    break;
  case "show":
    showTenant(process.argv[3]);
    break;
  default:
    console.log("Usage: ts-node scripts/config.ts <command>");
    console.log("Commands:");
    console.log("  validate  - Validate tenant configuration");
    console.log("  list      - List active tenants");
    console.log("  show <id> - Show specific tenant configuration");
    process.exit(1);
}

function validateConfig() {
  try {
    const validation = tenantManager.validateConfig();

    if (validation.valid) {
      console.log("✅ Configuration is valid!");

      const activeTenants = tenantManager.getActiveTenants();
      console.log(`Found ${activeTenants.length} active tenant(s):`);

      activeTenants.forEach((tenant) => {
        const sources = Object.entries(tenant.sources)
          .filter(([_, source]) => source?.enabled)
          .map(([name, _]) => name);

        console.log(
          `  - ${tenant.id}: ${tenant.name} (sources: ${sources.join(", ")})`
        );
      });
    } else {
      console.log("❌ Configuration validation failed:");
      validation.errors.forEach((error) => {
        console.log(`  - ${error}`);
      });
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Failed to validate configuration:", error);
    process.exit(1);
  }
}

function listTenants() {
  try {
    const activeTenants = tenantManager.getActiveTenants();

    console.log("Active tenants:");
    activeTenants.forEach((tenant) => {
      const sources = Object.entries(tenant.sources)
        .filter(([_, source]) => source?.enabled)
        .map(([name, _]) => name);

      console.log(`  ${tenant.id}:`);
      console.log(`    Name: ${tenant.name}`);
      console.log(`    Description: ${tenant.description || "N/A"}`);
      console.log(`    Sources: ${sources.join(", ")}`);
      console.log(`    Batch Size: ${tenant.settings.sync_batch_size}`);
      console.log(`    Rate Limit: ${tenant.settings.rate_limit_delay_ms}ms`);
      console.log("");
    });
  } catch (error) {
    console.error("❌ Failed to list tenants:", error);
    process.exit(1);
  }
}

function showTenant(tenantId: string) {
  if (!tenantId) {
    console.error("❌ Please specify a tenant ID");
    process.exit(1);
  }

  try {
    const tenant = tenantManager.getTenant(tenantId);

    if (!tenant) {
      console.error(`❌ Tenant '${tenantId}' not found`);
      process.exit(1);
    }

    console.log(`Tenant: ${tenant.id}`);
    console.log(`Name: ${tenant.name}`);
    console.log(`Description: ${tenant.description || "N/A"}`);
    console.log(`Active: ${tenant.active}`);
    console.log("");

    console.log("Sources:");
    Object.entries(tenant.sources).forEach(([name, source]) => {
      console.log(`  ${name}:`);
      console.log(`    Enabled: ${source?.enabled || false}`);
      console.log(
        `    API Key: ${
          source?.api_key ? "***" + source.api_key.slice(-4) : "Not set"
        }`
      );
      console.log(`    Base URL: ${source?.api_base_url || "Default"}`);
    });

    console.log("");
    console.log("Settings:");
    Object.entries(tenant.settings).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
  } catch (error) {
    console.error("❌ Failed to show tenant:", error);
    process.exit(1);
  }
}
