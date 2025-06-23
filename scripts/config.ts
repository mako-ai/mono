#!/usr/bin/env ts-node

import { dataSourceManager } from "../sync/data-source-manager";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Display usage information
function showUsage() {
  console.log(`
Usage: pnpm run config <command> [options]

Commands:
  validate    - Validate the configuration file
  show        - Show the current configuration
  list        - List all data sources
  show <id>   - Show details of a specific data source

Examples:
  pnpm run config validate
  pnpm run config list
  pnpm run config show close_switzerland
`);
}

// Validate configuration
function validateConfig() {
  console.log("Validating configuration...");

  try {
    const validation = dataSourceManager.validateConfig();

    if (validation.valid) {
      console.log("✅ Configuration is valid!");
      console.log("");

      // Show some stats
      const dataSources = dataSourceManager.getActiveDataSources();
      const totalSources = dataSourceManager.listDataSourceIds().length;
      const activeSources = dataSources.length;

      console.log(`Total data sources: ${totalSources}`);
      console.log(`Active data sources: ${activeSources}`);
      console.log(`Inactive data sources: ${totalSources - activeSources}`);
    } else {
      console.error("❌ Configuration validation failed:");
      validation.errors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Failed to validate configuration:", error);
    process.exit(1);
  }
}

// Show full configuration
function showConfig() {
  try {
    const config = dataSourceManager.loadConfig();
    console.log(JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("❌ Failed to load configuration:", error);
    process.exit(1);
  }
}

// List all data sources
function listDataSources() {
  try {
    const activeDataSources = dataSourceManager.getActiveDataSources();

    console.log("Active data sources:");
    activeDataSources.forEach(source => {
      console.log(`  ${source.id}:`);
      console.log(`    Name: ${source.name}`);
      console.log(`    Type: ${source.type}`);
      console.log(`    Description: ${source.description || "N/A"}`);

      if (source.type === "mongodb") {
        console.log(`    Database: ${source.connection.database}`);
      } else {
        console.log(`    API: ${source.connection.api_base_url || "Default"}`);
      }

      console.log(`    Batch Size: ${source.settings.sync_batch_size}`);
      console.log(`    Rate Limit: ${source.settings.rate_limit_delay_ms}ms`);
      console.log("");
    });

    // Also show inactive sources
    const allSourceIds = dataSourceManager.listDataSourceIds();
    const inactiveSourceIds = allSourceIds.filter(
      id => !activeDataSources.find(s => s.id === id),
    );

    if (inactiveSourceIds.length > 0) {
      console.log("Inactive data sources:");
      inactiveSourceIds.forEach(id => {
        const source = dataSourceManager.getDataSource(id);
        if (source) {
          console.log(`  ${id}: ${source.name} (${source.type})`);
        }
      });
    }
  } catch (error) {
    console.error("❌ Failed to list data sources:", error);
    process.exit(1);
  }
}

// Show specific data source
function showDataSource(sourceId: string) {
  if (!sourceId) {
    console.error("❌ Please specify a data source ID");
    process.exit(1);
  }

  try {
    const source = dataSourceManager.getDataSource(sourceId);

    if (!source) {
      console.error(`❌ Data source '${sourceId}' not found`);
      process.exit(1);
    }

    console.log(`Data Source: ${source.id}`);
    console.log(`Name: ${source.name}`);
    console.log(`Type: ${source.type}`);
    console.log(`Description: ${source.description || "N/A"}`);
    console.log(`Active: ${source.active}`);
    console.log("");

    console.log("Connection:");
    Object.entries(source.connection).forEach(([key, value]) => {
      if (key === "api_key") {
        console.log(`  ${key}: ${value ? "***" + value.slice(-4) : "Not set"}`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });

    console.log("");
    console.log("Settings:");
    Object.entries(source.settings).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
  } catch (error) {
    console.error("❌ Failed to show data source:", error);
    process.exit(1);
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showUsage();
    process.exit(0);
  }

  const command = args[0];
  const param = args[1];

  switch (command) {
    case "validate":
      validateConfig();
      break;
    case "show":
      if (param) {
        showDataSource(param);
      } else {
        showConfig();
      }
      break;
    case "list":
      listDataSources();
      break;
    default:
      console.error(`❌ Unknown command: ${command}`);
      showUsage();
      process.exit(1);
  }
}

// Execute
main();
