// Heira Keeper Worker - Cron-based worker for monitoring and executing escrows
// Runs daily at midnight UTC
// Note: ethers needs to be imported at top level for keeper.js
// D1StorageAdapter, runKeeperCheck are available from concatenated files

// Create network configurations from environment variables
function createNetworkConfigs(env) {
  const networks = [];

  // Ethereum Sepolia
  const ethSepoliaFactory = env.FACTORY_ADDRESS_ETH_SEPOLIA;
  if (
    ethSepoliaFactory &&
    ethSepoliaFactory !== "0x0000000000000000000000000000000000000000"
  ) {
    if (env.ETH_SEPOLIA_RPC_URL) {
      networks.push({
        name: "eth-sepolia",
        factoryAddress: ethSepoliaFactory,
        rpcUrl: env.ETH_SEPOLIA_RPC_URL,
      });
    }
  }

  // Ethereum Mainnet (uses same factory as sepolia for now, can be separate later)
  if (
    ethSepoliaFactory &&
    ethSepoliaFactory !== "0x0000000000000000000000000000000000000000"
  ) {
    if (env.ETH_MAINNET_RPC_URL) {
      networks.push({
        name: "eth-mainnet",
        factoryAddress: ethSepoliaFactory,
        rpcUrl: env.ETH_MAINNET_RPC_URL,
      });
    }
  }

  // Base Sepolia
  const baseSepoliaFactory = env.FACTORY_ADDRESS_BASE_SEPOLIA;
  if (
    baseSepoliaFactory &&
    baseSepoliaFactory !== "0x0000000000000000000000000000000000000000"
  ) {
    if (env.BASE_SEPOLIA_RPC_URL) {
      networks.push({
        name: "base-sepolia",
        factoryAddress: baseSepoliaFactory,
        rpcUrl: env.BASE_SEPOLIA_RPC_URL,
      });
    }
  }

  // Base Mainnet (uses same factory as sepolia for now, can be separate later)
  if (
    baseSepoliaFactory &&
    baseSepoliaFactory !== "0x0000000000000000000000000000000000000000"
  ) {
    if (env.BASE_RPC_URL) {
      networks.push({
        name: "base-mainnet",
        factoryAddress: baseSepoliaFactory,
        rpcUrl: env.BASE_RPC_URL,
      });
    }
  }

  // Citrea Testnet
  const citreaFactory = env.FACTORY_ADDRESS_CITREA_TESTNET;
  if (
    citreaFactory &&
    citreaFactory !== "0x0000000000000000000000000000000000000000"
  ) {
    if (env.CITREA_TESTNET_RPC_URL) {
      networks.push({
        name: "citrea-testnet",
        factoryAddress: citreaFactory,
        rpcUrl: env.CITREA_TESTNET_RPC_URL,
      });
    }
  }

  return networks;
}

export default {
  /**
   * Cron trigger handler - runs daily at midnight UTC
   */
  async scheduled(event, env, ctx) {
    console.log(`[${new Date().toISOString()}] Keeper cron triggered`);

    // Validate required environment variables
    if (!env.PRIVATE_KEY) {
      console.error("PRIVATE_KEY not found in environment variables");
      return;
    }

    if (!env.DB) {
      console.error("D1 database not configured");
      return;
    }

    // Create network configurations
    const networks = createNetworkConfigs(env);

    if (networks.length === 0) {
      console.error(
        "No networks configured. Set FACTORY_ADDRESS_ETH_SEPOLIA, FACTORY_ADDRESS_BASE_SEPOLIA, and/or FACTORY_ADDRESS_CITREA_TESTNET environment variables along with corresponding RPC URLs.",
      );
      return;
    }

    // Create storage adapter
    const storage = new D1StorageAdapter(env.DB);

    try {
      // Run keeper check
      const result = await runKeeperCheck(
        networks,
        storage,
        env.PRIVATE_KEY,
        fetch,
        env.MAILPACE_API_TOKEN,
        env.MAILPACE_FROM_EMAIL || "noreply@heira.app",
      );

      console.log(
        `Keeper check completed: ${result.checked} checked, ${result.executed} executed, ${result.errors} errors`,
      );
    } catch (error) {
      console.error("Error in keeper check:", error);
      throw error; // Re-throw to mark the cron job as failed
    }
  },
};
