import mongoose, { Types } from 'mongoose';
import { User } from '../database/schema';
import { 
  Workspace, 
  WorkspaceMember, 
  Database, 
  SavedConsole,
  ConsoleFolder
} from '../database/workspace-schema';
import { configLoader } from '../utils/config-loader';
import { ConsoleManager } from '../utils/console-manager';
import * as fs from 'fs';
import * as path from 'path';

export async function migrateToWorkspaces() {
  console.log('🚀 Starting workspace migration...');

  try {
    // Connect to MongoDB
    const mongoUri = process.env.DATABASE_URL || 'mongodb://localhost:27017/myapp';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Step 1: Create workspaces for existing users
      console.log('📦 Creating workspaces for existing users...');
      const users = await User.find({}).session(session);
      
      for (const user of users) {
        // Check if user already has a workspace
        const existingMember = await WorkspaceMember.findOne({ userId: user._id }).session(session);
        if (existingMember) {
          console.log(`⏭️  User ${user.email} already has a workspace`);
          continue;
        }

        // Create personal workspace
        const workspace = new Workspace({
          name: `${user.email}'s Workspace`,
          slug: generateSlug(user.email),
          createdBy: new Types.ObjectId(user._id),
          createdAt: new Date(),
          updatedAt: new Date(),
          settings: {
            maxDatabases: 5,
            maxMembers: 10,
            billingTier: 'free',
          },
        });
        await workspace.save({ session });
        console.log(`✅ Created workspace for ${user.email}`);

        // Add user as owner
        const member = new WorkspaceMember({
          workspaceId: workspace._id,
          userId: new Types.ObjectId(user._id),
          role: 'owner',
          joinedAt: new Date(),
        });
        await member.save({ session });

        // Step 2: Migrate databases from config
        console.log(`📊 Migrating databases for ${user.email}...`);
        const mongoSources = configLoader.getMongoDBSources();
        
        for (const source of mongoSources) {
          // Create database entry
          const database = new Database({
            workspaceId: workspace._id,
            name: source.name,
            type: 'mongodb',
            connection: {
              connectionString: source.connectionString,
              database: source.database,
              authSource: 'admin',
              ssl: false,
            },
            createdBy: new Types.ObjectId(user._id),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          await database.save({ session });
          console.log(`  ✅ Migrated database: ${source.name}`);
        }

        // Step 3: Migrate consoles from disk
        console.log(`📄 Migrating consoles for ${user.email}...`);
        const consoleManager = new ConsoleManager();
        const consoleTree = await consoleManager.listConsoles();
        
        // Create folder structure
        const folderMap = new Map<string, Types.ObjectId>();
        
        const processFolder = async (items: any[], parentId?: Types.ObjectId) => {
          for (const item of items) {
            if (item.isDirectory) {
              // Create folder
              const folder = new ConsoleFolder({
                workspaceId: workspace._id,
                name: item.name,
                parentId,
                isPrivate: false,
                createdAt: new Date(),
              });
              await folder.save({ session });
              folderMap.set(item.path, folder._id);
              console.log(`  📁 Created folder: ${item.name}`);
              
              // Process children
              if (item.children && item.children.length > 0) {
                await processFolder(item.children, folder._id);
              }
            } else if (item.name.endsWith('.js') || !item.isDirectory) {
              // Migrate console file
              try {
                const content = await consoleManager.getConsole(item.path.replace('.js', ''));
                
                // Determine parent folder
                const parentPath = path.dirname(item.path);
                const folderId = parentPath !== '.' ? folderMap.get(parentPath) : undefined;
                
                // Find a database for this console (use the first one)
                const defaultDatabase = await Database.findOne({ 
                  workspaceId: workspace._id 
                }).session(session);
                
                if (defaultDatabase) {
                  const savedConsole = new SavedConsole({
                    workspaceId: workspace._id,
                    folderId,
                    databaseId: defaultDatabase._id,
                    name: item.name.replace('.js', ''),
                    description: `Migrated from ${item.path}`,
                    code: content,
                    language: 'javascript', // Assuming JavaScript for .js files
                    createdBy: new Types.ObjectId(user._id),
                    isPrivate: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    executionCount: 0,
                  });
                  await savedConsole.save({ session });
                  console.log(`  ✅ Migrated console: ${item.name}`);
                }
              } catch (error) {
                console.error(`  ❌ Failed to migrate console ${item.path}:`, error);
              }
            }
          }
        };
        
        await processFolder(consoleTree);
      }

      // Commit transaction
      await session.commitTransaction();
      console.log('✅ Migration completed successfully!');

    } catch (error) {
      await session.abortTransaction();
      console.error('❌ Migration failed:', error);
      throw error;
    } finally {
      session.endSession();
    }

  } catch (error) {
    console.error('❌ Fatal migration error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

/**
 * Generate URL-friendly slug from text
 */
function generateSlug(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/@.*$/, '') // Remove email domain
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  
  // Add random suffix to ensure uniqueness
  return `${base}-${Date.now().toString(36)}`;
}

// Run migration if called directly
if (require.main === module) {
  migrateToWorkspaces();
}