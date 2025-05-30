# Database Management API

This document describes the REST API endpoints for managing MongoDB collections and views.

## Base URL

All endpoints are prefixed with `/api/database`

## Collections

### List Collections

**GET** `/api/database/collections`

Returns a list of all collections in the database.

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "name": "users",
      "type": "collection",
      "options": {},
      "info": {}
    }
  ]
}
```

### Create Collection

**POST** `/api/database/collections`

Creates a new collection.

**Request Body:**

```json
{
  "name": "new_collection",
  "options": {
    "capped": false,
    "size": 1000000
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Collection created successfully",
  "data": {
    "name": "new_collection",
    "namespace": "database.new_collection",
    "created": true
  }
}
```

### Delete Collection

**DELETE** `/api/database/collections/:name`

Deletes a collection by name.

**Response:**

```json
{
  "success": true,
  "message": "Collection deleted successfully",
  "data": {
    "name": "collection_name",
    "deleted": true
  }
}
```

### Get Collection Info

**GET** `/api/database/collections/:name/info`

Returns detailed information about a collection including stats, indexes, and sample documents.

**Response:**

```json
{
  "success": true,
  "data": {
    "name": "users",
    "type": "collection",
    "options": {},
    "stats": {
      "count": 1000,
      "size": 50000,
      "avgObjSize": 50,
      "storageSize": 60000,
      "indexes": 2,
      "totalIndexSize": 5000
    },
    "indexes": [...],
    "sampleDocuments": [...]
  }
}
```

## Views

### List Views

**GET** `/api/database/views`

Returns a list of all views in the database.

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "name": "user_summary",
      "type": "view",
      "options": {
        "viewOn": "users",
        "pipeline": [...]
      },
      "info": {}
    }
  ]
}
```

### Create View

**POST** `/api/database/views`

Creates a new view.

**Request Body:**

```json
{
  "name": "user_summary",
  "viewOn": "users",
  "pipeline": [
    {
      "$group": {
        "_id": "$department",
        "count": { "$sum": 1 },
        "avgSalary": { "$avg": "$salary" }
      }
    }
  ],
  "options": {}
}
```

**Response:**

```json
{
  "success": true,
  "message": "View created successfully",
  "data": {
    "name": "user_summary",
    "viewOn": "users",
    "pipeline": [...],
    "created": true
  }
}
```

### Delete View

**DELETE** `/api/database/views/:name`

Deletes a view by name.

**Response:**

```json
{
  "success": true,
  "message": "View deleted successfully",
  "data": {
    "name": "view_name",
    "deleted": true
  }
}
```

### Get View Info

**GET** `/api/database/views/:name/info`

Returns detailed information about a view including its definition and sample documents.

**Response:**

```json
{
  "success": true,
  "data": {
    "name": "user_summary",
    "type": "view",
    "options": {},
    "viewOn": "users",
    "pipeline": [...],
    "stats": {
      "count": 10,
      "size": 500,
      "avgObjSize": 50
    },
    "sampleDocuments": [...]
  }
}
```

## Error Responses

All endpoints return error responses in the following format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:

- `400` - Bad Request (missing required fields)
- `404` - Not Found (collection/view doesn't exist)
- `409` - Conflict (collection/view already exists)
- `500` - Internal Server Error

## Examples

### Creating a simple collection

```bash
curl -X POST http://localhost:3001/api/database/collections \
  -H "Content-Type: application/json" \
  -d '{"name": "products"}'
```

### Creating a view that aggregates user data

```bash
curl -X POST http://localhost:3001/api/database/views \
  -H "Content-Type: application/json" \
  -d '{
    "name": "department_stats",
    "viewOn": "employees",
    "pipeline": [
      {
        "$group": {
          "_id": "$department",
          "employeeCount": {"$sum": 1},
          "avgSalary": {"$avg": "$salary"}
        }
      },
      {
        "$sort": {"employeeCount": -1}
      }
    ]
  }'
```

### Listing all collections

```bash
curl http://localhost:3001/api/database/collections
```

### Getting detailed info about a collection

```bash
curl http://localhost:3001/api/database/collections/users/info
```

### Deleting a collection

```bash
curl -X DELETE http://localhost:3001/api/database/collections/old_collection
```
