import mongoose, { Schema, Document, Types } from "mongoose";
import { nanoid } from "nanoid";
import * as crypto from "crypto";

// Encryption helper functions
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
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
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
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
  };
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
  type: "stripe" | "shopify" | "webhook" | "csv" | "api";
  config: any;
  targetDatabases?: Types.ObjectId[];
  createdBy: string;
  createdAt: Date;
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
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
WorkspaceSchema.index({ slug: 1 }, { unique: true });
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
    default: () => nanoid(32),
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
WorkspaceInviteSchema.index({ token: 1 }, { unique: true });
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
  }
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
      enum: ["stripe", "shopify", "webhook", "csv", "api"],
      required: true,
    },
    config: {
      type: Schema.Types.Mixed,
      required: true,
      set: encryptObject,
      get: decryptObject,
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
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: { getters: true },
    toObject: { getters: true },
  }
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
  }
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
  }
);

// Indexes
SavedConsoleSchema.index({ workspaceId: 1, folderId: 1 });
SavedConsoleSchema.index({ workspaceId: 1, createdBy: 1, isPrivate: 1 });
SavedConsoleSchema.index({ databaseId: 1 }, { sparse: true }); // Sparse index since databaseId is optional

// Models
export const Workspace = mongoose.model<IWorkspace>(
  "Workspace",
  WorkspaceSchema
);
export const WorkspaceMember = mongoose.model<IWorkspaceMember>(
  "WorkspaceMember",
  WorkspaceMemberSchema
);
export const WorkspaceInvite = mongoose.model<IWorkspaceInvite>(
  "WorkspaceInvite",
  WorkspaceInviteSchema
);
export const Database = mongoose.model<IDatabase>("Database", DatabaseSchema);
export const DataSource = mongoose.model<IDataSource>(
  "DataSource",
  DataSourceSchema
);
export const ConsoleFolder = mongoose.model<IConsoleFolder>(
  "ConsoleFolder",
  ConsoleFolderSchema
);
export const SavedConsole = mongoose.model<ISavedConsole>(
  "SavedConsole",
  SavedConsoleSchema
);
