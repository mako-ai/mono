# Webhook System Refactoring Summary

## Overview

The webhook system has been refactored to be completely connector-agnostic. Previously, the webhook routes had hardcoded logic for specific connectors (Stripe and Close). Now, the system uses the connector registry pattern to handle webhooks for any connector that supports them.

## Key Changes

### 1. BaseConnector Interface Extension

Added webhook support methods to `BaseConnector`:

```typescript
// Check if connector supports webhooks
supportsWebhooks(): boolean

// Verify webhook signature and parse event
async verifyWebhook(options: WebhookHandlerOptions): Promise<WebhookVerificationResult>

// Get webhook event mapping for a given event type
getWebhookEventMapping(eventType: string): WebhookEventMapping | null

// Get supported webhook event types
getSupportedWebhookEvents(): string[]

// Extract entity data from webhook event
extractWebhookData(event: any): { id: string; data: any } | null
```

### 2. Connector Implementations

Both `StripeConnector` and `CloseConnector` now implement the webhook interface:

- Signature verification specific to each provider
- Event type mappings for their respective entities
- Data extraction logic specific to their webhook payload format

### 3. Webhook Route Refactoring

The webhook endpoint (`/api/webhooks/:workspaceId/:jobId`) now:

1. Fetches the sync job and data source
2. Gets the appropriate connector from the registry
3. Uses the connector's `verifyWebhook()` method for signature verification
4. Stores all headers for audit/debugging purposes

### 4. Webhook Processing

The Inngest webhook processing functions now:

1. Use the connector registry to get the appropriate connector
2. Call `connector.getWebhookEventMapping()` to determine entity mapping
3. Use `connector.extractWebhookData()` to extract entity data from payloads

### 5. Utility Functions

Deprecated hardcoded utility functions:

- `verifyWebhookSignature()` - replaced by `connector.verifyWebhook()`
- `parseWebhookPayload()` - replaced by `connector.extractWebhookData()`
- `getDefaultEventTypes()` - now uses connector registry

## Benefits

1. **Extensibility**: New connectors can add webhook support by implementing the interface
2. **Maintainability**: No hardcoded connector logic in routes or processing
3. **Type Safety**: Proper TypeScript interfaces for webhook handling
4. **Consistency**: All connectors follow the same webhook pattern

## Adding Webhook Support to New Connectors

To add webhook support to a new connector:

1. Override `supportsWebhooks()` to return `true`
2. Implement `verifyWebhook()` with signature verification logic
3. Define event mappings in `getWebhookEventMapping()`
4. List supported events in `getSupportedWebhookEvents()`
5. Implement `extractWebhookData()` to parse webhook payloads

Example:

```typescript
class MyConnector extends BaseConnector {
  supportsWebhooks(): boolean {
    return true;
  }

  async verifyWebhook(
    options: WebhookHandlerOptions,
  ): Promise<WebhookVerificationResult> {
    // Implement signature verification
  }

  getWebhookEventMapping(eventType: string): WebhookEventMapping | null {
    // Return entity and operation for event type
  }

  getSupportedWebhookEvents(): string[] {
    // Return list of supported event types
  }

  extractWebhookData(event: any): { id: string; data: any } | null {
    // Extract entity data from webhook payload
  }
}
```

## Migration Notes

- The webhook route no longer imports specific SDK libraries (Stripe, etc.)
- Webhook signature verification is delegated to connectors
- Event type filtering uses connector's supported events list
- All connector-specific logic is encapsulated in the connector classes
