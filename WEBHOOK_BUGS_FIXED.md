# Webhook Implementation Bug Fixes

## Bug 1: Scheduler Trying to Execute Webhook Jobs

### Issue

The scheduled sync job runner was attempting to execute webhook jobs, which don't have a `schedule.cron` field, resulting in the error:

```
ValidationError: SyncJob validation failed: schedule.cron: Path `schedule.cron` is required.
```

### Root Cause

When webhooks were added as a type of sync job, the scheduled job runner was still fetching ALL enabled jobs without filtering by type.

### Fix

Added multiple layers of filtering:

1. Query-level filtering in the scheduler to only fetch scheduled jobs
2. Safety check to skip webhook jobs in the scheduler loop
3. Prevent webhook jobs from being executed by the sync job function
4. Made execution logger handle missing schedule fields gracefully

## Bug 2: Webhook Jobs Not Appearing on Initial Load

### Issue

Webhook jobs wouldn't appear in the jobs explorer on initial page load, but would appear after clicking the refresh button.

### Root Cause

The sync job store uses Zustand persist middleware to cache data. The issue was twofold:

1. The schema had `.default("scheduled")` on the type field, which meant old persisted jobs without a type field were automatically assigned `type: "scheduled"` during validation
2. The persisted state contained stale data that was displayed on initial load

### Fix

1. **Removed the default value** from the schema to properly detect jobs missing the type field:

   ```typescript
   type: z.enum(["scheduled", "webhook"]).optional(), // Remove default to detect missing type
   ```

2. **Added stale data detection** in the init function that clears old data before refreshing:

   ```typescript
   init: async (workspaceId: string) => {
     const existingJobs = get().jobs[workspaceId];

     // Check for stale data (jobs without type field)
     if (existingJobs && existingJobs.length > 0) {
       const hasStaleData = existingJobs.some(job => job.type === undefined);
       if (hasStaleData) {
         // Clear stale data from the store before refreshing
         set(state => {
           state.jobs[workspaceId] = [];
         });
         await get().refresh(workspaceId);
         return;
       }
     }

     // If no data exists, fetch it
     if (!existingJobs || existingJobs.length === 0) {
       await get().refresh(workspaceId);
     }
   },
   ```

3. **Bumped the storage version** to force a clean slate: `name: "sync-job-store-v2"`

## Result

- Webhook jobs now appear immediately on page load with fresh data from the API
- The scheduler only processes scheduled sync jobs
- No more validation errors for missing cron expressions
- Stale cached data is properly detected and cleared
- Better separation of concerns between scheduled and webhook job types
