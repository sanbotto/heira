import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getExplorerUrl } from '$lib/server/networks';
import { VALID_NETWORKS } from '$lib/server/constants';

async function checkVerificationStatus(
  escrowAddress: string,
  network: string,
  fetchFn: typeof fetch
): Promise<boolean> {
  try {
    const explorerUrl = getExplorerUrl(network, escrowAddress);
    // Try to fetch contract page - if it exists and has verified badge, it's verified
    // This is a simplified check - in production you'd use the explorer API
    const response = await fetchFn(explorerUrl);
    if (response.ok) {
      const html = await response.text();
      // Simple check for verification indicators (this is basic, real implementation would use API)
      return html.includes('Verified') || html.includes('Contract');
    }
    return false;
  } catch {
    return false;
  }
}

async function verifyEscrowWithBlockscout(
  verifyRequest: {
    escrowAddress: string;
    mainWallet: string;
    inactivityPeriod: number;
    owner: string;
    network: string;
  },
  standardJsonInput: string,
  apiKey: string | undefined,
  fetchFn: typeof fetch
): Promise<{ success: boolean; message: string; explorerUrl?: string }> {
  // This is a placeholder - the actual implementation would need the shared verification code
  // For now, return an error indicating the feature needs the shared code
  return {
    success: false,
    message: 'Verification requires shared verification code. Please implement or import from workers/shared/verification/blockscout.js',
  };
}

/**
 * Load Standard JSON Input from build artifacts
 * Note: In Cloudflare Pages, we can't access local filesystem
 * This would need to be bundled or stored differently
 */
async function loadStandardJsonInput(): Promise<string> {
  // In Cloudflare Pages, we can't read from local filesystem
  // The standard JSON input would need to be:
  // 1. Bundled into the deployment
  // 2. Stored in a database/object store
  // 3. Loaded from a URL
  // For now, return empty string
  console.warn('Standard JSON Input not available in Cloudflare Pages environment');
  return '';
}

export const POST: RequestHandler = async ({ request, platform }) => {
  try {
    const { escrowAddress, mainWallet, inactivityPeriod, owner, network } = await request.json();

    if (!escrowAddress || !mainWallet || inactivityPeriod === undefined || !owner || !network) {
      throw error(400, 'Missing required fields: escrowAddress, mainWallet, inactivityPeriod, owner, network');
    }

    if (!VALID_NETWORKS.includes(network as any)) {
      throw error(400, `Invalid network. Must be one of: ${VALID_NETWORKS.join(', ')}`);
    }

    // Load Standard JSON Input
    const standardJsonInput = await loadStandardJsonInput();

    if (!standardJsonInput) {
      throw error(500, 'Standard JSON Input not available. Please ensure contracts are compiled and accessible.');
    }

    // Check if already verified
    const isVerified = await checkVerificationStatus(escrowAddress, network, fetch);
    if (isVerified) {
      return json({
        success: true,
        message: 'Contract is already verified',
        explorerUrl: getExplorerUrl(network, escrowAddress),
        alreadyVerified: true,
      });
    }

    const env = (platform?.env || {}) as Record<string, string>;
    const apiKey = env.BLOCKSCOUT_API_KEY;

    // Verify with Blockscout
    const verifyRequest = {
      escrowAddress,
      mainWallet,
      inactivityPeriod: typeof inactivityPeriod === 'string' ? parseInt(inactivityPeriod) : inactivityPeriod,
      owner,
      network,
    };

    const result = await verifyEscrowWithBlockscout(verifyRequest, standardJsonInput, apiKey, fetch);

    if (!result.success) {
      throw error(500, result.message);
    }

    return json({
      ...result,
      explorerUrl: getExplorerUrl(network, escrowAddress),
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    console.error('Verification API error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    throw error(500, message);
  }
};
