import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { D1StorageAdapter } from '$lib/server/storage/d1-adapter';

export const POST: RequestHandler = async ({ request, platform }) => {
  try {
    const { escrowAddress, network } = await request.json();

    console.log(`[${new Date().toISOString()}] Received escrow unregistration request:`, {
      escrowAddress,
      network,
    });

    // Validate required fields
    if (!escrowAddress || !network) {
      throw error(400, 'Missing required fields: escrowAddress, network');
    }

    const db = platform?.env.ESCROWS_DB;
    if (!db) {
      throw error(500, 'Database not configured');
    }

    const storage = new D1StorageAdapter(db);

    // Remove escrow from storage
    const removed = await storage.removeEscrow(escrowAddress, network);

    if (!removed) {
      console.log(
        `[${new Date().toISOString()}] Escrow ${escrowAddress} not found in monitoring list for ${network}`
      );
      throw error(404, 'Escrow not found in monitoring list');
    }

    console.log(
      `[${new Date().toISOString()}] Successfully unregistered escrow ${escrowAddress} from monitoring on ${network}`
    );

    return json({
      success: true,
      message: 'Escrow unregistered successfully',
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    console.error('Error unregistering escrow:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    throw error(500, message);
  }
};
