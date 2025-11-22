import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

/**
 * API endpoint to verify escrow contracts automatically
 * POST /api/verify-escrow
 *
 * Body:
 * {
 *   escrowAddress: string,
 *   mainWallet: string,
 *   inactivityPeriod: string | number,
 *   owner: string,
 *   network: string (e.g., 'sepolia', 'baseSepolia')
 * }
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { escrowAddress, mainWallet, inactivityPeriod, owner, network } = body;

    // Validate required fields
    if (!escrowAddress || !mainWallet || inactivityPeriod === undefined || !owner || !network) {
      return json(
        {
          success: false,
          message:
            'Missing required fields: escrowAddress, mainWallet, inactivityPeriod, owner, network',
        },
        { status: 400 }
      );
    }

    // Validate network
    const validNetworks = ['sepolia', 'baseSepolia', 'mainnet', 'base'];
    if (!validNetworks.includes(network)) {
      return json(
        {
          success: false,
          message: `Invalid network. Must be one of: ${validNetworks.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Get the contracts directory path
    // In SvelteKit, process.cwd() returns the project root (frontend/)
    // Contracts are in ../contracts relative to frontend/
    const contractsDir = path.resolve(process.cwd(), '..', 'contracts');

    // Check if contracts directory exists
    const fs = await import('fs');
    if (!fs.existsSync(contractsDir)) {
      console.error(`Contracts directory not found: ${contractsDir}`);
      return json(
        {
          success: false,
          message: `Contracts directory not found at ${contractsDir}. Make sure the contracts folder exists.`,
        },
        { status: 500 }
      );
    }

    // Build the command to run the verification script
    // Escape special characters in addresses to prevent shell injection
    const escapeShell = (str: string) => `"${str.replace(/"/g, '\\"')}"`;

    const envVars = [
      `CONTRACT_ADDRESS=${escapeShell(escrowAddress)}`,
      `MAIN_WALLET=${escapeShell(mainWallet)}`,
      `INACTIVITY_PERIOD=${inactivityPeriod}`,
      `OWNER=${escapeShell(owner)}`,
    ].join(' ');

    const command = `cd ${contractsDir} && ${envVars} npx hardhat run scripts/verify-escrow.js --network ${network}`;

    console.log(
      `Executing verification command: ${command.replace(/ETHERSCAN_API_KEY=[^\s]+/, 'ETHERSCAN_API_KEY=***')}`
    );
    console.log(`Working directory: ${contractsDir}`);

    // Execute the verification
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 120000, // 120 second timeout (verification can take time)
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        cwd: contractsDir, // Set working directory explicitly
      });

      console.log('Verification stdout:', stdout);
      if (stderr) console.log('Verification stderr:', stderr);

      // Check if verification was successful
      const output = stdout + stderr;
      const isSuccess = output.includes('✅') || output.includes('already verified');
      const isAlreadyVerified = output.includes('already verified');

      if (isSuccess) {
        // Extract explorer URL if present
        const explorerUrlMatch = output.match(/View on explorer: (https?:\/\/[^\s]+)/);
        const explorerUrl = explorerUrlMatch ? explorerUrlMatch[1] : undefined;

        return json({
          success: true,
          message: isAlreadyVerified
            ? 'Contract is already verified'
            : 'Contract verified successfully',
          explorerUrl,
          alreadyVerified: isAlreadyVerified,
        });
      } else {
        return json(
          {
            success: false,
            message: 'Verification failed',
            details: output,
          },
          { status: 500 }
        );
      }
    } catch (execError: any) {
      const errorOutput = (execError.stdout || '') + (execError.stderr || '');
      console.error('Verification exec error:', execError);
      console.error('Error output:', errorOutput);

      // Check if it's already verified
      if (errorOutput.includes('already verified') || errorOutput.includes('Already Verified')) {
        const explorerUrlMatch = errorOutput.match(/View on explorer: (https?:\/\/[^\s]+)/);
        const explorerUrl = explorerUrlMatch ? explorerUrlMatch[1] : undefined;

        return json({
          success: true,
          message: 'Contract is already verified',
          explorerUrl,
          alreadyVerified: true,
        });
      }

      // Extract more detailed error message
      let errorMessage = 'Verification failed';
      if (errorOutput) {
        // Try to extract a meaningful error message
        const errorMatch = errorOutput.match(/Error:?\s*(.+)/i) || errorOutput.match(/❌\s*(.+)/);
        if (errorMatch) {
          errorMessage = errorMatch[1].trim();
        } else {
          errorMessage = errorOutput.slice(0, 500); // First 500 chars
        }
      } else if (execError.message) {
        errorMessage = execError.message;
      }

      return json(
        {
          success: false,
          message: errorMessage,
          details: errorOutput || execError.message,
          command: command.replace(/ETHERSCAN_API_KEY=[^\s]+/, 'ETHERSCAN_API_KEY=***'),
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Verification API error:', error);
    return json(
      {
        success: false,
        message: 'Internal server error',
        details: error.message,
      },
      { status: 500 }
    );
  }
};
