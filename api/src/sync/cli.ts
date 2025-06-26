/* eslint-disable no-process-exit */
import { Command } from "commander";
import inquirer from "inquirer";
import { performSync, getDestinationManager } from "./sync";
import { databaseDataSourceManager } from "./database-data-source-manager";
import { syncConnectorRegistry } from "./connector-registry";

async function runSync(
  dataSourceId: string,
  destination: string,
  entity?: string,
  isIncremental: boolean = false,
) {
  try {
    // Using console as the logger for CLI tool
    await performSync(
      dataSourceId,
      destination,
      entity,
      isIncremental,
      console,
    );
  } catch (error) {
    console.error("\n❌ Sync failed:", error);
    process.exit(1);
  }
}

// Interactive mode functions
async function interactiveMode() {
  console.log("🚀 Welcome to the Interactive Data Sync Tool\n");

  try {
    // Get available workspaces
    process.stdout.write("⏳ Fetching workspaces...");
    const workspaces = await getDestinationManager().listWorkspaces();
    process.stdout.write("\r" + " ".repeat(50) + "\r");
    if (workspaces.length === 0) {
      console.error("❌ No workspaces found!");
      console.log("Please create a workspace in your application first.");
      process.exit(1);
    }

    // Prompt for workspace
    const workspaceChoices = workspaces.map(w => ({
      name: w.name,
      value: w.id,
      short: w.name,
    }));

    const { workspaceId } = await inquirer.prompt([
      {
        type: "list",
        name: "workspaceId",
        message: "Select a workspace:",
        choices: workspaceChoices,
      },
    ]);

    // Get available data sources for the selected workspace
    process.stdout.write("⏳ Fetching data sources...");
    const dataSources =
      await databaseDataSourceManager.getActiveDataSources(workspaceId);
    process.stdout.write("\r" + " ".repeat(50) + "\r");
    if (dataSources.length === 0) {
      console.error("❌ No active data sources found for this workspace!");
      console.log("Please create data sources in your application first.");
      process.exit(1);
    }

    // Get available destinations for the selected workspace
    process.stdout.write("⏳ Fetching destinations...");
    const destinations =
      await getDestinationManager().listDestinations(workspaceId);
    process.stdout.write("\r" + " ".repeat(50) + "\r");
    if (destinations.length === 0) {
      console.error("❌ No destination databases found for this workspace!");
      console.log(
        "Please create destination databases in your application first.",
      );
      process.exit(1);
    }

    // Prompt for data source
    const sourceChoices = dataSources.map(s => ({
      name: `${s.name} (${s.type})`,
      value: s.id,
      short: s.name,
    }));

    const { dataSourceId } = await inquirer.prompt([
      {
        type: "list",
        name: "dataSourceId",
        message: "Select a data source:",
        choices: sourceChoices,
      },
    ]);

    // Get selected data source details
    const selectedSource = dataSources.find(s => s.id === dataSourceId);
    if (!selectedSource) {
      throw new Error("Selected data source not found");
    }

    // Prompt for destination
    const destChoices = destinations.map((d: { name: string; id: string }) => ({
      name: d.name,
      value: d.id,
      short: d.name,
    }));

    const { destinationId } = await inquirer.prompt([
      {
        type: "list",
        name: "destinationId",
        message: "Select a destination database:",
        choices: destChoices,
      },
    ]);

    // Get available entities for the selected source
    const connector = await syncConnectorRegistry.getConnector(selectedSource);
    if (!connector) {
      throw new Error(
        `Failed to create connector for type: ${selectedSource.type}`,
      );
    }

    const availableEntities = connector.getAvailableEntities();

    // Prompt for entity selection
    const entityChoices = [
      { name: "All entities", value: null },
      ...availableEntities.map((e: string) => ({ name: e, value: e })),
    ];

    const { entity } = await inquirer.prompt([
      {
        type: "list",
        name: "entity",
        message: "Select entity to sync:",
        choices: entityChoices,
      },
    ]);

    // Prompt for sync mode
    const { syncMode } = await inquirer.prompt([
      {
        type: "list",
        name: "syncMode",
        message: "Select sync mode:",
        choices: [
          {
            name: "Full sync (replace all data)",
            value: "full",
            short: "Full",
          },
          {
            name: "Incremental sync (update changed data only)",
            value: "incremental",
            short: "Incremental",
          },
        ],
      },
    ]);

    // Confirm before proceeding
    console.log("\n📋 Sync Configuration:");
    console.log(
      `   Workspace: ${workspaces.find(w => w.id === workspaceId)?.name}`,
    );
    console.log(`   Source: ${selectedSource.name} (${selectedSource.type})`);
    console.log(
      `   Destination: ${destinations.find((d: { id: string }) => d.id === destinationId)?.name}`,
    );
    console.log(`   Entity: ${entity || "All entities"}`);
    console.log(
      `   Mode: ${syncMode === "incremental" ? "Incremental" : "Full"}`,
    );

    // Show equivalent command
    let command = `pnpm run sync ${dataSourceId} ${destinationId}`;
    if (entity) {
      command += ` ${entity}`;
    }
    if (syncMode === "incremental") {
      command += " --incremental";
    }
    console.log(`\nEquivalent command:\n  $ ${command}\n`);

    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: "Do you want to proceed with this sync?",
        default: true,
      },
    ]);

    if (!confirm) {
      console.log("❌ Sync cancelled by user");
      process.exit(0);
    }

    // Perform the sync
    await runSync(
      dataSourceId,
      destinationId,
      entity || undefined,
      syncMode === "incremental",
    );
  } catch (error) {
    console.error("❌ Interactive mode error:", error);
    process.exit(1);
  }
}

// Create commander program
const program = new Command();

program
  .name("sync")
  .description("Sync data from various sources to destination databases")
  .version("1.0.0")
  .helpOption("-h, --help", "display help for command")
  .argument("[sourceId]", "ID of the data source to sync from")
  .argument("[destinationId]", "ID of the destination database")
  .argument("[entity]", "Specific entity to sync (optional)")
  .option(
    "--incremental, --inc",
    "Perform incremental sync (only sync new/updated records)",
  )
  .option("-i, --interactive", "Run in interactive mode")
  .action(async (sourceId, destinationId, entity, options) => {
    // If no arguments provided or interactive flag is set, run interactive mode
    if ((!sourceId && !destinationId) || options.interactive) {
      await interactiveMode();
    } else if (!sourceId || !destinationId) {
      // Don't show error for help command
      if (!process.argv.includes("--help") && !process.argv.includes("-h")) {
        console.error(
          "❌ Both source and destination IDs are required in non-interactive mode",
        );
        console.log(
          "Use --interactive or -i flag to run in interactive mode.\n",
        );
        process.exit(1);
      }
    } else {
      // Run with provided arguments
      await runSync(sourceId, destinationId, entity, options.incremental);
    }
  })
  .addHelpText(
    "after",
    `
Examples:
  $ pnpm run sync                                    # Interactive mode
  $ pnpm run sync --interactive                      # Force interactive mode
  $ pnpm run sync 60f... 61a...                      # Sync all entities by ID
  $ pnpm run sync <source_id> <dest_id> customers    # Sync specific entity
  $ pnpm run sync <source_id> <dest_id> leads --incremental
  
Available Commands:
  When run without arguments, the tool will guide you through an interactive
  selection process for all options.
  `,
  );

// Parse command line arguments
try {
  program.parse(process.argv);
} catch (error) {
  // Commander throws on help, which is expected
  if (error && (error as any).code === "commander.help") {
    process.exit(0);
  }
  throw error;
}
