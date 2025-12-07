import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { D1StorageAdapter } from '$lib/server/storage/d1-adapter';

export const GET: RequestHandler = async ({ params, url, platform }) => {
  try {
    const { address } = params;
    const network = url.searchParams.get('network');

    if (!network) {
      throw error(400, 'Missing required query parameter: network');
    }

    const db = platform?.env.ESCROWS_DB;
    if (!db) {
      throw error(500, 'Database not configured');
    }

    const storage = new D1StorageAdapter(db);
    const escrow = await storage.getEscrow(address, network);

    if (!escrow) {
      throw error(404, 'Escrow not found');
    }

    // Include email in response (user registered it themselves)
    return json({
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
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    console.error('Error getting escrow:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    throw error(500, message);
  }
};
