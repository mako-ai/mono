# GraphQL Sync Client Guide

The GraphQL Sync Client allows you to pull data from any GraphQL API into your MongoDB database. It supports pagination, custom queries, error handling, and rate limiting.

## Table of Contents

1. [Configuration](#configuration)
2. [Basic Usage](#basic-usage)
3. [Query Configuration](#query-configuration)
4. [Pagination Support](#pagination-support)
5. [Authentication](#authentication)
6. [Rate Limiting & Error Handling](#rate-limiting--error-handling)
7. [Examples](#examples)
8. [Troubleshooting](#troubleshooting)

## Configuration

### 1. Add GraphQL Data Source to Configuration

Edit your `config/config.yaml` file to include a new GraphQL data source:

```yaml
data_sources:
  my_graphql_api:
    name: "My GraphQL API"
    description: "Custom GraphQL data source"
    active: true
    type: "graphql"
    connection:
      endpoint: "https://api.example.com/graphql"
      api_key: "${GRAPHQL_API_KEY}" # Optional: Bearer token
      headers: # Optional: Additional headers
        "X-API-Version": "v1"
        "User-Agent": "RevOps-Sync/1.0"
      queries:
        - name: "users"
          query: |
            query GetUsers($first: Int!, $after: String) {
              users(first: $first, after: $after) {
                edges {
                  node {
                    id
                    email
                    name
                    createdAt
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
                totalCount
              }
            }
          dataPath: "data.users.edges"
          hasNextPagePath: "data.users.pageInfo.hasNextPage"
          cursorPath: "data.users.pageInfo.endCursor"
          totalCountPath: "data.users.totalCount"
    settings:
      sync_batch_size: 100
      rate_limit_delay_ms: 500
      timeout_ms: 30000
```

### 2. Environment Variables

Set up your environment variables in `.env`:

```bash
GRAPHQL_API_KEY=your_api_key_here
```

## Basic Usage

### Command Line Sync

Sync all entities from a GraphQL data source:

```bash
pnpm run sync my_graphql_api atlas.revops
```

Sync a specific entity:

```bash
pnpm run sync my_graphql_api atlas.revops users
```

### Programmatic Usage

```typescript
import { GraphQLSyncService } from "./src/sync-graphql";
import { dataSourceManager } from "./src/data-source-manager";

const dataSource = dataSourceManager.getDataSource("my_graphql_api");
const syncService = new GraphQLSyncService(dataSource);

// Sync all configured queries
await syncService.syncAll("atlas.revops");

// Sync specific entity
const userQuery = dataSource.connection.queries.find((q) => q.name === "users");
await syncService.syncEntity(userQuery, "atlas.revops");
```

## Query Configuration

Each query in your GraphQL data source must include:

### Required Fields

- **name**: Unique identifier for the entity
- **query**: The GraphQL query string

### Optional Fields

- **variables**: Static variables to pass to the query
- **dataPath**: JSON path to the array of records (default: "data")
- **hasNextPagePath**: Path to pagination flag
- **cursorPath**: Path to pagination cursor
- **totalCountPath**: Path to total count for progress tracking

### Query Structure

Your GraphQL queries should support pagination using the Relay Connection specification or similar patterns:

```graphql
query GetUsers($first: Int!, $after: String) {
  users(first: $first, after: $after) {
    edges {
      node {
        id
        email
        name
        createdAt
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    totalCount
  }
}
```

## Pagination Support

The sync client supports three pagination patterns:

### 1. Relay-style Cursor Pagination (Recommended for Relay APIs)

For APIs that follow the Relay specification with cursor-based pagination:

```yaml
queries:
  - name: "products"
    query: |
      query GetProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            node {
              id
              name
              price
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    dataPath: "data.products.edges"
    hasNextPagePath: "data.products.pageInfo.hasNextPage"
    cursorPath: "data.products.pageInfo.endCursor"
```

### 2. Offset/Limit Pagination (Hasura, PostgreSQL, etc.)

For APIs that use traditional offset/limit pagination:

```yaml
queries:
  - name: "teams"
    query: |
      query GetTeams($limit: Int!, $offset: Int!) {
        teams(limit: $limit, offset: $offset, order_by: { id: desc_nulls_last }) {
          id
          name
          created_at
        }
      }
    dataPath: "data.teams" # Direct access to array (no edges/nodes)
    # No pagination paths needed - automatically detected
```

### 3. Simple Node Arrays (Some GraphQL APIs)

For APIs that return simple arrays within a pageInfo structure:

```yaml
queries:
  - name: "orders"
    query: |
      query GetOrders($first: Int!, $after: String) {
        orders(first: $first, after: $after) {
          nodes {
            id
            total
            status
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    dataPath: "data.orders.nodes"
    hasNextPagePath: "data.orders.pageInfo.hasNextPage"
    cursorPath: "data.orders.pageInfo.endCursor"
```

### 4. Automatic Pagination Detection

If no pagination paths are specified, the client will:

1. **Detect pagination type** based on query variables (`$after/$cursor` vs `$offset`)
2. **Auto-stop** when returned records < batch size
3. **Handle both patterns** gracefully

### Pagination Configuration Reference

| Field             | Description             | Required | Cursor Pagination                    | Offset Pagination                      |
| ----------------- | ----------------------- | -------- | ------------------------------------ | -------------------------------------- |
| `dataPath`        | Path to data array      | Yes      | `data.products.edges`                | `data.teams`                           |
| `hasNextPagePath` | Path to "has more" flag | Optional | `data.products.pageInfo.hasNextPage` | Not needed                             |
| `cursorPath`      | Path to next cursor     | Optional | `data.products.pageInfo.endCursor`   | Not needed                             |
| `totalCountPath`  | Path to total count     | Optional | `data.products.totalCount`           | `data.teams_aggregate.aggregate.count` |

## Authentication

### Bearer Token Authentication

Set the `api_key` in your data source configuration:

```yaml
connection:
  endpoint: "https://api.example.com/graphql"
  api_key: "${GRAPHQL_API_KEY}"
```

This will add an `Authorization: Bearer {token}` header to all requests.

### Custom Headers

For custom authentication schemes:

```yaml
connection:
  endpoint: "https://api.example.com/graphql"
  headers:
    "Authorization": "Custom ${CUSTOM_TOKEN}"
    "X-API-Key": "${API_KEY}"
    "X-Client-ID": "${CLIENT_ID}"
```

### No Authentication

Simply omit the `api_key` and custom headers:

```yaml
connection:
  endpoint: "https://api.example.com/graphql"
```

## Rate Limiting & Error Handling

### Configuration

```yaml
settings:
  sync_batch_size: 100 # Records per request
  rate_limit_delay_ms: 500 # Delay between requests
  timeout_ms: 30000 # Request timeout
  max_retries: 5 # Max retry attempts
```

### Automatic Retry Logic

The client automatically retries failed requests with exponential backoff for:

- Network errors
- Server errors (5xx)
- Rate limiting (429)
- Timeout errors

### Rate Limiting Response

When the API returns a 429 status, the client will:

1. Check for `Retry-After` header
2. Wait the specified time or use exponential backoff
3. Retry the request

## Examples

### Example 1: E-commerce GraphQL API

```yaml
ecommerce_graphql:
  name: "E-commerce GraphQL API"
  description: "Shopify-like GraphQL API"
  active: true
  type: "graphql"
  connection:
    endpoint: "https://shop.example.com/api/graphql"
    api_key: "${SHOPIFY_ACCESS_TOKEN}"
    queries:
      - name: "products"
        query: |
          query GetProducts($first: Int!, $after: String) {
            products(first: $first, after: $after) {
              edges {
                node {
                  id
                  title
                  handle
                  description
                  vendor
                  productType
                  createdAt
                  updatedAt
                  variants(first: 10) {
                    edges {
                      node {
                        id
                        price
                        sku
                        inventoryQuantity
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        dataPath: "data.products.edges"
        hasNextPagePath: "data.products.pageInfo.hasNextPage"
        cursorPath: "data.products.pageInfo.endCursor"

      - name: "orders"
        query: |
          query GetOrders($first: Int!, $after: String) {
            orders(first: $first, after: $after) {
              edges {
                node {
                  id
                  orderNumber
                  email
                  totalPrice
                  subtotalPrice
                  totalTax
                  createdAt
                  lineItems(first: 50) {
                    edges {
                      node {
                        quantity
                        title
                        variant {
                          id
                          price
                        }
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        dataPath: "data.orders.edges"
        hasNextPagePath: "data.orders.pageInfo.hasNextPage"
        cursorPath: "data.orders.pageInfo.endCursor"
```

### Example 2: GitHub GraphQL API

```yaml
github_graphql:
  name: "GitHub GraphQL API"
  description: "GitHub API v4 GraphQL"
  active: true
  type: "graphql"
  connection:
    endpoint: "https://api.github.com/graphql"
    api_key: "${GITHUB_TOKEN}"
    queries:
      - name: "repositories"
        query: |
          query GetRepositories($first: Int!, $after: String, $owner: String!) {
            user(login: $owner) {
              repositories(first: $first, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
                edges {
                  node {
                    id
                    name
                    description
                    url
                    isPrivate
                    createdAt
                    updatedAt
                    primaryLanguage {
                      name
                    }
                    stargazerCount
                    forkCount
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
                totalCount
              }
            }
          }
        variables:
          owner: "your-github-username"
        dataPath: "data.user.repositories.edges"
        hasNextPagePath: "data.user.repositories.pageInfo.hasNextPage"
        cursorPath: "data.user.repositories.pageInfo.endCursor"
        totalCountPath: "data.user.repositories.totalCount"
```

### Example 3: Hasura GraphQL API

```yaml
realadvisor_hasura:
  name: "RealAdvisor Hasura API"
  description: "Hasura GraphQL API with offset/limit pagination"
  active: true
  type: "graphql"
  connection:
    endpoint: "https://hasura.realadvisor.com/v1/graphql"
    headers:
      "x-hasura-admin-secret": "${HASURA_ADMIN_SECRET}"
      "X-Client-Name": "RevOps-Sync"
    queries:
      - name: "teams"
        query: |
          query GetTeams($limit: Int!, $offset: Int!) {
            teams(limit: $limit, offset: $offset, order_by: { id: desc_nulls_last }) {
              id
              name
              teams_users {
                user {
                  first_name
                  last_name
                }
              }
              tenant {
                id
                country
                country_code
                name
              }
            }
            teams_aggregate {
              aggregate {
                count
              }
            }
          }
        dataPath: "data.teams"
        totalCountPath: "data.teams_aggregate.aggregate.count"

      - name: "users"
        query: |
          query GetUsers($limit: Int!, $offset: Int!) {
            users(limit: $limit, offset: $offset, order_by: { id: desc_nulls_last }) {
              id
              first_name
              last_name
              email
              created_at
              updated_at
            }
            users_aggregate {
              aggregate {
                count
              }
            }
          }
        dataPath: "data.users"
        totalCountPath: "data.users_aggregate.aggregate.count"
  settings:
    sync_batch_size: 250
    rate_limit_delay_ms: 200
```

### Example 4: Custom API with Simple Pagination

```yaml
custom_api:
  name: "Custom API"
  description: "Custom GraphQL API without Relay connections"
  active: true
  type: "graphql"
  connection:
    endpoint: "https://custom-api.example.com/graphql"
    headers:
      "X-API-Key": "${CUSTOM_API_KEY}"
    queries:
      - name: "users"
        query: |
          query GetUsers($limit: Int!, $offset: Int!) {
            users(limit: $limit, offset: $offset) {
              id
              email
              name
              createdAt
            }
          }
        dataPath: "data.users"
```

## Troubleshooting

### Common Issues

#### 1. Connection Test Fails

```bash
# Test your GraphQL endpoint manually
curl -X POST https://api.example.com/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"query": "query { __schema { queryType { name } } }"}'
```

#### 2. Authentication Errors

- Verify your API key is correct and not expired
- Check that the token has required permissions
- Ensure headers are formatted correctly

#### 3. Query Syntax Errors

- Validate your GraphQL query using GraphQL Playground or similar tools
- Check field names and types match the schema
- Ensure variables are properly typed

#### 4. Pagination Issues

- Verify pagination paths point to the correct response structure
- Check that your API supports cursor-based pagination
- Test pagination manually to understand the response format

#### 5. Rate Limiting

- Increase `rate_limit_delay_ms` if you're hitting rate limits
- Reduce `sync_batch_size` to make smaller requests
- Check API documentation for rate limiting rules

### Debug Mode

Enable detailed logging by setting the logging level in your global configuration:

```yaml
global:
  logging:
    level: "debug"
    include_api_responses: true
```

### Manual Testing

Test individual queries outside the sync process:

```typescript
import { GraphQLSyncService } from "./src/sync-graphql";

const syncService = new GraphQLSyncService(dataSource);
const result = await syncService.testConnection();
console.log(result);
```

## Data Storage

### MongoDB Collections

Data is stored in MongoDB collections with the following naming pattern:

```
{dataSourceId}_{entityName}
```

For example: `my_graphql_api_users`, `my_graphql_api_products`

### Record Structure

Each synced record includes additional metadata:

```javascript
{
  // Original GraphQL data
  id: "user_123",
  email: "user@example.com",
  name: "John Doe",

  // Sync metadata
  _dataSourceId: "my_graphql_api",
  _dataSourceName: "My GraphQL API",
  _entityType: "users",
  _syncedAt: new Date("2023-12-01T10:00:00Z")
}
```

### Atomic Updates

The sync process uses staging collections to ensure atomic updates:

1. Data is written to `{collection}_staging`
2. Once complete, staging is renamed to replace the main collection
3. This prevents partial data during sync failures

## Performance Tips

1. **Optimize Batch Size**: Start with 100 records per request and adjust based on API performance
2. **Use Appropriate Rate Limiting**: Respect API limits while maximizing throughput
3. **Request Only Needed Fields**: Keep GraphQL queries minimal to reduce transfer time
4. **Monitor Progress**: Use total count paths when available for accurate progress tracking
5. **Schedule Syncs**: Run syncs during off-peak hours for better API performance

## Security Considerations

1. **Environment Variables**: Store all sensitive data in environment variables
2. **Least Privilege**: Use API tokens with minimal required permissions
3. **Secure Storage**: Ensure your `.env` file is not committed to version control
4. **Regular Rotation**: Rotate API keys regularly according to security best practices
