import { inngest } from "./client";
import {
  syncJobFunction,
  scheduledSyncJobFunction,
  manualSyncJobFunction,
  cancelSyncJobFunction,
  cleanupAbandonedJobsFunction,
} from "./functions/sync-job";

// Export all functions as an array for the serve handler
export const functions = [
  syncJobFunction,
  scheduledSyncJobFunction,
  manualSyncJobFunction,
  cancelSyncJobFunction,
  cleanupAbandonedJobsFunction,
];

// Re-export for named imports
export { inngest };
export {
  syncJobFunction,
  scheduledSyncJobFunction,
  manualSyncJobFunction,
  cancelSyncJobFunction,
  cleanupAbandonedJobsFunction,
};
