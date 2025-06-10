import mongoose, { Schema, Document } from 'mongoose';
import { nanoid } from 'nanoid';

/**
 * User model interface
 */
export interface IUser extends Document {
  _id: string;
  email: string;
  hashedPassword?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Session model interface for Lucia
 */
export interface ISession extends Document {
  _id: string;
  userId: string;
  expiresAt: Date;
  activeWorkspaceId?: string;
}

/**
 * OAuth Account model interface
 */
export interface IOAuthAccount extends Document {
  userId: string;
  provider: 'google' | 'github';
  providerUserId: string;
  email?: string;
  createdAt: Date;
}

/**
 * User Schema
 */
const UserSchema = new Schema<IUser>(
  {
    _id: {
      type: String,
      default: () => nanoid(),
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    hashedPassword: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

/**
 * Session Schema for Lucia
 */
const SessionSchema = new Schema<ISession>({
  _id: {
    type: String,
    default: () => nanoid(),
  },
  userId: {
    type: String,
    required: true,
    ref: 'User',
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  activeWorkspaceId: {
    type: String,
    required: false,
    ref: 'Workspace',
  },
});

// Index for session cleanup
SessionSchema.index({ expiresAt: 1 });

/**
 * OAuth Account Schema
 */
const OAuthAccountSchema = new Schema<IOAuthAccount>(
  {
    userId: {
      type: String,
      required: true,
      ref: 'User',
    },
    provider: {
      type: String,
      required: true,
      enum: ['google', 'github'],
    },
    providerUserId: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// Compound index to ensure unique provider accounts
OAuthAccountSchema.index({ provider: 1, providerUserId: 1 }, { unique: true });
OAuthAccountSchema.index({ userId: 1 });

// Models
export const User = mongoose.model<IUser>('User', UserSchema);
export const Session = mongoose.model<ISession>('Session', SessionSchema);
export const OAuthAccount = mongoose.model<IOAuthAccount>(
  'OAuthAccount',
  OAuthAccountSchema,
);

/**
 * Database connection helper
 */
export async function connectDatabase(): Promise<void> {
  const mongoUri = process.env.DATABASE_URL;
  if (!mongoUri) {
    throw new Error('DATABASE_URL is not set');
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}
