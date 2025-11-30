/**
 * Heira Keeper Worker - Cron-based worker for monitoring and executing escrows
 * Runs daily at midnight UTC
 */

import { D1StorageAdapter } from "../../shared/storage/d1-adapter.js";
import { runKeeperCheck } from "../../shared/keeper/keeper.js";
import type { NetworkConfig } from "../../shared/types.js";

interface Env {
  DB: D1Database;
  PRIVATE_KEY: string;
  MAILPACE_API_TOKEN: string;
  FACTORY_ADDRESS_ETHEREUM?: string;
  FACTORY_ADDRESS_BASE?: string;
  FACTORY_ADDRESS_CITREA?: string;
  MAINNET_RPC_URL?: string;
  SEPOLIA_RPC_URL?: string;
  BASE_RPC_URL?: string;
  BASE_SEPOLIA_RPC_URL?: string;
  CITREA_RPC_URL?: string;
  KEEPER_CHECK_INTERVAL_MS?: string;
}

/**
 * Create network configurations from environment variables
 */
function createNetworkConfigs(env: Env): NetworkConfig[] {
  const networks: NetworkConfig[] = [];

  // Ethereum (mainnet and sepolia use the same factory)
  const ethereumFactory = env.FACTORY_ADDRESS_ETHEREUM;
  if (
    ethereumFactory &&
    ethereumFactory !== "0x0000000000000000000000000000000000000000"
  ) {
    if (env.MAINNET_RPC_URL) {
      networks.push({
        name: "mainnet",
        factoryAddress: ethereumFactory,
        rpcUrl: env.MAINNET_RPC_URL,
      });
    }
    if (env.SEPOLIA_RPC_URL) {
      networks.push({
        name: "sepolia",
        factoryAddress: ethereumFactory,
        rpcUrl: env.SEPOLIA_RPC_URL,
      });
    }
  }

  // Base (mainnet and sepolia use the same factory)
  const baseFactory = env.FACTORY_ADDRESS_BASE;
  if (
    baseFactory &&
    baseFactory !== "0x0000000000000000000000000000000000000000"
  ) {
    if (env.BASE_RPC_URL) {
      networks.push({
        name: "base",
        factoryAddress: baseFactory,
        rpcUrl: env.BASE_RPC_URL,
      });
    }
    if (env.BASE_SEPOLIA_RPC_URL) {
      networks.push({
        name: "baseSepolia",
        factoryAddress: baseFactory,
        rpcUrl: env.BASE_SEPOLIA_RPC_URL,
      });
    }
  }

  // Citrea Testnet
  const citreaFactory = env.FACTORY_ADDRESS_CITREA;
  if (
    citreaFactory &&
    citreaFactory !== "0x0000000000000000000000000000000000000000"
  ) {
    if (env.CITREA_RPC_URL) {
      networks.push({
        name: "citreaTestnet",
        factoryAddress: citreaFactory,
        rpcUrl: env.CITREA_RPC_URL,
      });
    }
  }

  return networks;
}

export default {
  /**
   * Cron trigger handler - runs daily at midnight UTC
   */
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
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
        "No networks configured. Set FACTORY_ADDRESS_ETHEREUM, FACTORY_ADDRESS_BASE, and/or FACTORY_ADDRESS_CITREA environment variables along with corresponding RPC URLs.",
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
      );

      console.log(
        `Keeper check completed: ${result.checked} checked, ${result.executed} executed, ${result.errors} errors`,
      );
    } catch (error: any) {
      console.error("Error in keeper check:", error);
      throw error; // Re-throw to mark the cron job as failed
    }
  },
};
