import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

// ABI for InheritanceEscrow contract (minimal needed for keeper)
const ESCROW_ABI = [
  "function canExecute() external view returns (bool)",
  "function run() external",
  "function status() external view returns (uint8)",
  "function getTimeUntilExecution() external view returns (uint256)",
];

// ABI for InheritanceEscrowFactory contract
const FACTORY_ABI = [
  "function getAllEscrows() external view returns (address[])",
  "function getEscrowCount() external view returns (uint256)",
];

interface KeeperConfig {
  factoryAddress: string;
  rpcUrl: string;
  privateKey: string;
  checkIntervalMs: number;
  networks: Array<{
    name: string;
    factoryAddress: string;
    rpcUrl: string;
  }>;
}

export class KeeperService {
  private config: KeeperConfig;
  private providers: Map<string, ethers.Provider> = new Map();
  private signers: Map<string, ethers.Wallet> = new Map();
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config: KeeperConfig) {
    this.config = config;
    this.initializeProviders();
  }

  private initializeProviders() {
    // Initialize provider and signer for each network
    for (const network of this.config.networks) {
      const provider = new ethers.JsonRpcProvider(network.rpcUrl);
      const wallet = new ethers.Wallet(this.config.privateKey, provider);
      this.providers.set(network.name, provider);
      this.signers.set(network.name, wallet);
    }
  }

  /**
   * Check a single escrow contract to see if it can be executed
   */
  private async checkEscrow(
    escrowAddress: string,
    networkName: string,
  ): Promise<{ canExecute: boolean; executed: boolean; error?: string }> {
    try {
      const provider = this.providers.get(networkName);
      const signer = this.signers.get(networkName);

      if (!provider || !signer) {
        return {
          canExecute: false,
          executed: false,
          error: `Provider or signer not found for network ${networkName}`,
        };
      }

      const escrowContract = new ethers.Contract(
        escrowAddress,
        ESCROW_ABI,
        provider,
      );
      const canExecute = await escrowContract.canExecute();

      if (!canExecute) {
        const timeUntilExecution = await escrowContract.getTimeUntilExecution();
        console.log(
          `Escrow ${escrowAddress} on ${networkName}: Not ready (${timeUntilExecution}s remaining)`,
        );
        return { canExecute: false, executed: false };
      }

      // Execute the escrow
      console.log(`Executing escrow ${escrowAddress} on ${networkName}...`);
      const escrowWithSigner = escrowContract.connect(signer);
      const tx = await escrowWithSigner.run();
      console.log(`Transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(
        `Escrow ${escrowAddress} executed successfully. Tx: ${receipt.hash}`,
      );

      return { canExecute: true, executed: true };
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      console.error(
        `Error checking escrow ${escrowAddress} on ${networkName}:`,
        errorMessage,
      );

      // Check if it's already been executed or is inactive
      if (
        errorMessage.includes("Execution conditions not met") ||
        errorMessage.includes("Contract is inactive") ||
        errorMessage.includes("No beneficiaries configured")
      ) {
        return { canExecute: false, executed: false };
      }

      return { canExecute: false, executed: false, error: errorMessage };
    }
  }

  /**
   * Check all escrows on a specific network
   */
  private async checkNetwork(network: {
    name: string;
    factoryAddress: string;
    rpcUrl: string;
  }) {
    try {
      const provider = this.providers.get(network.name);
      if (!provider) {
        console.error(`Provider not found for network ${network.name}`);
        return;
      }

      const factoryContract = new ethers.Contract(
        network.factoryAddress,
        FACTORY_ABI,
        provider,
      );
      const escrowAddresses = await factoryContract.getAllEscrows();

      console.log(
        `Checking ${escrowAddresses.length} escrows on ${network.name}...`,
      );

      for (const escrowAddress of escrowAddresses) {
        await this.checkEscrow(escrowAddress, network.name);
        // Small delay between checks to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      console.error(`Error checking network ${network.name}:`, error.message);
    }
  }

  /**
   * Run a single check cycle across all networks
   */
  public async runCheck(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Running keeper check...`);

    for (const network of this.config.networks) {
      await this.checkNetwork(network);
    }

    console.log(`[${new Date().toISOString()}] Keeper check completed.`);
  }

  /**
   * Start the keeper service with periodic checks
   */
  public start(): void {
    if (this.isRunning) {
      console.warn("Keeper service is already running");
      return;
    }

    this.isRunning = true;
    console.log(
      `Starting keeper service (check interval: ${this.config.checkIntervalMs}ms)`,
    );

    // Run initial check immediately
    this.runCheck().catch((error) => {
      console.error("Error in initial keeper check:", error);
    });

    // Set up periodic checks
    this.intervalId = setInterval(() => {
      this.runCheck().catch((error) => {
        console.error("Error in periodic keeper check:", error);
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

    console.log("Keeper service stopped");
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
      networks: this.config.networks.map((n) => n.name),
    };
  }
}

/**
 * Create keeper service from environment variables
 */
export function createKeeperFromEnv(): KeeperService | null {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("PRIVATE_KEY not found in environment variables");
    return null;
  }

  // Parse networks from environment
  // Format: NETWORKS=network1:factory1:rpc1,network2:factory2:rpc2
  const networksEnv = process.env.KEEPER_NETWORKS || "";
  const networks = networksEnv
    .split(",")
    .filter((n) => n.trim())
    .map((networkStr) => {
      const [name, factoryAddress, rpcUrl] = networkStr.split(":");
      return {
        name: name.trim(),
        factoryAddress: factoryAddress.trim(),
        rpcUrl: rpcUrl.trim(),
      };
    });

  if (networks.length === 0) {
    console.error(
      "No networks configured. Set KEEPER_NETWORKS environment variable.",
    );
    return null;
  }

  const checkIntervalMs = parseInt(
    process.env.KEEPER_CHECK_INTERVAL_MS || "300000",
    10,
  ); // Default 5 minutes

  return new KeeperService({
    factoryAddress: "", // Not used when networks are specified
    rpcUrl: "", // Not used when networks are specified
    privateKey,
    checkIntervalMs,
    networks,
  });
}
