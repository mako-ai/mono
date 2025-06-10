# Multi-Tenant Workspace Implementation

## Overview

This document describes the implementation of a multi-tenant workspace system for the application, transforming it from a single-user system to supporting multiple workspaces with team collaboration features.

## MongoDB Schema Architecture

### New Collections

1. **workspaces** - Stores workspace information

   - Unique slug for URL-friendly access
   - Settings for limits (databases, members)
   - Billing tier configuration

2. **workspaceMembers** - Manages workspace membership

   - Links users to workspaces with roles
   - Supports owner, admin, member, viewer roles
   - Compound unique index on workspaceId + userId

3. **workspaceInvites** - Handles workspace invitations

   - Token-based invite system
   - TTL index for automatic expiration
   - Email-based invitations with role assignment

4. **databases** - Workspace-scoped database connections

   - Encrypted connection credentials
   - Supports MongoDB, PostgreSQL, MySQL, SQLite, MSSQL
   - Tracks last connection time

5. **dataSources** - External data source configurations

   - Encrypted API credentials
   - Support for Stripe, Shopify, webhooks, CSV, APIs
   - Links to target databases

6. **consoleFolders** - Organizes saved queries

   - Hierarchical folder structure
   - Private folder support with ownership

7. **savedConsoles** - Stores saved queries/scripts
   - Language support: SQL, JavaScript, MongoDB queries
   - Execution tracking and history
   - Private/public visibility within workspace

## Key Features Implemented

### 1. Workspace Management

- Create, update, delete workspaces
- Unique slug generation for URL routing
- Workspace settings and limits
- Billing tier support (free, pro, enterprise)

### 2. Member Management

- Add/remove members with role-based access
- Role hierarchy: owner > admin > member > viewer
- Member role updates (except owner)
- List workspace members with details

### 3. Invitation System

- Email-based invitations with secure tokens
- Role assignment during invitation
- 7-day expiration with automatic cleanup
- Accept/cancel invitation flows

### 4. Database Connection Service

- Multi-database support with unified interface
- Connection pooling and management
- Encrypted credential storage
- MongoDB-specific features:
  - Connection string and individual parameter support
  - Replica set configuration
  - Collection discovery and stats
  - Aggregation pipeline execution

### 5. Authentication Integration

- Workspace creation on user registration
- Active workspace tracking in sessions
- Workspace switching functionality
- OAuth integration with workspace support

### 6. Middleware & Security

- `requireWorkspace` - Ensures workspace context
- `requireWorkspaceRole` - Role-based access control
- `optionalWorkspace` - Graceful workspace handling
- Workspace isolation for all data queries

### 7. Migration Support

- Script to migrate existing users to workspaces
- Database connection migration from config files
- Console file migration to MongoDB
- Preserves folder structure and relationships

## API Endpoints

### Workspace Management

- `GET /api/workspaces` - List user's workspaces
- `POST /api/workspaces` - Create new workspace
- `GET /api/workspaces/current` - Get current workspace
- `GET /api/workspaces/:id` - Get specific workspace
- `PUT /api/workspaces/:id` - Update workspace
- `DELETE /api/workspaces/:id` - Delete workspace
- `POST /api/workspaces/:id/switch` - Switch active workspace

### Member Management

- `GET /api/workspaces/:id/members` - List members
- `POST /api/workspaces/:id/members` - Add member
- `PUT /api/workspaces/:id/members/:userId` - Update member role
- `DELETE /api/workspaces/:id/members/:userId` - Remove member

### Invitation Management

- `POST /api/workspaces/:id/invites` - Create invitation
- `GET /api/workspaces/:id/invites` - List pending invites
- `DELETE /api/workspaces/:id/invites/:inviteId` - Cancel invite
- `POST /api/workspaces/invites/:token/accept` - Accept invitation

### Database Management (Workspace-scoped)

- `GET /api/workspaces/:id/databases` - List databases
- `POST /api/workspaces/:id/databases` - Create database
- `GET /api/workspaces/:id/databases/:dbId` - Get database
- `PUT /api/workspaces/:id/databases/:dbId` - Update database
- `DELETE /api/workspaces/:id/databases/:dbId` - Delete database
- `POST /api/workspaces/:id/databases/:dbId/test` - Test connection
- `POST /api/workspaces/:id/databases/:dbId/execute` - Execute query

### MongoDB-specific Endpoints

- `GET /api/workspaces/:id/databases/:dbId/collections` - List collections
- `GET /api/workspaces/:id/databases/:dbId/collections/:name` - Collection info

## Security Considerations

1. **Data Isolation**: All queries include workspace filtering
2. **Encryption**: Sensitive data encrypted at rest using AES-256
3. **Role-Based Access**: Granular permissions per workspace
4. **Session Security**: Workspace context stored in secure sessions
5. **Input Validation**: MongoDB ObjectId validation, SQL injection prevention

## MongoDB-Specific Features

1. **Flexible Connection Options**:

   - Full connection string support
   - Individual parameter configuration
   - MongoDB Atlas compatibility

2. **Query Execution**:

   - JavaScript-style query parsing
   - Structured query API
   - Aggregation pipeline support

3. **Collection Management**:
   - Auto-discovery of collections
   - Collection statistics
   - Index information

## Frontend Integration Requirements

The frontend needs to be updated to:

1. **Workspace Switcher Component**

   - Display current workspace
   - List available workspaces
   - Create new workspace option
   - Switch workspace functionality

2. **API Client Updates**

   - Include workspace ID in headers (`x-workspace-id`)
   - Handle workspace context in all requests
   - Update endpoints to workspace-scoped versions

3. **Database Management UI**

   - MongoDB connection form with connection string option
   - Database type selection
   - Connection testing interface
   - Collection browser for MongoDB

4. **Member Management UI**

   - Member list with roles
   - Invite form with email and role
   - Pending invitations list
   - Role management interface

5. **Console/Query Builder**
   - MongoDB query builder interface
   - Support for different query languages
   - Save queries to workspace
   - Folder organization

## Migration Guide

1. **Run Migration Script**:

   ```bash
   npm run migrate:workspaces
   ```

2. **Update Environment Variables**:

   ```env
   ENCRYPTION_KEY=<32-byte-hex-key>
   DATABASE_URL=mongodb://localhost:27017/myapp
   ```

3. **Database Indexes**: The migration script creates all necessary indexes

4. **Frontend Updates**: Update API client to use workspace-scoped endpoints

## Next Steps

1. **Billing Integration**: Connect workspace tiers to payment system
2. **Usage Analytics**: Track workspace resource usage
3. **Audit Logging**: Log workspace activities
4. **Advanced Features**:
   - Workspace templates
   - Cross-workspace data sharing
   - Workspace archiving
   - API access tokens per workspace

## Testing Checklist

- [ ] User registration creates workspace
- [ ] OAuth login creates/uses workspace
- [ ] Workspace switching updates session
- [ ] Data isolation between workspaces
- [ ] Role-based access control
- [ ] Invitation flow (create, accept, expire)
- [ ] MongoDB connection and query execution
- [ ] Database connection encryption/decryption
- [ ] Migration script execution
- [ ] Member management operations
