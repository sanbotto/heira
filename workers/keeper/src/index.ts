/**
 * Keeper Worker - Cloudflare Worker that runs on a cron schedule
 * Monitors escrow contracts and triggers execution when conditions are met
 */

import { ethers } from 'ethers';
import type { D1Database, ScheduledEvent, ExecutionContext } from '@cloudflare/workers-types';
import { D1StorageAdapter } from './d1-adapter';

// ABI for InheritanceEscrow contract (minimal needed for keeper)
const ESCROW_ABI = [
  'function canExecute() external view returns (bool)',
  'function run() external',
  'function status() external view returns (uint8)',
  'function getTimeUntilExecution() external view returns (uint256)',
];

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
  CITREA_TESTNET_RPC_URL?: string;
  KEEPER_CHECK_INTERVAL_MS?: string;
  MAILPACE_API_TOKEN?: string;
  MAILPACE_FROM_EMAIL?: string;
}

/**
 * Build networks array from environment variables
 */
function getNetworksFromEnv(env: Env): NetworkConfig[] {
  const networks: NetworkConfig[] = [];

  // Ethereum (mainnet and sepolia use the same factory)
  const ethereumFactory = env.FACTORY_ADDRESS_ETHEREUM;
  if (ethereumFactory && ethereumFactory !== '0x0000000000000000000000000000000000000000') {
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
    if (env.CITREA_TESTNET_RPC_URL) {
      networks.push({
        name: 'citreaTestnet',
        factoryAddress: citreaFactory,
        rpcUrl: env.CITREA_TESTNET_RPC_URL,
      });
    }
  }

  return networks;
}

/**
 * Send inactivity warning email using MailPace API
 */
async function sendInactivityWarning(
  params: {
    to: string;
    escrowAddress: string;
    network: string;
    daysRemaining: number;
  },
  env: Env
): Promise<void> {
  const apiToken = env.MAILPACE_API_TOKEN;
  const fromEmail = env.MAILPACE_FROM_EMAIL || 'noreply@heira.app';

  if (!apiToken) {
    console.warn('MAILPACE_API_TOKEN not configured, skipping email');
    return;
  }

  const subject = `Heira Escrow Inactivity Warning - ${params.daysRemaining.toFixed(1)} days remaining`;
  const body = `
Your Heira escrow contract is approaching its execution date.

Escrow Address: ${params.escrowAddress}
Network: ${params.network}
Days Remaining: ${params.daysRemaining.toFixed(1)}

If you do not interact with your wallet before the inactivity period expires, the escrow will automatically execute and transfer funds to your designated beneficiaries.

To prevent automatic execution, simply make any transaction from your monitored wallet address.

For more information, visit your escrow dashboard.
  `.trim();

  const response = await fetch('https://app.mailpace.com/api/v1/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'MailPace-Server-Token': apiToken,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: params.to,
      subject,
      htmlbody: body.replace(/\n/g, '<br>'),
      textbody: body,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MailPace API error: ${response.status} ${errorText}`);
  }
}

/**
 * Check a single escrow contract to see if it can be executed
 */
async function checkEscrow(
  escrowAddress: string,
  networkName: string,
  provider: ethers.Provider,
  signer: ethers.Wallet
): Promise<{ canExecute: boolean; executed: boolean; error?: string }> {
  try {
    const escrowContract = new ethers.Contract(escrowAddress, ESCROW_ABI, provider);
    const canExecute = await escrowContract.canExecute();

    if (!canExecute) {
      const timeUntilExecution = await escrowContract.getTimeUntilExecution();
      console.log(
        `Escrow ${escrowAddress} on ${networkName}: Not ready (${timeUntilExecution}s remaining)`
      );
      return { canExecute: false, executed: false };
    }

    // Execute the escrow
    console.log(`Executing escrow ${escrowAddress} on ${networkName}...`);
    const escrowWithSigner = new ethers.Contract(escrowAddress, ESCROW_ABI, signer);
    const tx = await escrowWithSigner.run();
    console.log(`Transaction sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`Escrow ${escrowAddress} executed successfully. Tx: ${receipt.hash}`);

    return { canExecute: true, executed: true };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    console.error(`Error checking escrow ${escrowAddress} on ${networkName}:`, errorMessage);

    // Check if it's already been executed or is inactive
    if (
      errorMessage.includes('Execution conditions not met') ||
      errorMessage.includes('Contract is inactive') ||
      errorMessage.includes('No beneficiaries configured')
    ) {
      return { canExecute: false, executed: false };
    }

    return { canExecute: false, executed: false, error: errorMessage };
  }
}

/**
 * Check for escrows approaching inactivity period and send email warnings
 */
async function checkInactivityWarnings(
  network: NetworkConfig,
  storage: D1StorageAdapter,
  provider: ethers.Provider,
  env: Env
): Promise<void> {
  try {
    const managedEscrows = await storage.getEscrowsByNetwork(network.name);
    const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60;
    const SIX_DAYS_SECONDS = 6 * 24 * 60 * 60;

    console.log(
      `Checking ${managedEscrows.length} escrows for inactivity warnings on ${network.name}`
    );

    for (const escrowMetadata of managedEscrows) {
      // Skip if no email provided
      if (!escrowMetadata.email) {
        continue;
      }

      try {
        const escrowContract = new ethers.Contract(escrowMetadata.escrowAddress, ESCROW_ABI, provider);

        // Check contract status - skip if inactive
        const status = await escrowContract.status();
        const statusNumber = Number(status);

        if (statusNumber !== 0) {
          // Status 0 = Active, Status 1 = Inactive
          continue;
        }

        const timeUntilExecution = await escrowContract.getTimeUntilExecution();
        const daysRemaining = Number(timeUntilExecution) / (24 * 60 * 60);

        // Check if time remaining is <= 7 days and > 0
        if (timeUntilExecution > 0 && timeUntilExecution <= BigInt(ONE_WEEK_SECONDS)) {
          // Check if email was already sent
          const shouldSendEmail =
            !escrowMetadata.lastEmailSent ||
            Date.now() - escrowMetadata.lastEmailSent > SIX_DAYS_SECONDS * 1000;

          if (shouldSendEmail) {
            console.log(
              `Sending inactivity warning email for escrow ${escrowMetadata.escrowAddress} on ${network.name} (${daysRemaining.toFixed(1)} days remaining)`
            );

            try {
              await sendInactivityWarning(
                {
                  to: escrowMetadata.email,
                  escrowAddress: escrowMetadata.escrowAddress,
                  network: network.name,
                  daysRemaining: daysRemaining,
                },
                env
              );

              // Update last email sent timestamp only after successful send
              await storage.updateLastEmailSent(
                escrowMetadata.escrowAddress,
                network.name,
                Date.now()
              );
              console.log(
                `Updated lastEmailSent timestamp for escrow ${escrowMetadata.escrowAddress}`
              );
            } catch (emailError: any) {
              console.error(
                `Failed to send email for escrow ${escrowMetadata.escrowAddress}:`,
                emailError.message
              );
              // Don't update timestamp if email failed - will retry on next check
            }
          }
        }
      } catch (error: any) {
        console.error(
          `Error checking inactivity warning for escrow ${escrowMetadata.escrowAddress}:`,
          error.message
        );
      }
    }
  } catch (error: any) {
    console.error(`Error checking inactivity warnings for network ${network.name}:`, error.message);
  }
}

/**
 * Check all escrows on a specific network
 */
async function checkNetwork(
  network: NetworkConfig,
  storage: D1StorageAdapter,
  provider: ethers.Provider,
  signer: ethers.Wallet
): Promise<{ checked: number; executed: number; errors: number }> {
  let checked = 0;
  let executed = 0;
  let errors = 0;

  try {
    // Get managed escrows from storage
    const managedEscrows = await storage.getEscrowsByNetwork(network.name);

    console.log(`Checking ${managedEscrows.length} managed escrows on ${network.name}...`);

    for (const escrowMetadata of managedEscrows) {
      checked++;
      const result = await checkEscrow(escrowMetadata.escrowAddress, network.name, provider, signer);

      if (result.executed) {
        executed++;
      }
      if (result.error) {
        errors++;
      }

      // Small delay between checks to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error: any) {
    console.error(`Error checking network ${network.name}:`, error.message);
    errors++;
  }

  return { checked, executed, errors };
}

/**
 * Run keeper check for all networks
 */
async function runKeeperCheck(
  networks: NetworkConfig[],
  storage: D1StorageAdapter,
  privateKey: string,
  env: Env
): Promise<{ checked: number; executed: number; errors: number }> {
  console.log(`[${new Date().toISOString()}] Running keeper check for ${networks.length} networks...`);

  let totalChecked = 0;
  let totalExecuted = 0;
  let totalErrors = 0;

  for (const network of networks) {
    try {
      const provider = new ethers.JsonRpcProvider(network.rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);

      // Check for inactivity warnings first
      await checkInactivityWarnings(network, storage, provider, env);

      // Then check for escrows ready to execute
      const result = await checkNetwork(network, storage, provider, wallet);
      totalChecked += result.checked;
      totalExecuted += result.executed;
      totalErrors += result.errors;
    } catch (error: any) {
      console.error(`Error processing network ${network.name}:`, error.message);
      totalErrors++;
    }
  }

  return {
    checked: totalChecked,
    executed: totalExecuted,
    errors: totalErrors,
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

          const result = await runKeeperCheck(networks, storage, env.PRIVATE_KEY, env);
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
