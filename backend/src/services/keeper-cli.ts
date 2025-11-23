import { createKeeperFromEnv } from "./keeper.js";

/**
 * CLI entry point for keeper service
 * Run this as a standalone process to start the keeper
 */
async function main() {
  console.log("Starting Heira Keeper Service...");

  const keeper = createKeeperFromEnv();
  if (!keeper) {
    console.error(
      "Failed to initialize keeper service. Check your environment variables.",
    );
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nReceived SIGINT, shutting down gracefully...");
    keeper.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nReceived SIGTERM, shutting down gracefully...");
    keeper.stop();
    process.exit(0);
  });

  // Start the keeper
  keeper.start();

  // Keep the process alive
  console.log("Keeper service is running. Press Ctrl+C to stop.");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
