import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import {
  verifyEscrowWithBlockscout,
  checkVerificationStatus,
} from '../../../workers/shared/verification/blockscout.js';
import { VALID_NETWORKS, getExplorerUrl } from '../../../workers/shared/constants.js';
import type { VerifyEscrowRequest } from '../../../workers/shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const verifyEscrowRouter = Router();

/**
 * Load Standard JSON Input from build artifacts
 */
async function loadStandardJsonInput(): Promise<string> {
  try {
    const contractsDir = path.resolve(__dirname, '..', '..', '..', 'contracts');
    const buildInfoPath = path.join(
      contractsDir,
      'artifacts',
      'build-info',
      'bae91e66b8308592901f4fef090532bb.json'
    );
    const buildInfo = await readFile(buildInfoPath, 'utf-8');
    return buildInfo;
  } catch (error: any) {
    console.warn('Could not load Standard JSON Input:', error.message);
    return '';
  }
}

verifyEscrowRouter.post('/', async (req, res) => {
  try {
    const { escrowAddress, mainWallet, inactivityPeriod, owner, network } = req.body;

    if (!escrowAddress || !mainWallet || inactivityPeriod === undefined || !owner || !network) {
      return res.status(400).json({
        success: false,
        message:
          'Missing required fields: escrowAddress, mainWallet, inactivityPeriod, owner, network',
      });
    }

    if (!VALID_NETWORKS.includes(network as any)) {
      return res.status(400).json({
        success: false,
        message: `Invalid network. Must be one of: ${VALID_NETWORKS.join(', ')}`,
      });
    }

    // Load Standard JSON Input
    const standardJsonInput = await loadStandardJsonInput();

    if (!standardJsonInput) {
      return res.status(500).json({
        success: false,
        message: 'Standard JSON Input not available. Please ensure contracts are compiled.',
      });
    }

    // Check if already verified
    const isVerified = await checkVerificationStatus(escrowAddress, network, fetch);
    if (isVerified) {
      return res.json({
        success: true,
        message: 'Contract is already verified',
        explorerUrl: getExplorerUrl(network, escrowAddress),
        alreadyVerified: true,
      });
    }

    // Verify with Blockscout
    const verifyRequest: VerifyEscrowRequest = {
      escrowAddress,
      mainWallet,
      inactivityPeriod:
        typeof inactivityPeriod === 'string' ? parseInt(inactivityPeriod) : inactivityPeriod,
      owner,
      network,
    };

    const result = await verifyEscrowWithBlockscout(
      verifyRequest,
      standardJsonInput,
      process.env.BLOCKSCOUT_API_KEY,
      fetch
    );

    return res.status(result.success ? 200 : 500).json(result);
  } catch (error: any) {
    console.error('Verification API error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message,
    });
  }
});
