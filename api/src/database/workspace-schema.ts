import mongoose, { Schema, Document, Types } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";

// Encryption helper functions
let _encryptionKey: string | null = null;

function getEncryptionKey(): string {
  if (!_encryptionKey) {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error("ENCRYPTION_KEY environment variable is not set");
    }
    _encryptionKey = key;
  }
  return _encryptionKey;
}

const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(getEncryptionKey(), "hex"),
    iv,
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text: string): string {
  const textParts = text.split(":");
  const iv = Buffer.from(textParts.shift()!, "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(getEncryptionKey(), "hex"),
    iv,
  );
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

function encryptObject(obj: any): any {
  const encrypted: any = {};
  for (const key in obj) {
    if (typeof obj[key] === "string" && obj[key]) {
      encrypted[key] = encrypt(obj[key]);
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      encrypted[key] = encryptObject(obj[key]);
    } else {
      encrypted[key] = obj[key];
    }
  }
  return encrypted;
}

function decryptObject(obj: any): any {
  const decrypted: any = {};
  for (const key in obj) {
    if (typeof obj[key] === "string" && obj[key] && obj[key].includes(":")) {
      try {
        decrypted[key] = decrypt(obj[key]);
      } catch {
        decrypted[key] = obj[key]; // If decryption fails, return as is
      }
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      decrypted[key] = decryptObject(obj[key]);
    } else {
      decrypted[key] = obj[key];
    }
  }
  return decrypted;
}

// Selective encryption for DataSource config - only encrypt sensitive fields
function encryptDataSourceConfig(config: any): any {
  if (!config || typeof config !== "object") return config;

  const result = { ...config };

  // Only encrypt specific sensitive fields
  if (config.headers && typeof config.headers === "string") {
    result.headers = encrypt(config.headers);
  }
  if (config.api_key && typeof config.api_key === "string") {
    result.api_key = encrypt(config.api_key);
  }
  if (config.password && typeof config.password === "string") {
    result.password = encrypt(config.password);
  }

  return result;
}

function decryptDataSourceConfig(config: any): any {
  if (!config || typeof config !== "object") return config;

  const result = { ...config };

  // Only decrypt specific sensitive fields
  if (
    config.headers &&
    typeof config.headers === "string" &&
    config.headers.includes(":")
  ) {
    try {
      result.headers = decrypt(config.headers);
    } catch {
      // If decryption fails, assume it's already plain text (backward compatibility)
      result.headers = config.headers;
    }
  }
  if (
    config.api_key &&
    typeof config.api_key === "string" &&
    config.api_key.includes(":")
  ) {
    try {
      result.api_key = decrypt(config.api_key);
    } catch {
      result.api_key = config.api_key;
    }
  }
  if (
    config.password &&
    typeof config.password === "string" &&
    config.password.includes(":")
  ) {
    try {
      result.password = decrypt(config.password);
    } catch {
      result.password = config.password;
    }
  }

  return result;
}

/**
 * Workspace model interface
 */
export interface IWorkspace extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  settings: {
    maxDatabases: number;
    maxMembers: number;
    billingTier: "free" | "pro" | "enterprise";
    customPrompt?: string;
  };
  apiKeys?: IWorkspaceApiKey[];
}

/**
 * API Key interface for workspace authentication
 */
export interface IWorkspaceApiKey {
  _id?: Types.ObjectId;
  name: string;
  keyHash: string;
  prefix: string; // First 8 characters to help identify the key
  createdAt: Date;
  lastUsedAt?: Date;
  createdBy: string;
}

/**
 * WorkspaceMember model interface
 */
export interface IWorkspaceMember extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  userId: string;
  role: "owner" | "admin" | "member" | "viewer";
  joinedAt: Date;
}

/**
 * WorkspaceInvite model interface
 */
export interface IWorkspaceInvite extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  email: string;
  token: string;
  role: "admin" | "member" | "viewer";
  invitedBy: string;
  expiresAt: Date;
  acceptedAt?: Date;
}

/**
 * Database model interface
 */
export interface IDatabase extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  type: "mongodb" | "postgresql" | "mysql" | "sqlite" | "mssql";
  connection: {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    connectionString?: string;
    authSource?: string;
    replicaSet?: string;
    ssl?: boolean;
    sshTunnel?: {
      enabled: boolean;
      host?: string;
      port?: number;
      username?: string;
      privateKey?: string;
    };
  };
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastConnectedAt?: Date;
}

/**
 * DataSource model interface
 */
export interface IDataSource extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  type:
    | "stripe"
    | "close"
    | "graphql"
    | "postgresql"
    | "mysql"
    | "webhook"
    | "csv"
    | "api";
  description?: string;
  config: {
    // API sources
    api_key?: string;
    api_base_url?: string;

    // GraphQL sources
    endpoint?: string;
    headers?: { [key: string]: string };
    queries?: Array<{
      name: string;
      query: string;
      variables?: { [key: string]: any };
      dataPath?: string;
      hasNextPagePath?: string;
      cursorPath?: string;
      totalCountPath?: string;
    }>;

    // Database sources
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    connection_string?: string;

    // Additional fields
    [key: string]: any;
  };
  settings: {
    sync_batch_size: number;
    rate_limit_delay_ms: number;
    max_retries?: number;
    timeout_ms?: number;
    timezone?: string;
  };
  targetDatabases?: Types.ObjectId[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt?: Date;
  isActive: boolean;
}

/**
 * ConsoleFolder model interface
 */
export interface IConsoleFolder extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  parentId?: Types.ObjectId;
  isPrivate: boolean;
  ownerId?: string;
  createdAt: Date;
}

/**
 * SavedConsole model interface
 */
export interface ISavedConsole extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  folderId?: Types.ObjectId;
  databaseId?: Types.ObjectId;
  name: string;
  description?: string;
  code: string;
  language: "sql" | "javascript" | "mongodb";
  mongoOptions?: {
    collection: string;
    operation:
      | "find"
      | "aggregate"
      | "insertMany"
      | "updateMany"
      | "deleteMany"
      | "findOne"
      | "updateOne"
      | "deleteOne";
  };
  createdBy: string;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
  executionCount: number;
}

/**
 * Chat model interface
 */
export interface IChat extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  title: string;
  threadId?: string; // Custom thread ID for conversation continuity
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  createdBy: string;
  titleGenerated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * SyncJob model interface
 */
export interface ISyncJob extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  dataSourceId: Types.ObjectId;
  destinationDatabaseId: Types.ObjectId;
  schedule: {
    cron: string;
    timezone?: string;
  };
  entityFilter?: string[]; // Optional: specific entities to sync
  syncMode: "full" | "incremental";
  enabled: boolean;
  lastRunAt?: Date;
  lastSuccessAt?: Date;
  lastError?: string;
  nextRunAt?: Date;
  runCount: number;
  avgDurationMs?: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * JobExecution model interface
 */
export interface IJobExecution extends Document {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  workspaceId: Types.ObjectId;
  startedAt: Date;
  completedAt?: Date;
  lastHeartbeat?: Date;
  status: "running" | "completed" | "failed" | "canceled";
  success: boolean;
  duration?: number;
  logs: Array<{
    timestamp: Date;
    level: "debug" | "info" | "warn" | "error";
    message: string;
    metadata?: any;
  }>;
  error?: {
    message: string;
    stack?: string;
    code?: string | number | null;
  } | null;
  context?: any;
  system?: any;
}

/**
 * Workspace Schema
 */
const WorkspaceSchema = new Schema<IWorkspace>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    createdBy: {
      type: String,
      ref: "User",
      required: true,
    },
    settings: {
      maxDatabases: {
        type: Number,
        default: 5,
      },
      maxMembers: {
        type: Number,
        default: 10,
      },
      billingTier: {
        type: String,
        enum: ["free", "pro", "enterprise"],
        default: "free",
      },
      customPrompt: {
        type: String,
        default: `# Custom Prompt Configuration

This is your custom prompt that will be combined with the system prompt to provide additional context about your data and business relationships.

## Business Context
Add information about your business domain, terminology, and key concepts here.

## Data Relationships
Describe important relationships between your collections and how they connect.

## Common Queries
Document frequently requested queries or analysis patterns.

## Custom Instructions
Add any specific instructions for how the AI should interpret your data or respond to certain types of questions.

---

*This prompt is combined with the system prompt to provide context-aware responses. You can edit this through the Settings page.*`,
      },
    },
    apiKeys: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
        },
        keyHash: {
          type: String,
          required: true,
        },
        prefix: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        lastUsedAt: {
          type: Date,
        },
        createdBy: {
          type: String,
          ref: "User",
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Indexes
WorkspaceSchema.index({ createdBy: 1 });

/**
 * WorkspaceMember Schema
 */
const WorkspaceMemberSchema = new Schema<IWorkspaceMember>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: "Workspace",
    required: true,
  },
  userId: {
    type: String,
    ref: "User",
    required: true,
  },
  role: {
    type: String,
    enum: ["owner", "admin", "member", "viewer"],
    required: true,
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes
WorkspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
WorkspaceMemberSchema.index({ userId: 1 });

/**
 * WorkspaceInvite Schema
 */
const WorkspaceInviteSchema = new Schema<IWorkspaceInvite>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: "Workspace",
    required: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
    default: () => uuidv4().replace(/-/g, ""),
  },
  role: {
    type: String,
    enum: ["admin", "member", "viewer"],
    required: true,
  },
  invitedBy: {
    type: String,
    ref: "User",
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  },
  acceptedAt: {
    type: Date,
  },
});

// Indexes
WorkspaceInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
WorkspaceInviteSchema.index({ workspaceId: 1, email: 1 });

/**
 * Database Schema
 */
const DatabaseSchema = new Schema<IDatabase>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["mongodb", "postgresql", "mysql", "sqlite", "mssql"],
      required: true,
    },
    connection: {
      type: Schema.Types.Mixed,
      required: true,
      set: encryptObject,
      get: decryptObject,
    },
    createdBy: {
      type: String,
      ref: "User",
      required: true,
    },
    lastConnectedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

// Indexes
DatabaseSchema.index({ workspaceId: 1 });
DatabaseSchema.index({ workspaceId: 1, name: 1 });

/**
 * DataSource Schema
 */
const DataSourceSchema = new Schema<IDataSource>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "stripe",
        "close",
        "graphql",
        "postgresql",
        "mysql",
        "webhook",
        "csv",
        "api",
      ],
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    config: {
      type: Schema.Types.Mixed,
      required: true,
      set: encryptDataSourceConfig,
      get: decryptDataSourceConfig,
    },
    settings: {
      sync_batch_size: {
        type: Number,
        required: true,
      },
      rate_limit_delay_ms: {
        type: Number,
        required: true,
      },
      max_retries: {
        type: Number,
      },
      timeout_ms: {
        type: Number,
      },
      timezone: {
        type: String,
      },
    },
    targetDatabases: [
      {
        type: Schema.Types.ObjectId,
        ref: "Database",
      },
    ],
    createdBy: {
      type: String,
      ref: "User",
      required: true,
    },
    lastSyncedAt: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

// Indexes
DataSourceSchema.index({ workspaceId: 1 });
DataSourceSchema.index({ workspaceId: 1, type: 1 });

/**
 * ConsoleFolder Schema
 */
const ConsoleFolderSchema = new Schema<IConsoleFolder>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "ConsoleFolder",
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    ownerId: {
      type: String,
      ref: "User",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// Indexes
ConsoleFolderSchema.index({ workspaceId: 1, parentId: 1 });
ConsoleFolderSchema.index({ workspaceId: 1, ownerId: 1, isPrivate: 1 });

/**
 * SavedConsole Schema
 */
const SavedConsoleSchema = new Schema<ISavedConsole>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    folderId: {
      type: Schema.Types.ObjectId,
      ref: "ConsoleFolder",
    },
    databaseId: {
      type: Schema.Types.ObjectId,
      ref: "Database",
      required: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    code: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      enum: ["sql", "javascript", "mongodb"],
      required: true,
    },
    mongoOptions: {
      collection: String,
      operation: {
        type: String,
        enum: [
          "find",
          "aggregate",
          "insertMany",
          "updateMany",
          "deleteMany",
          "findOne",
          "updateOne",
          "deleteOne",
        ],
      },
    },
    createdBy: {
      type: String,
      ref: "User",
      required: true,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    lastExecutedAt: {
      type: Date,
    },
    executionCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
SavedConsoleSchema.index({ workspaceId: 1, folderId: 1 });
SavedConsoleSchema.index({ workspaceId: 1, createdBy: 1, isPrivate: 1 });
SavedConsoleSchema.index({ databaseId: 1 }, { sparse: true }); // Sparse index since databaseId is optional

/**
 * Chat Schema
 */
const ChatSchema = new Schema<IChat>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    threadId: {
      type: String,
      unique: true,
      sparse: true, // Allow null values but ensure uniqueness when present
    },
    messages: [
      {
        role: {
          type: String,
          enum: ["user", "assistant"],
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
      },
    ],
    createdBy: {
      type: String,
      ref: "User",
      required: true,
    },
    titleGenerated: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
ChatSchema.index({ workspaceId: 1 });
ChatSchema.index({ workspaceId: 1, title: 1 });

/**
 * SyncJob Schema
 */
const SyncJobSchema = new Schema<ISyncJob>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    dataSourceId: {
      type: Schema.Types.ObjectId,
      ref: "DataSource",
      required: true,
    },
    destinationDatabaseId: {
      type: Schema.Types.ObjectId,
      ref: "Database",
      required: true,
    },
    schedule: {
      cron: {
        type: String,
        required: true,
        validate: {
          validator: function (v: string) {
            // Basic cron validation - 5 or 6 fields
            const fields = v.split(" ");
            return fields.length === 5 || fields.length === 6;
          },
          message: "Invalid cron expression",
        },
      },
      timezone: {
        type: String,
        default: "UTC",
      },
    },
    entityFilter: [String],
    syncMode: {
      type: String,
      enum: ["full", "incremental"],
      default: "full",
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    lastRunAt: Date,
    lastSuccessAt: Date,
    lastError: String,
    nextRunAt: Date,
    runCount: {
      type: Number,
      default: 0,
    },
    avgDurationMs: Number,
    createdBy: {
      type: String,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
SyncJobSchema.index({ workspaceId: 1, enabled: 1 });
SyncJobSchema.index({ dataSourceId: 1 });
SyncJobSchema.index({ destinationDatabaseId: 1 });
SyncJobSchema.index({ nextRunAt: 1 });

/**
 * JobExecution Schema (binds to 'job_executions' collection)
 */
const JobExecutionSchema = new Schema<IJobExecution>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "SyncJob", required: true },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    startedAt: { type: Date, required: true },
    completedAt: Date,
    lastHeartbeat: Date,
    status: {
      type: String,
      enum: ["running", "completed", "failed", "canceled"],
      required: true,
    },
    success: { type: Boolean, required: true },
    duration: Number,
    logs: [
      {
        timestamp: { type: Date, required: true },
        level: {
          type: String,
          enum: ["debug", "info", "warn", "error"],
          required: true,
        },
        message: { type: String, required: true },
        metadata: Schema.Types.Mixed,
      },
    ],
    error: Schema.Types.Mixed,
    context: Schema.Types.Mixed,
    system: Schema.Types.Mixed,
  },
  {
    collection: "job_executions",
    timestamps: false,
  },
);

// Indexes
JobExecutionSchema.index({ jobId: 1, startedAt: -1 });

// Models
export const Workspace = mongoose.model<IWorkspace>(
  "Workspace",
  WorkspaceSchema,
);
export const WorkspaceMember = mongoose.model<IWorkspaceMember>(
  "WorkspaceMember",
  WorkspaceMemberSchema,
);
export const WorkspaceInvite = mongoose.model<IWorkspaceInvite>(
  "WorkspaceInvite",
  WorkspaceInviteSchema,
);
export const Database = mongoose.model<IDatabase>("Database", DatabaseSchema);
export const DataSource = mongoose.model<IDataSource>(
  "DataSource",
  DataSourceSchema,
);
export const ConsoleFolder = mongoose.model<IConsoleFolder>(
  "ConsoleFolder",
  ConsoleFolderSchema,
);
export const SavedConsole = mongoose.model<ISavedConsole>(
  "SavedConsole",
  SavedConsoleSchema,
);
export const Chat = mongoose.model<IChat>("Chat", ChatSchema);
export const SyncJob = mongoose.model<ISyncJob>("SyncJob", SyncJobSchema);
export const JobExecution = mongoose.model<IJobExecution>(
  "JobExecution",
  JobExecutionSchema,
);
