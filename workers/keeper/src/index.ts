/**
 * Keeper Worker - Cloudflare Worker that runs on a cron schedule
 * Monitors escrow contracts and triggers execution when conditions are met
 */

import { D1StorageAdapter } from '../../../frontend/src/lib/server/storage/d1-adapter';

interface NetworkConfig {
  name: string;
  factoryAddress: string;
  rpcUrl: string;
}

interface Env {
  ESCROWS_DB: D1Database;
  PRIVATE_KEY: string;
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
 * Build networks array from environment variables
 */
function getNetworksFromEnv(env: Env): NetworkConfig[] {
  const networks: NetworkConfig[] = [];

  // Ethereum (mainnet and sepolia use the same factory)
  const ethereumFactory = env.FACTORY_ADDRESS_ETHEREUM;
  if (ethereumFactory && ethereumFactory !== '0x0000000000000000000000000000000000000000') {
    if (env.MAINNET_RPC_URL) {
      networks.push({
        name: 'mainnet',
        factoryAddress: ethereumFactory,
        rpcUrl: env.MAINNET_RPC_URL,
      });
    }
    if (env.SEPOLIA_RPC_URL) {
      networks.push({
        name: 'sepolia',
        factoryAddress: ethereumFactory,
        rpcUrl: env.SEPOLIA_RPC_URL,
      });
    }
  }

  // Base (mainnet and sepolia use the same factory)
  const baseFactory = env.FACTORY_ADDRESS_BASE;
  if (baseFactory && baseFactory !== '0x0000000000000000000000000000000000000000') {
    if (env.BASE_RPC_URL) {
      networks.push({
        name: 'base',
        factoryAddress: baseFactory,
        rpcUrl: env.BASE_RPC_URL,
      });
    }
    if (env.BASE_SEPOLIA_RPC_URL) {
      networks.push({
        name: 'baseSepolia',
        factoryAddress: baseFactory,
        rpcUrl: env.BASE_SEPOLIA_RPC_URL,
      });
    }
  }

  // Citrea Testnet
  const citreaFactory = env.FACTORY_ADDRESS_CITREA;
  if (citreaFactory && citreaFactory !== '0x0000000000000000000000000000000000000000') {
    if (env.CITREA_RPC_URL) {
      networks.push({
        name: 'citreaTestnet',
        factoryAddress: citreaFactory,
        rpcUrl: env.CITREA_RPC_URL,
      });
    }
  }

  return networks;
}

/**
 * Run keeper check for all networks
 * This is a placeholder - the actual implementation would need:
 * 1. Import or implement runKeeperCheck from workers/shared/keeper/keeper.js
 * 2. Use ethers.js to interact with contracts
 * 3. Check canExecute() for each escrow
 * 4. Call run() on escrows that are ready
 */
async function runKeeperCheck(
  networks: NetworkConfig[],
  storage: D1StorageAdapter,
  privateKey: string,
  fetchFn: typeof fetch
): Promise<{ checked: number; executed: number; errors: number }> {
  console.log(`[${new Date().toISOString()}] Running keeper check for ${networks.length} networks...`);

  // TODO: Implement actual keeper logic
  // This would:
  // 1. Get all escrows from storage
  // 2. For each network, connect to factory contract
  // 3. Get all escrow addresses from factory
  // 4. For each escrow, check canExecute()
  // 5. If canExecute() returns true, call run() on the escrow
  // 6. Update lastEmailSent if email notifications are configured

  console.warn('Keeper check not fully implemented. Requires shared keeper logic from workers/shared/keeper/keeper.js');

  return {
    checked: 0,
    executed: 0,
    errors: 0,
  };
}

/**
 * Scheduled event handler (cron trigger)
 */
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          if (!env.PRIVATE_KEY) {
            console.error('PRIVATE_KEY not configured');
            return;
          }

          if (!env.ESCROWS_DB) {
            console.error('ESCROWS_DB not configured');
            return;
          }

          const storage = new D1StorageAdapter(env.ESCROWS_DB);
          const networks = getNetworksFromEnv(env);

          if (networks.length === 0) {
            console.warn('No networks configured for keeper');
            return;
          }

          const result = await runKeeperCheck(networks, storage, env.PRIVATE_KEY, fetch);
          console.log(
            `[${new Date().toISOString()}] Keeper check completed: ${result.checked} checked, ${result.executed} executed, ${result.errors} errors`
          );
        } catch (error) {
          console.error('Error in keeper scheduled event:', error);
        }
      })()
    );
  },
};
