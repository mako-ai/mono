# Stripe Webhook Signature Verification Fix

## Problem

Stripe webhook signature verification was failing with the error:

```
Webhook signature verification failed: No signatures found matching the expected signature for payload.
```

## Root Causes

1. **Raw Body Preservation**: The webhook endpoint needs to receive the exact raw body bytes as sent by Stripe
2. **Webhook Secret Format**: Stripe webhook secrets have a specific format (`whsec_...`) that must be obtained from Stripe Dashboard

## Solution Implemented

### 1. Raw Body Handling

Updated the webhook route to properly preserve the raw request body:

```typescript
// api/src/routes/webhooks.ts
const rawBodyBuffer = Buffer.from(await c.req.arrayBuffer());
const rawBodyText = rawBodyBuffer.toString("utf8");
```

### 2. Webhook Secret Management

Added a new endpoint to allow users to update their webhook secret:

```
POST /api/workspaces/:workspaceId/sync-jobs/:jobId/webhook/update-secret
```

## How to Fix Your Stripe Webhooks

### Step 1: Create Webhook in Stripe Dashboard

1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Enter your webhook URL: `https://your-domain.com/api/webhooks/{workspaceId}/{jobId}`
4. Select the events you want to listen to
5. Click "Add endpoint"

### Step 2: Get Your Webhook Secret

1. After creating the endpoint, click on it in the Stripe Dashboard
2. Click "Reveal" under "Signing secret"
3. Copy the secret (it starts with `whsec_`)

### Step 3: Update Your Sync Job

Use the API to update your webhook secret:

```bash
# Using curl
curl -X POST https://your-domain.com/api/workspaces/{workspaceId}/sync-jobs/{jobId}/webhook/update-secret \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"secret": "whsec_your_stripe_webhook_secret"}'
```

Or use this Node.js script:

```javascript
const updateWebhookSecret = async (workspaceId, jobId, stripeWebhookSecret) => {
  const response = await fetch(
    `https://your-domain.com/api/workspaces/${workspaceId}/sync-jobs/${jobId}/webhook/update-secret`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer YOUR_API_KEY",
      },
      body: JSON.stringify({ secret: stripeWebhookSecret }),
    },
  );

  const result = await response.json();
  console.log(result);
};

// Usage
updateWebhookSecret("your-workspace-id", "your-job-id", "whsec_...");
```

### Step 4: Test Your Webhook

Use Stripe CLI to test:

```bash
# Install Stripe CLI if you haven't already
# Then forward webhooks to your local endpoint
stripe listen --forward-to localhost:3001/api/webhooks/{workspaceId}/{jobId}

# In another terminal, trigger a test event
stripe trigger customer.created
```

## Technical Details

### Changes Made

1. **Webhook Route** (`api/src/routes/webhooks.ts`):
   - Changed from `c.req.text()` to `Buffer.from(await c.req.arrayBuffer())` for exact byte preservation
2. **Stripe Connector** (`api/src/connectors/stripe/connector.ts`):

   - Removed unnecessary webhook secret parsing
   - Pass the secret directly to Stripe's `constructEvent` method

3. **New API Endpoint** (`api/src/routes/sync-jobs.ts`):
   - Added `/webhook/update-secret` endpoint to allow manual webhook secret updates

### Why This Works

- Stripe requires the exact raw body bytes for signature verification
- The webhook secret must be the one provided by Stripe (format: `whsec_...`)
- No body parsing or modification should occur before signature verification

## Future Improvements

Consider adding UI functionality to:

1. Allow users to paste their Stripe webhook secret in the sync job form
2. Add instructions for obtaining the webhook secret from Stripe
3. Validate that the secret follows Stripe's format (`whsec_...`)
