# SyncJob Type Field Migration

## Overview

This migration adds the mandatory `type` field to all existing sync jobs in the database. The `type` field can be either `"scheduled"` or `"webhook"`.

## Changes Made

### 1. Schema Updates

- Made `type` field required in `ISyncJob` interface
- Made `type` field required in `SyncJobSchema` (removed default value)

### 2. Query Updates

- Changed scheduler query from `{ $ne: "webhook" }` to `{ type: "scheduled" }`
- This ensures only explicitly scheduled jobs are picked up by the cron scheduler

## Migration Command

Run this single command in your MongoDB shell or client:

```javascript
db.syncjobs.updateMany(
  { type: { $exists: false } },
  { $set: { type: "scheduled" } },
);
```

This will:

- Find all sync jobs without a `type` field
- Set their type to `"scheduled"` (since all existing jobs before webhooks were scheduled jobs)

## Verify the Migration

Check the results:

```javascript
// Count jobs by type
db.syncjobs.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }]);

// Verify no jobs without type
db.syncjobs.countDocuments({ type: { $exists: false } });
```

## Rollback

If needed, you can remove the type field from all jobs:

```javascript
db.syncjobs.updateMany({}, { $unset: { type: "" } });
```

## Post-Migration

After migration:

1. The scheduler will only pick up jobs with `type: "scheduled"`
2. All new jobs must specify a type (no default value)
3. Webhook jobs will be completely ignored by the cron scheduler
