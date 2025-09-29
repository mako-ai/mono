# Webhook Implementation for RevOps Sync

## Overview

I've implemented a comprehensive webhook system that allows your app to receive real-time updates from Stripe and other sources. The implementation treats webhooks as a special type of sync job, leveraging your existing infrastructure while adding webhook-specific functionality.

## Architecture

### Key Components

1. **Extended Sync Job Model**

   - Added `type` field: "scheduled" or "webhook"
   - Added `webhookConfig` for webhook-specific settings
   - Webhook jobs don't require schedules

2. **Webhook Event Storage**

   - New `WebhookEvent` collection stores raw webhook events
   - Tracks processing status, attempts, and errors
   - Enables replay and debugging

3. **Webhook Processing Flow**

   ```
   Webhook → Express Endpoint → Store Event → Inngest Processing → MongoDB Update
   ```

4. **Batch Processing**
   - Groups events for efficient processing
   - Configurable batch size and wait time
   - Prevents system overload

## Features

### 1. Webhook Job Creation

- Select "Webhook Sync" as job type in the UI
- Automatic webhook URL generation
- Secure webhook secret generation
- Event type filtering with wildcards (e.g., `customer.*`)

### 2. Signature Verification

- **Stripe**: Uses Stripe SDK for signature verification
- **Close.io**: HMAC-SHA256 signature verification
- Prevents unauthorized webhook calls

### 3. Event Processing

- Maps webhook events to MongoDB operations
- Supports upsert and delete operations
- Adds `_sync_metadata` to track webhook updates

### 4. Monitoring & Debugging

- Webhook stats dashboard showing:
  - Total events received
  - Events today
  - Success rate
  - Recent events list
- Event details viewer with raw payload
- Failed event retry capability

### 5. Idempotency

- Uses event IDs to prevent duplicate processing
- Handles out-of-order events
- "At-least-once" delivery guarantee

## Supported Events

### Stripe Events

- **Customers**: created, updated, deleted
- **Subscriptions**: created, updated, deleted
- **Charges**: succeeded, failed, refunded, etc.
- **Invoices**: created, finalized, paid, etc.
- **Products/Prices**: created, updated, deleted

### Close.io Events

- **Leads**: created, updated, deleted
- **Contacts**: created, updated, deleted
- **Opportunities**: created, updated, deleted
- **Activities**: created, updated, deleted

## Usage

### 1. Create a Webhook Sync Job

1. Go to Transfers
2. Click "Add Sync Job"
3. Select "Webhook Sync" as the job type
4. Choose your data source (Stripe/Close)
5. Choose destination database
6. Configure event types (optional)
7. Save the job

### 2. Configure Webhook in Provider

After creating the job:

1. Copy the generated webhook URL
2. Copy the webhook secret
3. Go to your provider's webhook settings:
   - **Stripe**: Dashboard → Developers → Webhooks
   - **Close.io**: Settings → API → Webhooks
4. Add the webhook URL
5. Configure the secret (if supported)
6. Select events to send

### 3. Monitor Webhooks

- View webhook stats in the job editor
- Check recent events and their status
- View detailed event payloads
- Retry failed events

## Best Practices

1. **Event Filtering**: Use event type filters to reduce processing overhead
2. **Batch Configuration**:
   - Higher batch size = better throughput but higher latency
   - Lower batch size = lower latency but more processing overhead
3. **Error Handling**: Monitor failed events and investigate patterns
4. **Security**: Keep webhook secrets secure and rotate periodically

## Implementation Details

### API Endpoints

```
POST /api/webhooks/:workspaceId/:jobId - Receive webhooks
POST /api/webhooks/:workspaceId/:jobId/test - Send test webhook
GET  /api/workspaces/:workspaceId/sync-jobs/:jobId/webhook/stats - Get stats
GET  /api/workspaces/:workspaceId/sync-jobs/:jobId/webhook/events - List events
POST /api/workspaces/:workspaceId/sync-jobs/:jobId/webhook/regenerate-secret
```

### Inngest Functions

- `webhook-event-received` - Initial event processing
- `webhook-batch-process` - Batch processing
- `webhook-cleanup` - Clean old events (30 days)
- `webhook-retry-failed` - Retry failed events

### Database Collections

- `sync_jobs` - Extended with webhook configuration
- `webhook_events` - Stores raw webhook events
- `job_executions` - Tracks webhook processing runs

## Future Enhancements

1. **Webhook Replay**: Replay historical events
2. **Custom Transformations**: Transform webhook data before storage
3. **Webhook Filters**: Advanced filtering rules
4. **Alerting**: Notifications for webhook failures
5. **Analytics**: Webhook performance metrics

## Troubleshooting

### Common Issues

1. **Webhook not received**

   - Check webhook URL is correct
   - Verify job is enabled
   - Check provider's webhook logs

2. **Signature verification failed**

   - Ensure secret matches between provider and app
   - Check for encoding issues

3. **Events not processing**
   - Check Inngest dashboard for errors
   - Verify MongoDB connection
   - Check event type filters

### Debug Steps

1. Check webhook stats in UI
2. View individual event details
3. Check Inngest function logs
4. Review MongoDB webhook_events collection
5. Check job execution logs
