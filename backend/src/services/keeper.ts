/**
 * Keeper service that uses shared keeper logic
 */

import dotenv from 'dotenv';
import { runKeeperCheck } from '../../../workers/shared/keeper/keeper.js';
import { FileStorageAdapter } from '../../../workers/shared/storage/file-adapter.js';
import type { NetworkConfig } from '../../../workers/shared/types.js';

dotenv.config();

interface KeeperConfig {
  privateKey: string;
  checkIntervalMs: number;
  networks: NetworkConfig[];
}

export class KeeperService {
  private config: KeeperConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private storage: FileStorageAdapter;

  constructor(config: KeeperConfig) {
    this.config = config;
    this.storage = new FileStorageAdapter();
  }

  /**
   * Run a single check cycle across all networks
   */
  public async runCheck(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Running keeper check...`);

    try {
      const result = await runKeeperCheck(
        this.config.networks,
        this.storage,
        this.config.privateKey,
        fetch
      );
      console.log(`[${new Date().toISOString()}] Keeper check completed.`);
      console.log(
        `Results: ${result.checked} checked, ${result.executed} executed, ${result.errors} errors`
      );
    } catch (error: any) {
      console.error('Error in keeper check:', error);
      throw error;
    }
  }

  /**
   * Start the keeper service with periodic checks
   */
  public start(): void {
    if (this.isRunning) {
      console.warn('Keeper service is already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting keeper service (check interval: ${this.config.checkIntervalMs}ms)`);

    // Run initial check immediately
    this.runCheck().catch(error => {
      console.error('Error in initial keeper check:', error);
    });

    // Set up periodic checks
    this.intervalId = setInterval(() => {
      this.runCheck().catch(error => {
        console.error('Error in periodic keeper check:', error);
      });
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop the keeper service
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('Keeper service stopped');
  }

  /**
   * Get the current status of the keeper service
   */
  public getStatus(): {
    isRunning: boolean;
    checkIntervalMs: number;
    networks: string[];
  } {
    return {
      isRunning: this.isRunning,
      checkIntervalMs: this.config.checkIntervalMs,
      networks: this.config.networks.map(n => n.name),
    };
  }
}

/**
 * Create keeper service from environment variables
 */
export function createKeeperFromEnv(): KeeperService | null {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('PRIVATE_KEY not found in environment variables');
    return null;
  }

  // Build networks array from factory address environment variables
  const networks: NetworkConfig[] = [];

  // Ethereum (mainnet and sepolia use the same factory)
  const ethereumFactory = process.env.FACTORY_ADDRESS_ETHEREUM;
  if (ethereumFactory && ethereumFactory !== '0x0000000000000000000000000000000000000000') {
    if (process.env.MAINNET_RPC_URL) {
      networks.push({
        name: 'mainnet',
        factoryAddress: ethereumFactory,
        rpcUrl: process.env.MAINNET_RPC_URL,
      });
    }
    if (process.env.SEPOLIA_RPC_URL) {
      networks.push({
        name: 'sepolia',
        factoryAddress: ethereumFactory,
        rpcUrl: process.env.SEPOLIA_RPC_URL,
      });
    }
  }

  // Base (mainnet and sepolia use the same factory)
  const baseFactory = process.env.FACTORY_ADDRESS_BASE;
  if (baseFactory && baseFactory !== '0x0000000000000000000000000000000000000000') {
    if (process.env.BASE_RPC_URL) {
      networks.push({
        name: 'base',
        factoryAddress: baseFactory,
        rpcUrl: process.env.BASE_RPC_URL,
      });
    }
    if (process.env.BASE_SEPOLIA_RPC_URL) {
      networks.push({
        name: 'baseSepolia',
        factoryAddress: baseFactory,
        rpcUrl: process.env.BASE_SEPOLIA_RPC_URL,
      });
    }
  }

  // Citrea Testnet
  const citreaFactory = process.env.FACTORY_ADDRESS_CITREA;
  if (citreaFactory && citreaFactory !== '0x0000000000000000000000000000000000000000') {
    if (process.env.CITREA_RPC_URL) {
      networks.push({
        name: 'citreaTestnet',
        factoryAddress: citreaFactory,
        rpcUrl: process.env.CITREA_RPC_URL,
      });
    }
  }

  if (networks.length === 0) {
    console.error(
      'No networks configured. Set FACTORY_ADDRESS_ETHEREUM, FACTORY_ADDRESS_BASE, and/or FACTORY_ADDRESS_CITREA environment variables along with corresponding RPC URLs.'
    );
    return null;
  }

  const checkIntervalMs = parseInt(process.env.KEEPER_CHECK_INTERVAL_MS || '300000', 10); // Default 5 minutes

  return new KeeperService({
    privateKey,
    checkIntervalMs,
    networks,
  });
}
