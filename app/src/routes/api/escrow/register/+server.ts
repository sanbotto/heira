import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { D1StorageAdapter } from '$lib/server/storage/d1-adapter';
import { ethers } from 'ethers';

// ABI for HeiraInheritanceEscrow contract (minimal needed for validation)
const ESCROW_ABI = ['function inactivityPeriod() external view returns (uint256)'];

/**
 * Get RPC URL for a network name from environment variables
 */
function getRpcUrlForNetwork(networkName: string, env: Record<string, string>): string | null {
  const rpcMap: Record<string, string> = {
    mainnet: env.MAINNET_RPC_URL || '',
    sepolia: env.SEPOLIA_RPC_URL || '',
    base: env.BASE_RPC_URL || '',
    baseSepolia: env.BASE_SEPOLIA_RPC_URL || '',
    citreaTestnet: env.CITREA_RPC_URL || '',
  };

  return rpcMap[networkName] || null;
}

/**
 * Get the environment variable name for a network's RPC URL
 */
function getRpcEnvVarName(networkName: string): string {
  const envVarMap: Record<string, string> = {
    mainnet: 'MAINNET_RPC_URL',
    sepolia: 'SEPOLIA_RPC_URL',
    base: 'BASE_RPC_URL',
    baseSepolia: 'BASE_SEPOLIA_RPC_URL',
    citreaTestnet: 'CITREA_RPC_URL',
  };

  return envVarMap[networkName] || 'RPC_URL';
}

/**
 * Get provider for a network name
 */
function getProviderForNetwork(networkName: string, env: Record<string, string>): ethers.Provider | null {
  const rpcUrl = getRpcUrlForNetwork(networkName, env);
  if (!rpcUrl) {
    return null;
  }

  return new ethers.JsonRpcProvider(rpcUrl);
}

export const POST: RequestHandler = async ({ request, platform }) => {
  try {
    const { escrowAddress, network, email, inactivityPeriod } = await request.json();

    console.log(`[${new Date().toISOString()}] Received escrow registration request:`, {
      escrowAddress,
      network,
      hasEmail: !!email,
      inactivityPeriod,
    });

    // Validate required fields
    if (!escrowAddress || !network) {
      throw error(400, 'Missing required fields: escrowAddress, network');
    }

    // Validate email format if provided (skip validation if email is null/empty to allow disabling)
    if (
      email &&
      email !== null &&
      email.trim() !== '' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw error(400, 'Invalid email format');
    }

    const env = (platform?.env || {}) as Record<string, string>;
    const db = platform?.env.ESCROWS_DB;
    if (!db) {
      throw error(500, 'Database not configured');
    }

    const storage = new D1StorageAdapter(db);

    // Get provider for network
    const provider = getProviderForNetwork(network, env);
    if (!provider) {
      const rpcEnvVar = getRpcEnvVarName(network);
      throw error(400, `Network ${network} not configured. Please set ${rpcEnvVar} environment variable.`);
    }

    // Validate escrow exists on-chain
    let inactivityPeriodToUse = inactivityPeriod;
    try {
      const escrowContract = new ethers.Contract(escrowAddress, ESCROW_ABI, provider);

      // Try to get inactivity period from contract if not provided
      // This also validates that the contract exists
      if (!inactivityPeriodToUse) {
        try {
          const contractInactivityPeriod = await escrowContract.inactivityPeriod();
          inactivityPeriodToUse = Number(contractInactivityPeriod);
        } catch (error) {
          // If we can't get inactivity period, use 0 as fallback
          inactivityPeriodToUse = 0;
        }
      }
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      if (errorMessage.includes('invalid address') || errorMessage.includes('call revert')) {
        throw error(400, 'Invalid escrow address or contract not found');
      }
      // If we can't verify the contract, still allow registration but log a warning
      console.warn(
        `[${new Date().toISOString()}] Could not verify escrow contract ${escrowAddress} on ${network}, but proceeding with registration:`,
        errorMessage
      );
    }

    // Add escrow to storage (regardless of status; the keeper service will check status during monitoring)
    // If email is null or empty string, set to undefined to disable notifications
    const metadata = {
      escrowAddress: escrowAddress.toLowerCase(),
      network,
      email: email && email !== null && email.trim() !== '' ? email.trim() : undefined,
      inactivityPeriod: inactivityPeriodToUse || 0,
      createdAt: Date.now(),
    };

    await storage.addEscrow(metadata);

    console.log(
      `[${new Date().toISOString()}] Successfully registered escrow ${escrowAddress} for monitoring on ${network}`
    );

    return json({
      success: true,
      message: 'Escrow registered successfully',
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    console.error('Error registering escrow:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    throw error(500, message);
  }
};
