import { ethers } from "ethers";
import dotenv from "dotenv";
import {
  getEscrowsByNetwork,
  updateLastEmailSent,
  type EscrowMetadata,
} from "./escrow-storage.js";
import { sendInactivityWarning } from "./email.js";

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
    // RPC URLs are already included in the network config
    for (const network of this.config.networks) {
      if (!network.rpcUrl) {
        console.error(
          `No RPC URL configured for network ${network.name}. Check environment variables.`,
        );
        continue;
      }

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
      const escrowWithSigner = new ethers.Contract(
        escrowAddress,
        ESCROW_ABI,
        signer,
      );
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
   * Check all escrows on a specific network (using managed list from storage)
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

      // Get managed escrows from storage instead of querying factory
      const managedEscrows = await getEscrowsByNetwork(network.name);

      console.log(
        `Checking ${managedEscrows.length} managed escrows on ${network.name}...`,
      );

      for (const escrowMetadata of managedEscrows) {
        await this.checkEscrow(escrowMetadata.escrowAddress, network.name);
        // Small delay between checks to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      console.error(`Error checking network ${network.name}:`, error.message);
    }
  }

  /**
   * Check for escrows approaching inactivity period and send email warnings
   */
  private async checkInactivityWarnings(network: {
    name: string;
    factoryAddress: string;
    rpcUrl: string;
  }): Promise<void> {
    try {
      const provider = this.providers.get(network.name);
      if (!provider) {
        return;
      }

      const managedEscrows = await getEscrowsByNetwork(network.name);
      const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60; // 604800 seconds
      const SIX_DAYS_SECONDS = 6 * 24 * 60 * 60; // 518400 seconds

      console.log(
        `Checking ${managedEscrows.length} escrows for inactivity warnings on ${network.name}`,
      );

      for (const escrowMetadata of managedEscrows) {
        console.log(
          `Processing escrow ${escrowMetadata.escrowAddress} on ${network.name}: email=${escrowMetadata.email || "none"}, lastEmailSent=${escrowMetadata.lastEmailSent || "never"}`,
        );
        // Skip if no email provided
        if (!escrowMetadata.email) {
          console.log(
            `Skipping email check for escrow ${escrowMetadata.escrowAddress} on ${network.name}: no email configured`,
          );
          continue;
        }

        try {
          const escrowContract = new ethers.Contract(
            escrowMetadata.escrowAddress,
            ESCROW_ABI,
            provider,
          );

          // Check contract status - skip if inactive
          const status = await escrowContract.status();
          // Status 0 = Active, Status 1 = Inactive
          const statusNumber = Number(status);
          console.log(
            `Escrow ${escrowMetadata.escrowAddress} on ${network.name} status check: raw=${status}, number=${statusNumber}, type=${typeof status}`,
          );

          if (statusNumber !== 0) {
            console.log(
              `Skipping email check for escrow ${escrowMetadata.escrowAddress} on ${network.name}: contract is inactive (status: ${statusNumber}, expected 0 for Active)`,
            );
            continue;
          }

          console.log(
            `Escrow ${escrowMetadata.escrowAddress} on ${network.name} is Active (status: ${statusNumber}), proceeding with email check`,
          );

          const timeUntilExecution = await escrowContract.getTimeUntilExecution();
          const daysRemaining = Number(timeUntilExecution) / (24 * 60 * 60);

          console.log(
            `Checking email notification for escrow ${escrowMetadata.escrowAddress} on ${network.name}: ${daysRemaining.toFixed(2)} days remaining`,
          );

          // Check if time remaining is <= 7 days and > 0
          if (
            timeUntilExecution > 0 &&
            timeUntilExecution <= BigInt(ONE_WEEK_SECONDS)
          ) {
            // Check if email was already sent
            const shouldSendEmail =
              !escrowMetadata.lastEmailSent ||
              Date.now() - escrowMetadata.lastEmailSent >
              SIX_DAYS_SECONDS * 1000;

            if (!shouldSendEmail && escrowMetadata.lastEmailSent) {
              const daysSinceLastEmail =
                (Date.now() - escrowMetadata.lastEmailSent) / (24 * 60 * 60 * 1000);
              console.log(
                `Skipping email for escrow ${escrowMetadata.escrowAddress} on ${network.name}: email already sent ${daysSinceLastEmail.toFixed(2)} days ago`,
              );
            }

            if (shouldSendEmail) {
              console.log(
                `Sending inactivity warning email for escrow ${escrowMetadata.escrowAddress} on ${network.name} (${daysRemaining.toFixed(1)} days remaining)`,
              );

              try {
                await sendInactivityWarning({
                  to: escrowMetadata.email,
                  escrowAddress: escrowMetadata.escrowAddress,
                  network: network.name,
                  daysRemaining: daysRemaining,
                });

                // Update last email sent timestamp only after successful send
                // This prevents duplicate emails on subsequent checks
                await updateLastEmailSent(
                  escrowMetadata.escrowAddress,
                  network.name,
                  Date.now(),
                );
                console.log(
                  `Updated lastEmailSent timestamp for escrow ${escrowMetadata.escrowAddress}`,
                );
              } catch (emailError: any) {
                console.error(
                  `Failed to send email for escrow ${escrowMetadata.escrowAddress}:`,
                  emailError.message,
                );
                // Don't update timestamp if email failed - will retry on next check
              }
            } else {
              console.log(
                `Email check passed but shouldSendEmail is false for escrow ${escrowMetadata.escrowAddress} on ${network.name}`,
              );
            }
          } else {
            console.log(
              `Skipping email for escrow ${escrowMetadata.escrowAddress} on ${network.name}: time until execution (${daysRemaining.toFixed(2)} days) is not within 7-day warning window`,
            );
          }
        } catch (error: any) {
          console.error(
            `Error checking inactivity warning for escrow ${escrowMetadata.escrowAddress}:`,
            error.message,
          );
        }
      }
    } catch (error: any) {
      console.error(
        `Error checking inactivity warnings for network ${network.name}:`,
        error.message,
      );
    }
  }

  /**
   * Run a single check cycle across all networks
   */
  public async runCheck(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Running keeper check...`);

    for (const network of this.config.networks) {
      // Check for inactivity warnings first
      await this.checkInactivityWarnings(network);
      // Then check for escrows ready to execute
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
 * Uses individual factory address environment variables like the frontend
 */
export function createKeeperFromEnv(): KeeperService | null {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("PRIVATE_KEY not found in environment variables");
    return null;
  }

  // Build networks array from factory address environment variables
  // Format matches frontend: FACTORY_ADDRESS_ETHEREUM, FACTORY_ADDRESS_BASE, FACTORY_ADDRESS_CITREA
  const networks: Array<{
    name: string;
    factoryAddress: string;
    rpcUrl: string;
  }> = [];

  // Ethereum (mainnet and sepolia use the same factory)
  const ethereumFactory = process.env.FACTORY_ADDRESS_ETHEREUM;
  if (ethereumFactory && ethereumFactory !== "0x0000000000000000000000000000000000000000") {
    // Check if we have RPC URLs for both mainnet and sepolia
    if (process.env.MAINNET_RPC_URL) {
      networks.push({
        name: "mainnet",
        factoryAddress: ethereumFactory,
        rpcUrl: process.env.MAINNET_RPC_URL,
      });
    }
    if (process.env.SEPOLIA_RPC_URL) {
      networks.push({
        name: "sepolia",
        factoryAddress: ethereumFactory,
        rpcUrl: process.env.SEPOLIA_RPC_URL,
      });
    }
  }

  // Base (mainnet and sepolia use the same factory)
  const baseFactory = process.env.FACTORY_ADDRESS_BASE;
  if (baseFactory && baseFactory !== "0x0000000000000000000000000000000000000000") {
    // Check if we have RPC URLs for both Base mainnet and Base Sepolia
    if (process.env.BASE_RPC_URL) {
      networks.push({
        name: "base",
        factoryAddress: baseFactory,
        rpcUrl: process.env.BASE_RPC_URL,
      });
    }
    if (process.env.BASE_SEPOLIA_RPC_URL) {
      networks.push({
        name: "baseSepolia",
        factoryAddress: baseFactory,
        rpcUrl: process.env.BASE_SEPOLIA_RPC_URL,
      });
    }
  }

  // Citrea Testnet
  const citreaFactory = process.env.FACTORY_ADDRESS_CITREA;
  if (citreaFactory && citreaFactory !== "0x0000000000000000000000000000000000000000") {
    if (process.env.CITREA_RPC_URL) {
      networks.push({
        name: "citreaTestnet",
        factoryAddress: citreaFactory,
        rpcUrl: process.env.CITREA_RPC_URL,
      });
    }
  }

  if (networks.length === 0) {
    console.error(
      "No networks configured. Set FACTORY_ADDRESS_ETHEREUM, FACTORY_ADDRESS_BASE, and/or FACTORY_ADDRESS_CITREA environment variables along with corresponding RPC URLs.",
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
