import * as dotenv from "dotenv";
import { dataSourceManager } from "../src/data-source-manager";

// Load environment variables
dotenv.config();

console.log("=== Environment Variables Debug ===");
console.log("Environment variables loaded:");

// Check Stripe environment variables
const stripeKeys = Object.keys(process.env).filter(key =>
  key.includes("STRIPE"),
);
console.log("\nStripe-related environment variables:");
stripeKeys.forEach(key => {
  const value = process.env[key];
  console.log(
    `${key}: ${value ? `${value.substring(0, 10)}... (${value.length} chars)` : "NOT SET"}`,
  );
});

// Check Close environment variables
const closeKeys = Object.keys(process.env).filter(key => key.includes("CLOSE"));
console.log("\nClose-related environment variables:");
closeKeys.forEach(key => {
  const value = process.env[key];
  console.log(
    `${key}: ${value ? `${value.substring(0, 10)}... (${value.length} chars)` : "NOT SET"}`,
  );
});

console.log("\n=== Data Source Configuration ===");

// Load and validate configuration
const validation = dataSourceManager.validateConfig();
if (!validation.valid) {
  console.error("Configuration validation failed:");
  validation.errors.forEach(error => console.error(`  - ${error}`));
} else {
  console.log("Configuration is valid!");
}

// Check specific data source
const stripeSpain = dataSourceManager.getDataSource("stripe_spain");
if (stripeSpain) {
  console.log("\nstripe_spain data source:");
  console.log(`- Name: ${stripeSpain.name}`);
  console.log(`- Active: ${stripeSpain.active}`);
  console.log(
    `- API Key: ${stripeSpain.connection.api_key ? "SET" : "NOT SET"}`,
  );
  if (stripeSpain.connection.api_key) {
    console.log(
      `- API Key prefix: ${stripeSpain.connection.api_key.substring(0, 10)}...`,
    );
  }
}

// List all active data sources
console.log("\n=== Active Data Sources ===");
const activeSources = dataSourceManager.getActiveDataSources();
activeSources.forEach(source => {
  console.log(`- ${source.id} (${source.type}): ${source.name}`);
});

// List all MongoDB destinations
console.log("\n=== MongoDB Destinations ===");
const mongoDBs = dataSourceManager.listMongoDBDatabases();
mongoDBs.forEach(db => {
  console.log(`- ${db}`);
});

console.log("\n=== End Debug ===");
