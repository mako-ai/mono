#!/usr/bin/env node
/*
 Ensures database-data-source-manager stays connector-agnostic.
 Fails if the file defines CONNECTOR_SCHEMAS or hardcodes connector type names.
*/
const fs = require("fs");
const path = require("path");

const file = path.join(
  __dirname,
  "..",
  "api",
  "src",
  "sync",
  "database-data-source-manager.ts",
);

const src = fs.readFileSync(file, "utf8");

const bannedPatterns = [
  /const\s+CONNECTOR_SCHEMAS\s*=/,
  /graphql\s*:/,
  /stripe\s*:/,
  /close\s*:/,
  /mongodb\s*:/,
  /rest\s*:/,
];

const violations = bannedPatterns.filter(re => re.test(src));

if (violations.length > 0) {
  console.error(
    "❌ Connector-agnosticism check failed for database-data-source-manager.ts",
  );
  violations.forEach(v => console.error("  Matched pattern:", v.toString()));
  process.exit(1);
}

console.log("✅ Connector-agnosticism check passed");
