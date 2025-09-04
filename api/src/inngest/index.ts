import { inngest } from "./client";
import {
  syncJobFunction,
  scheduledSyncJobFunction,
  manualSyncJobFunction,
  cancelSyncJobFunction,
  cleanupAbandonedJobsFunction,
} from "./functions/sync-job";

// Check if we're running in development mode
const isDevelopment =
  process.env.NODE_ENV !== "production" ||
  process.env.DISABLE_SCHEDULED_SYNC === "true";

// Base functions that should always be available
const baseFunctions = [
  syncJobFunction,
  manualSyncJobFunction,
  cancelSyncJobFunction,
  cleanupAbandonedJobsFunction,
];

// Conditionally add scheduled sync job function (only in production)
export const functions = isDevelopment
  ? baseFunctions
  : [...baseFunctions, scheduledSyncJobFunction];

if (isDevelopment) {
  console.log("⚠️  Scheduled sync job is DISABLED in development mode");
} else {
  console.log("✅ Scheduled sync job is ENABLED in production mode");
}

// Re-export for named imports
export { inngest };
export {
  syncJobFunction,
  scheduledSyncJobFunction,
  manualSyncJobFunction,
  cancelSyncJobFunction,
  cleanupAbandonedJobsFunction,
};
