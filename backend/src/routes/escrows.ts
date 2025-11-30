import { Router } from 'express';
import { ethers } from 'ethers';
import {
  addEscrow,
  removeEscrow,
  getEscrow,
  type EscrowMetadata,
} from '../services/escrow-storage.js';
import { createKeeperFromEnv } from '../services/keeper.js';

export const escrowsRouter = Router();

// ABI for HeiraInheritanceEscrow contract (minimal needed for validation)
const ESCROW_ABI = ['function inactivityPeriod() external view returns (uint256)'];

/**
 * Get RPC URL for a network name from dedicated environment variables
 */
function getRpcUrlForNetwork(networkName: string): string | null {
  const rpcMap: Record<string, string> = {
    mainnet: process.env.MAINNET_RPC_URL || '',
    sepolia: process.env.SEPOLIA_RPC_URL || '',
    base: process.env.BASE_RPC_URL || '',
    baseSepolia: process.env.BASE_SEPOLIA_RPC_URL || '',
    citreaTestnet: process.env.CITREA_RPC_URL || '',
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
function getProviderForNetwork(networkName: string): ethers.Provider | null {
  const rpcUrl = getRpcUrlForNetwork(networkName);
  if (!rpcUrl) {
    return null;
  }

  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * POST /api/escrow/register
 * Register a new escrow with the keeper
 */
escrowsRouter.post('/register', async (req, res) => {
  try {
    const { escrowAddress, network, email, inactivityPeriod } = req.body;

    console.log(`[${new Date().toISOString()}] Received escrow registration request:`, {
      escrowAddress,
      network,
      hasEmail: !!email,
      inactivityPeriod,
    });

    // Validate required fields
    if (!escrowAddress || !network) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: escrowAddress, network',
      });
    }

    // Validate email format if provided (skip validation if email is null/empty to allow disabling)
    if (
      email &&
      email !== null &&
      email.trim() !== '' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      });
    }

    // Get provider for network
    const provider = getProviderForNetwork(network);
    if (!provider) {
      const rpcEnvVar = getRpcEnvVarName(network);
      return res.status(400).json({
        success: false,
        message: `Network ${network} not configured. Please set ${rpcEnvVar} environment variable.`,
      });
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
        return res.status(400).json({
          success: false,
          message: 'Invalid escrow address or contract not found',
        });
      }
      // If we can't verify the contract, still allow registration but log a warning
      console.warn(
        `[${new Date().toISOString()}] Could not verify escrow contract ${escrowAddress} on ${network}, but proceeding with registration:`,
        errorMessage
      );
    }

    // Add escrow to storage (regardless of status; the keeper service will check status during monitoring)
    // If email is null or empty string, set to undefined to disable notifications
    const metadata: EscrowMetadata = {
      escrowAddress: escrowAddress.toLowerCase(),
      network,
      email: email && email !== null && email.trim() !== '' ? email.trim() : undefined,
      inactivityPeriod: inactivityPeriodToUse || 0,
      createdAt: Date.now(),
    };

    await addEscrow(metadata);

    console.log(
      `[${new Date().toISOString()}] Successfully registered escrow ${escrowAddress} for monitoring on ${network}`
    );

    return res.json({
      success: true,
      message: 'Escrow registered successfully',
    });
  } catch (error: any) {
    console.error('Error registering escrow:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message,
    });
  }
});

/**
 * POST /api/escrow/unregister
 * Remove an escrow from keeper monitoring
 */
escrowsRouter.post('/unregister', async (req, res) => {
  try {
    const { escrowAddress, network } = req.body;

    console.log(`[${new Date().toISOString()}] Received escrow unregistration request:`, {
      escrowAddress,
      network,
    });

    // Validate required fields
    if (!escrowAddress || !network) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: escrowAddress, network',
      });
    }

    // Remove escrow from storage
    const removed = await removeEscrow(escrowAddress, network);

    if (!removed) {
      console.log(
        `[${new Date().toISOString()}] Escrow ${escrowAddress} not found in monitoring list for ${network}`
      );
      return res.status(404).json({
        success: false,
        message: 'Escrow not found in monitoring list',
      });
    }

    console.log(
      `[${new Date().toISOString()}] Successfully unregistered escrow ${escrowAddress} from monitoring on ${network}`
    );

    return res.json({
      success: true,
      message: 'Escrow unregistered successfully',
    });
  } catch (error: any) {
    console.error('Error unregistering escrow:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message,
    });
  }
});

/**
 * GET /api/escrow/:address
 * Get escrow metadata
 */
escrowsRouter.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { network } = req.query;

    if (!network || typeof network !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Missing required query parameter: network',
      });
    }

    const escrow = await getEscrow(address, network);

    if (!escrow) {
      return res.status(404).json({
        success: false,
        message: 'Escrow not found',
      });
    }

    // Include email in response (user registered it themselves)
    return res.json({
      success: true,
      escrow: {
        escrowAddress: escrow.escrowAddress,
        network: escrow.network,
        email: escrow.email || null,
        inactivityPeriod: escrow.inactivityPeriod,
        createdAt: escrow.createdAt,
        lastEmailSent: escrow.lastEmailSent,
      },
    });
  } catch (error: any) {
    console.error('Error getting escrow:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message,
    });
  }
});
