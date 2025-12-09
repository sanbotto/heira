import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { D1StorageAdapter } from '$lib/server/storage/d1-adapter';
import { ethers } from 'ethers';
import {
  getRpcUrlForNetwork,
  getRpcEnvVarName,
  getProviderForNetwork,
} from '$lib/server/networks';
import { ESCROW_VALIDATION_ABI } from '$lib/server/constants';

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
    const provider = getProviderForNetwork(network, env, ethers);
    if (!provider) {
      const rpcEnvVar = getRpcEnvVarName(network);
      throw error(400, `Network ${network} not configured. Please set ${rpcEnvVar} environment variable.`);
    }

    // Validate escrow exists on-chain
    let inactivityPeriodToUse = inactivityPeriod;
    try {
      const escrowContract = new ethers.Contract(escrowAddress, ESCROW_VALIDATION_ABI, provider);

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
