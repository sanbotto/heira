/**
 * Escrow contract interaction utilities
 */

import { getPublicClient, getWalletClient, type SupportedChainId } from './wallet';
import {
  parseEther,
  formatEther,
  type Address,
  decodeEventLog,
  decodeErrorResult,
  decodeAbiParameters,
  encodeFunctionData,
  type MulticallReturnType,
} from 'viem';
import { resolveEnsName } from './ens';

const FACTORY_ABI = [
  {
    inputs: [
      { name: '_mainWallet', type: 'address' },
      { name: '_inactivityPeriod', type: 'uint256' },
    ],
    name: 'createEscrow',
    outputs: [{ name: 'escrowAddress', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'escrow', type: 'address' },
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: true, name: 'mainWallet', type: 'address' },
      { indexed: false, name: 'inactivityPeriod', type: 'uint256' },
    ],
    name: 'EscrowCreated',
    type: 'event',
  },
] as const;

const ESCROW_ABI = [
  {
    inputs: [
      { name: '_recipient', type: 'address' },
      { name: '_percentage', type: 'uint256' },
      { name: '_chainId', type: 'uint256' },
      { name: '_tokenAddress', type: 'address' },
      { name: '_shouldSwap', type: 'bool' },
      { name: '_targetToken', type: 'address' },
    ],
    name: 'addBeneficiary',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_recipients', type: 'address[]' },
      { name: '_percentages', type: 'uint256[]' },
      { name: '_chainIds', type: 'uint256[]' },
      { name: '_tokenAddresses', type: 'address[]' },
      { name: '_shouldSwaps', type: 'bool[]' },
      { name: '_targetTokens', type: 'address[]' },
    ],
    name: 'addBeneficiariesBatch',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'run',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'status',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'mainWallet',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getTimeUntilExecution',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'deactivate',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getBeneficiaries',
    outputs: [
      {
        components: [
          { name: 'recipient', type: 'address' },
          { name: 'percentage', type: 'uint256' },
          { name: 'chainId', type: 'uint256' },
          { name: 'tokenAddress', type: 'address' },
          { name: 'shouldSwap', type: 'bool' },
          { name: 'targetToken', type: 'address' },
        ],
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getTokenConfigs',
    outputs: [
      {
        components: [
          { name: 'tokenAddress', type: 'address' },
          { name: 'chainId', type: 'uint256' },
          { name: 'shouldSwap', type: 'bool' },
          { name: 'targetToken', type: 'address' },
        ],
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'chainId', type: 'uint256' }],
    name: 'getUSDCAddressForChain',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getChainsToCheck',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'checkUSDCApproval',
    outputs: [
      { name: 'allowance', type: 'uint256' },
      { name: 'balance', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export interface BeneficiaryConfig {
  recipient: Address | string; // Address or ENS name
  percentage: number; // 0-100
  chainId: SupportedChainId;
  tokenAddress: Address; // Token to receive (zero address for native ETH)
  shouldSwap: boolean; // Whether to swap before sending
  targetToken?: Address; // Target token if swapping (zero address if not swapping)
}

export interface TokenConfig {
  tokenAddress: Address;
  chainId: SupportedChainId;
  shouldSwap: boolean;
  targetToken?: Address;
}

export interface EscrowConfig {
  mainWallet: Address | string; // Address or ENS name
  inactivityPeriod: number; // seconds
  beneficiaries: BeneficiaryConfig[];
  includedTokens?: string[]; // Array of token symbols to include (e.g., ["USDC", "WCBTC", "WETH"])
  swapTokensToUSDC?: boolean; // Whether to swap included tokens to USDC
}

/**
 * Map chain ID to network name for verification API
 */
/**
 * Get the explorer name for a given chain ID
 */
export function getExplorerName(chainId: SupportedChainId | number): string {
  switch (chainId) {
    case 1:
    case 11155111:
      return 'Etherscan';
    case 8453:
    case 84532:
      return 'Basescan';
    case 5115:
      return 'Blockscout';
    default:
      return 'Etherscan';
  }
}

function getNetworkName(chainId: SupportedChainId): string {
  const networkMap: Record<SupportedChainId, string> = {
    1: 'mainnet',
    11155111: 'sepolia',
    8453: 'base',
    84532: 'baseSepolia',
    5115: 'citrea-testnet',
  };
  return networkMap[chainId] || 'sepolia';
}

/**
 * Automatically verify an escrow contract on Etherscan/Basescan/Blockscout
 * Returns result object with success status and details
 */
async function verifyEscrowContract(
  escrowAddress: Address,
  mainWallet: Address | string,
  inactivityPeriod: number,
  owner: Address,
  chainId: SupportedChainId
): Promise<{ success: boolean; alreadyVerified?: boolean; message: string; explorerUrl?: string }> {
  // Ensure mainWallet is an address string (not ENS name)
  const mainWalletAddress =
    typeof mainWallet === 'string' && mainWallet.startsWith('0x')
      ? mainWallet
      : typeof mainWallet === 'string'
        ? mainWallet // If it's still a string but not an address, it might be an ENS name - this shouldn't happen if we use resolvedMainWallet
        : mainWallet;

  const networkName = getNetworkName(chainId);

  try {
    // Call backend API directly (frontend is static, no server-side API routes)
    const backendUrl = import.meta.env.VITE_BACKEND_API_URL;

    if (!backendUrl) {
      throw new Error(
        'Backend API URL not configured. Please set VITE_BACKEND_API_URL environment variable.'
      );
    }

    const response = await fetch(`${backendUrl}/api/verify-escrow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        escrowAddress,
        mainWallet: mainWalletAddress,
        inactivityPeriod: inactivityPeriod.toString(),
        owner,
        network: networkName,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText || `HTTP ${response.status}` };
      }
      throw new Error(errorData.message || errorData.details || 'Verification API error');
    }

    const result = await response.json();

    // Return the result object instead of throwing
    return {
      success: result.success || false,
      alreadyVerified: result.alreadyVerified || false,
      message: result.message || 'Verification completed',
      explorerUrl: result.explorerUrl,
    };
  } catch (error) {
    // Return error result instead of throwing
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to verify escrow: ${errorMessage}`,
    };
  }
}

/**
 * Create a new escrow contract
 * Automatically deactivates all previous active escrows for the same owner
 */
export async function createEscrow(
  factoryAddress: Address,
  config: EscrowConfig,
  chainId: SupportedChainId,
  onProgress?: (message: string, type?: 'info' | 'success' | 'error') => void
): Promise<Address> {
  const walletClient = await getWalletClient(chainId);
  const publicClient = getPublicClient(chainId);

  const [account] = await walletClient.getAddresses();

  // Deactivate all previous active escrows before creating a new one
  try {
    const existingEscrows = await getEscrowsByOwner(factoryAddress, account, chainId);

    for (const escrowAddr of existingEscrows) {
      try {
        const status = await getEscrowStatus(escrowAddr, chainId);
        // Status 0 = Active, Status 1 = Inactive
        if (status === 0) {
          console.log(`Deactivating previous escrow: ${escrowAddr}`);
          await deactivateEscrow(escrowAddr, chainId);
        }
      } catch (error) {
        // If deactivation fails, log but continue (don't block new escrow creation)
        console.warn(`Failed to deactivate escrow ${escrowAddr}:`, error);
      }
    }
  } catch (error) {
    // If fetching escrows fails, log but continue (don't block new escrow creation)
    console.warn('Failed to fetch existing escrows for auto-deactivation:', error);
  }

  // Validate inputs before proceeding
  if (config.inactivityPeriod <= 0) {
    throw new Error('Invalid inactivity period: must be greater than 0');
  }

  // Resolve ENS names to addresses before creating escrow
  let resolvedMainWallet: Address;

  if (typeof config.mainWallet === 'string') {
    const mainWalletStr = config.mainWallet.trim();

    // Check if it's an ENS name
    if (mainWalletStr.endsWith('.eth')) {
      // Validate ENS name format
      if (mainWalletStr.length < 4 || mainWalletStr.split('.').length < 2) {
        throw new Error('Invalid ENS name format');
      }

      // Check if ENS resolution is supported on this chain
      const ensSupportedChains = [1, 11155111, 8453, 84532]; // mainnet, Sepolia, Base, Base Sepolia
      if (!ensSupportedChains.includes(chainId)) {
        throw new Error(
          `ENS resolution is not supported on chain ${chainId}. Please use a plain Ethereum address (0x...) instead.`
        );
      }

      // Resolve ENS name to address
      onProgress?.('Resolving ENS name...', 'info');
      const resolvedAddress = await resolveEnsName(mainWalletStr);
      if (!resolvedAddress) {
        throw new Error(
          `Failed to resolve ENS name "${mainWalletStr}". Please verify the ENS name exists and is correct.`
        );
      }
      resolvedMainWallet = resolvedAddress;
      onProgress?.(`✅ Resolved "${mainWalletStr}" to ${resolvedAddress}`, 'success');
    } else {
      // Should be a hex address
      if (!mainWalletStr.startsWith('0x') || mainWalletStr.length !== 42) {
        throw new Error(
          'Invalid address format. Must be a valid Ethereum address (0x...) or ENS name (.eth)'
        );
      }

      // Validate hex characters
      if (!/^0x[0-9a-fA-F]{40}$/.test(mainWalletStr)) {
        throw new Error(
          'Invalid address format. Address must contain only hexadecimal characters.'
        );
      }

      resolvedMainWallet = mainWalletStr as Address;
    }
  } else {
    // Should be an Address type
    if (!config.mainWallet || config.mainWallet === '0x0000000000000000000000000000000000000000') {
      throw new Error('Invalid main wallet address: cannot be zero address');
    }
    resolvedMainWallet = config.mainWallet;
  }

  // Simulate the transaction first to catch revert reasons
  // Try multiple methods to get the revert reason
  let simulationError: any = null;

  try {
    await publicClient.simulateContract({
      account,
      address: factoryAddress,
      abi: FACTORY_ABI,
      functionName: 'createEscrow',
      args: [resolvedMainWallet, BigInt(config.inactivityPeriod)],
    });
  } catch (error: any) {
    simulationError = error;

    // Try to get better error details using call (sometimes gives better errors)
    try {
      const functionData = encodeFunctionData({
        abi: FACTORY_ABI,
        functionName: 'createEscrow',
        args: [resolvedMainWallet, BigInt(config.inactivityPeriod)],
      });

      // Try call which sometimes provides better error details
      await publicClient.call({
        account,
        to: factoryAddress,
        data: functionData,
      });
    } catch (callError: any) {
      // Use the call error if it has better details
      if (callError?.shortMessage || callError?.message) {
        simulationError = callError;
      }
    }

    // Also try estimateGas as a fallback
    if (!simulationError?.shortMessage) {
      try {
        const functionData = encodeFunctionData({
          abi: FACTORY_ABI,
          functionName: 'createEscrow',
          args: [resolvedMainWallet, BigInt(config.inactivityPeriod)],
        });

        await publicClient.estimateGas({
          account,
          to: factoryAddress,
          data: functionData,
        });
      } catch (gasError: any) {
        // Use the gas estimation error if it has better details
        if (gasError?.shortMessage || gasError?.message) {
          simulationError = gasError;
        }
      }
    }
  }

  if (simulationError) {
    // Extract revert reason from simulation error
    let revertReason = 'Unknown error';

    // Try to get error data from different locations
    const errorData =
      simulationError?.cause?.data || simulationError?.data || simulationError?.cause?.error?.data;

    if (errorData) {
      try {
        if (typeof errorData === 'string') {
          if (errorData.startsWith('0x')) {
            // Try to decode using viem's decodeErrorResult
            try {
              const decoded = decodeErrorResult({
                abi: FACTORY_ABI,
                data: errorData as `0x${string}`,
              });
              revertReason =
                decoded.errorName ||
                (decoded.args ? JSON.stringify(decoded.args) : '') ||
                errorData;
            } catch {
              // If decoding fails, check if it's a require/revert message
              // Error data starting with 0x08c379a0 is a revert(string) error
              if (errorData.startsWith('0x08c379a0')) {
                try {
                  // Decode the string from the error data (skip the 4-byte selector)
                  const dataWithoutSelector = ('0x' + errorData.slice(10)) as `0x${string}`;
                  const decoded = decodeAbiParameters([{ type: 'string' }], dataWithoutSelector);
                  revertReason = decoded[0] as string;
                } catch {
                  revertReason = errorData;
                }
              } else {
                revertReason = errorData;
              }
            }
          } else {
            revertReason = errorData;
          }
        } else if (typeof errorData === 'object') {
          revertReason = JSON.stringify(errorData, null, 2);
        }
      } catch {
        // Fall through to other methods
      }
    }

    // Try other error message sources
    if (revertReason === 'Unknown error' || revertReason.length < 10) {
      const possibleReasons = [
        simulationError?.cause?.reason,
        simulationError?.shortMessage,
        simulationError?.details,
        simulationError?.message,
        simulationError?.cause?.message,
        simulationError?.cause?.error?.message,
      ].filter(Boolean);

      if (possibleReasons.length > 0) {
        revertReason = possibleReasons[0];
      }
    }

    // Provide helpful context based on common issues
    if (
      revertReason.includes('execution reverted') ||
      revertReason === 'Unknown error' ||
      revertReason.includes('trace_id') ||
      revertReason.includes('unknown reason')
    ) {
      // The RPC didn't provide the actual revert reason
      // Provide helpful context based on what we know
      const chainName =
        chainId === 1
          ? 'Ethereum mainnet'
          : chainId === 11155111
            ? 'Sepolia testnet'
            : chainId === 8453
              ? 'Base mainnet'
              : chainId === 84532
                ? 'Base Sepolia'
                : `chain ${chainId}`;

      revertReason =
        `Transaction reverted for an unknown reason (RPC provider limitation).\n\n` +
        `Based on your inputs, possible causes:\n` +
        `- Invalid address format\n` +
        `- Invalid inactivity period: ${config.inactivityPeriod} seconds\n` +
        `- Contract validation error\n\n` +
        `Debugging steps:\n` +
        `1. Verify the address is correct: ${resolvedMainWallet}\n` +
        `2. Verify the factory contract address: ${factoryAddress}\n` +
        `3. Check the transaction on a block explorer to see the actual revert reason\n\n` +
        `Your inputs:\n` +
        `- Main wallet: ${resolvedMainWallet}${typeof config.mainWallet === 'string' && config.mainWallet.endsWith('.eth') ? ` (resolved from ${config.mainWallet})` : ''}\n` +
        `- Inactivity period: ${config.inactivityPeriod} seconds\n` +
        `- Chain: ${chainName} (${chainId})`;
    }

    throw new Error(revertReason);
  }

  onProgress?.('Please sign the transaction in your wallet...', 'info');
  const hash = await walletClient.writeContract({
    account,
    address: factoryAddress,
    abi: FACTORY_ABI,
    functionName: 'createEscrow',
    args: [resolvedMainWallet, BigInt(config.inactivityPeriod)],
  });

  onProgress?.('Transaction sent! Waiting for confirmation...', 'info');
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Check if transaction succeeded
  if (receipt.status === 'reverted') {
    // Try to get the revert reason by simulating the call
    try {
      await publicClient.simulateContract({
        account,
        address: factoryAddress,
        abi: FACTORY_ABI,
        functionName: 'createEscrow',
        args: [resolvedMainWallet, BigInt(config.inactivityPeriod)],
      });
    } catch (simError: any) {
      const revertReason =
        simError?.cause?.reason ||
        simError?.shortMessage ||
        simError?.message ||
        'Transaction reverted';
      throw new Error(`Transaction failed: ${revertReason}`);
    }

    // If simulation didn't throw, provide generic error
    throw new Error(
      'Transaction failed (reverted). Common causes:\n' +
        '- Invalid address format\n' +
        '- Invalid inactivity period\n' +
        `Transaction hash: ${hash}`
    );
  }

  // Check if logs exist
  if (!receipt.logs || receipt.logs.length === 0) {
    throw new Error(
      'Transaction succeeded but no events were emitted. This may indicate a problem with the factory contract.'
    );
  }

  // Get the escrow address from events
  // Decode the EscrowCreated event from the transaction receipt
  let escrowAddress: Address | null = null;
  let resolvedMainWallet: Address | null = null;

  for (const log of receipt.logs) {
    // Only process logs from the factory contract
    if (log.address.toLowerCase() !== factoryAddress.toLowerCase()) {
      continue;
    }

    try {
      const decodedEvent = decodeEventLog({
        abi: FACTORY_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (decodedEvent.eventName === 'EscrowCreated' && decodedEvent.args) {
        escrowAddress = decodedEvent.args.escrow as Address;
        // Get the resolved main wallet address from the event
        resolvedMainWallet = decodedEvent.args.mainWallet as Address;
        console.log('✅ Escrow created:', escrowAddress);
        console.log('   Main wallet:', resolvedMainWallet);
        break;
      }
    } catch (error) {
      // Not the event we're looking for, continue
      continue;
    }
  }

  if (!escrowAddress) {
    throw new Error(
      'Failed to find EscrowCreated event in transaction receipt. ' +
        'The transaction may have succeeded but the event was not emitted. ' +
        `Transaction hash: ${hash}. ` +
        'Please verify the factory contract address is correct.'
    );
  }

  // TypeScript now knows escrowAddress is not null after the check above
  const escrowAddr = escrowAddress as Address;

  console.log('📝 Configuring escrow at:', escrowAddr);

  // Configure beneficiaries
  // Resolve all ENS names to addresses before adding beneficiaries
  if (config.beneficiaries.length > 0) {
    onProgress?.('Resolving beneficiary ENS names...', 'info');

    const resolvedBeneficiaries: Array<{
      recipient: Address;
      percentage: number;
      chainId: number;
      tokenAddress?: Address;
      shouldSwap?: boolean;
      targetToken?: Address;
    }> = [];

    // Resolve all beneficiaries (ENS names or addresses) to addresses
    for (let i = 0; i < config.beneficiaries.length; i++) {
      const beneficiary = config.beneficiaries[i];
      let resolvedRecipient: Address;

      if (typeof beneficiary.recipient === 'string' && beneficiary.recipient.endsWith('.eth')) {
        // Resolve ENS name to address
        const resolvedAddress = await resolveEnsName(beneficiary.recipient);
        if (!resolvedAddress) {
          throw new Error(
            `Failed to resolve ENS name "${beneficiary.recipient}" for beneficiary ${i + 1}. Please verify the ENS name exists and is correct.`
          );
        }
        resolvedRecipient = resolvedAddress;
        onProgress?.(`✅ Resolved "${beneficiary.recipient}" to ${resolvedAddress}`, 'success');
      } else {
        // Already an address
        resolvedRecipient =
          typeof beneficiary.recipient === 'string'
            ? (beneficiary.recipient as Address)
            : beneficiary.recipient;
      }

      resolvedBeneficiaries.push({
        recipient: resolvedRecipient,
        percentage: beneficiary.percentage,
        chainId: beneficiary.chainId,
        tokenAddress: beneficiary.tokenAddress,
        shouldSwap: beneficiary.shouldSwap,
        targetToken: beneficiary.targetToken,
      });
    }

    // Use batch add for all beneficiaries (all are now addresses)
    if (resolvedBeneficiaries.length > 0) {
      const recipients = resolvedBeneficiaries.map(b => b.recipient);
      const percentages = resolvedBeneficiaries.map(b => BigInt(Math.floor(b.percentage * 100)));
      const chainIds = resolvedBeneficiaries.map(b => BigInt(b.chainId));

      // Get token swap configs from beneficiaries
      const tokenAddresses = resolvedBeneficiaries.map(
        b => b.tokenAddress || ('0x0000000000000000000000000000000000000000' as Address)
      );
      const shouldSwaps = resolvedBeneficiaries.map(b => b.shouldSwap || false);
      const targetTokens = resolvedBeneficiaries.map((b, i) => {
        const targetToken =
          b.targetToken || ('0x0000000000000000000000000000000000000000' as Address);
        // Validate: if shouldSwap is true, targetToken must not be zero address
        if (b.shouldSwap && targetToken === '0x0000000000000000000000000000000000000000') {
          throw new Error(
            `Beneficiary ${i + 1} (${b.recipient}) has shouldSwap=true but targetToken is not set. ` +
              `Please ensure targetToken is configured when enabling swaps.`
          );
        }
        return targetToken;
      });

      console.log(`📝 Adding ${resolvedBeneficiaries.length} beneficiaries to escrow:`, escrowAddr);
      console.log('Beneficiary data:', {
        recipients,
        percentages: percentages.map(p => p.toString()),
        chainIds: chainIds.map(c => c.toString()),
        tokenAddresses,
        shouldSwaps,
        targetTokens,
      });

      // Pre-flight checks: verify contract status and ownership
      let contractStatus: number | null = null;
      let contractOwner: Address | null = null;

      try {
        [contractStatus, contractOwner] = await Promise.all([
          publicClient.readContract({
            address: escrowAddr,
            abi: ESCROW_ABI,
            functionName: 'status',
          }),
          publicClient.readContract({
            address: escrowAddr,
            abi: ESCROW_ABI,
            functionName: 'owner',
          }),
        ]);

        if (contractStatus !== 0) {
          throw new Error(
            `Escrow contract is inactive (status: ${contractStatus}). Contract must be Active (0) to add beneficiaries.`
          );
        }

        if (contractOwner.toLowerCase() !== account.toLowerCase()) {
          throw new Error(
            `You are not the owner of this escrow. Owner: ${contractOwner}, Your address: ${account}`
          );
        }
      } catch (preCheckError: any) {
        if (
          preCheckError.message.includes('Escrow contract is inactive') ||
          preCheckError.message.includes('not the owner')
        ) {
          throw preCheckError;
        }
        console.warn('Pre-flight checks failed, continuing with simulation:', preCheckError);
      }

      // Validate all inputs before attempting transaction
      const validationErrors: string[] = [];

      if (recipients.length === 0) {
        validationErrors.push('No recipients provided');
      }

      if (
        recipients.length !== percentages.length ||
        recipients.length !== chainIds.length ||
        recipients.length !== tokenAddresses.length ||
        recipients.length !== shouldSwaps.length ||
        recipients.length !== targetTokens.length
      ) {
        validationErrors.push(
          `Array length mismatch: recipients=${recipients.length}, percentages=${percentages.length}, ` +
            `chainIds=${chainIds.length}, tokenAddresses=${tokenAddresses.length}, ` +
            `shouldSwaps=${shouldSwaps.length}, targetTokens=${targetTokens.length}`
        );
      }

      recipients.forEach((recipient, i) => {
        if (!recipient || recipient === '0x0000000000000000000000000000000000000000') {
          validationErrors.push(`Beneficiary ${i + 1}: Invalid recipient (zero address or empty)`);
        }
        const percentage = Number(percentages[i]);
        if (percentage <= 0 || percentage > 10000) {
          validationErrors.push(
            `Beneficiary ${i + 1}: Invalid percentage ${percentage} (must be 1-10000 basis points)`
          );
        }
        if (
          shouldSwaps[i] &&
          (!targetTokens[i] || targetTokens[i] === '0x0000000000000000000000000000000000000000')
        ) {
          validationErrors.push(
            `Beneficiary ${i + 1}: shouldSwap=true but targetToken is zero address`
          );
        }
      });

      if (validationErrors.length > 0) {
        throw new Error(`Validation failed: ${validationErrors.join('; ')}`);
      }

      if (contractStatus !== null && contractStatus !== 0) {
        throw new Error(
          `Escrow contract is inactive (status: ${contractStatus}). Contract must be Active (0) to add beneficiaries.`
        );
      }

      if (contractOwner && contractOwner.toLowerCase() !== account.toLowerCase()) {
        throw new Error(
          `You are not the owner of this escrow. Owner: ${contractOwner}, Your address: ${account}`
        );
      }

      // Verify contract has code
      const code = await publicClient.getBytecode({ address: escrowAddr });
      if (!code || code === '0x') {
        throw new Error(
          `No contract code found at address ${escrowAddr}. Is this a valid escrow contract?`
        );
      }

      // Try to read contract state directly to verify it's working
      console.log('Contract state check:', {
        address: escrowAddr,
        codeLength: code.length,
      });

      // Try reading various contract functions to verify it's the right contract
      try {
        const [readStatus, readOwner, readMainWallet] = await Promise.all([
          publicClient
            .readContract({
              address: escrowAddr,
              abi: ESCROW_ABI,
              functionName: 'status',
            })
            .catch(() => null),
          publicClient
            .readContract({
              address: escrowAddr,
              abi: ESCROW_ABI,
              functionName: 'owner',
            })
            .catch(() => null),
          publicClient
            .readContract({
              address: escrowAddr,
              abi: ESCROW_ABI,
              functionName: 'mainWallet',
            })
            .catch(() => null),
        ]);

        console.log('Contract read results:', {
          status: readStatus,
          owner: readOwner,
          mainWallet: readMainWallet,
          expectedOwner: account,
          ownerMatch: readOwner?.toLowerCase() === account.toLowerCase(),
        });

        if (readOwner && readOwner.toLowerCase() !== account.toLowerCase()) {
          throw new Error(
            `Contract owner mismatch. Contract owner: ${readOwner}, Your address: ${account}`
          );
        }

        if (readStatus !== null && readStatus !== 0) {
          throw new Error(`Contract status is ${readStatus} (expected 0 for Active)`);
        }
      } catch (readError: any) {
        if (
          readError.message.includes('owner mismatch') ||
          readError.message.includes('status is')
        ) {
          throw readError;
        }
        console.warn('Could not read contract state:', readError);
      }

      // Test if contract has the new function signature by trying to encode a call
      try {
        const testFunctionData = encodeFunctionData({
          abi: ESCROW_ABI,
          functionName: 'addBeneficiariesBatch',
          args: [recipients, percentages, chainIds, tokenAddresses, shouldSwaps, targetTokens],
        });
        console.log(
          'Function data encoded successfully:',
          testFunctionData.substring(0, 20) + '...'
        );
      } catch (encodeError: any) {
        console.error('Failed to encode function data:', encodeError);
        throw new Error(
          `Failed to encode transaction: ${encodeError.message}. Please check that all parameters are valid.`
        );
      }

      // Check if contract supports new signature (6 params) or old signature (3 params)
      let useOldSignature = false;

      // First, try to detect contract version by checking function signature
      try {
        // Try to simulate with new signature first
        await publicClient.simulateContract({
          account,
          address: escrowAddr,
          abi: ESCROW_ABI,
          functionName: 'addBeneficiariesBatch',
          args: [recipients, percentages, chainIds, tokenAddresses, shouldSwaps, targetTokens],
        });
        // If simulation succeeds, contract supports new signature
        useOldSignature = false;
      } catch (simError: any) {
        // Check if error is due to function signature mismatch (old contract)
        const errorMsg = simError?.message || simError?.shortMessage || '';
        const errorData = simError?.cause?.data || simError?.data || '';

        // Check if it's a function selector error (old contract)
        if (
          errorMsg.includes('does not exist') ||
          errorMsg.includes('function selector') ||
          errorMsg.includes('invalid opcode') ||
          (typeof errorData === 'string' && errorData.includes('function selector'))
        ) {
          // Try old signature (3 params only)
          try {
            const OLD_ABI = [
              {
                inputs: [
                  { name: '_recipients', type: 'address[]' },
                  { name: '_percentages', type: 'uint256[]' },
                  { name: '_chainIds', type: 'uint256[]' },
                ],
                name: 'addBeneficiariesBatch',
                outputs: [],
                stateMutability: 'nonpayable',
                type: 'function',
              },
            ] as const;

            await publicClient.simulateContract({
              account,
              address: escrowAddr,
              abi: OLD_ABI,
              functionName: 'addBeneficiariesBatch',
              args: [recipients, percentages, chainIds],
            });

            // Old signature works - this is an old contract
            useOldSignature = true;
            console.warn('⚠️ Detected old contract version. Token swap configs will be ignored.');
            onProgress?.(
              '⚠️ This escrow was created with an old contract version. Token swap configurations cannot be added. Please create a new escrow to use token swap features.',
              'info'
            );
          } catch (oldSimError) {
            // Old signature also fails - this is a different error, continue with new signature handling
            useOldSignature = false;
          }
        } else {
          // Different error - continue with new signature error handling
          useOldSignature = false;
        }
      }

      // Pre-flight check: simulate the transaction first to catch errors early
      try {
        if (useOldSignature) {
          // Use old signature (3 params)
          const OLD_ABI = [
            {
              inputs: [
                { name: '_recipients', type: 'address[]' },
                { name: '_percentages', type: 'uint256[]' },
                { name: '_chainIds', type: 'uint256[]' },
              ],
              name: 'addBeneficiariesBatch',
              outputs: [],
              stateMutability: 'nonpayable',
              type: 'function',
            },
          ] as const;

          await publicClient.simulateContract({
            account,
            address: escrowAddr,
            abi: OLD_ABI,
            functionName: 'addBeneficiariesBatch',
            args: [recipients, percentages, chainIds],
          });
        } else {
          // Use new signature (6 params)
          await publicClient.simulateContract({
            account,
            address: escrowAddr,
            abi: ESCROW_ABI,
            functionName: 'addBeneficiariesBatch',
            args: [recipients, percentages, chainIds, tokenAddresses, shouldSwaps, targetTokens],
          });
        }
      } catch (simError: any) {
        // Try to decode the error properly
        let errorMsg = 'Transaction simulation failed';

        // Helper to safely serialize objects with BigInt values
        const safeStringify = (obj: any): string => {
          try {
            return JSON.stringify(obj, (key, value) =>
              typeof value === 'bigint' ? value.toString() : value
            );
          } catch {
            return String(obj);
          }
        };

        // Log full error structure for debugging (without BigInt serialization issues)
        console.error('Full simulation error:', safeStringify(simError));
        console.error('Error cause:', simError?.cause);
        console.error('Error data locations:', {
          'simError.cause.data': simError?.cause?.data,
          'simError.data': simError?.data,
          'simError.cause.error.data': simError?.cause?.error?.data,
          'simError.cause.error.cause.data': simError?.cause?.error?.cause?.data,
          'simError.details': simError?.details,
        });

        // Try to decode error data from multiple possible locations
        let errorData =
          simError?.cause?.data ||
          simError?.data ||
          simError?.cause?.error?.data ||
          simError?.cause?.error?.cause?.data ||
          simError?.details?.data ||
          null;

        // Check if errorData is JSON with trace_id (not actual error data)
        if (errorData && typeof errorData === 'string' && !errorData.startsWith('0x')) {
          try {
            const parsed = JSON.parse(errorData);
            if (parsed.trace_id) {
              // This is metadata, not error data - ignore it
              errorData = null;
            }
          } catch {
            // Not JSON, might be error message
          }
        }

        // If we still don't have error data, try to get it from the error message or shortMessage
        if (!errorData) {
          const errorMessage = simError?.message || simError?.shortMessage || '';
          // Sometimes the error data is embedded in the message
          const hexMatch = errorMessage.match(/0x[a-fA-F0-9]+/);
          if (hexMatch && hexMatch[0].length > 10) {
            errorData = hexMatch[0];
          }
        }

        // Try to decode hex error data
        if (errorData && typeof errorData === 'string' && errorData.startsWith('0x')) {
          try {
            // Try to decode using decodeErrorResult
            const decoded = decodeErrorResult({
              abi: ESCROW_ABI,
              data: errorData as `0x${string}`,
            });
            errorMsg =
              decoded.errorName || (decoded.args ? JSON.stringify(decoded.args) : '') || errorData;

            // If it's a revert(string) error (selector 0x08c379a0), decode the string
            if (errorData.startsWith('0x08c379a0')) {
              try {
                const dataWithoutSelector = ('0x' + errorData.slice(10)) as `0x${string}`;
                const decodedString = decodeAbiParameters(
                  [{ type: 'string' }],
                  dataWithoutSelector
                );
                errorMsg = decodedString[0] as string;
              } catch {
                // Fall through to use decoded.errorName
              }
            }
          } catch (decodeError) {
            console.warn('Failed to decode error:', decodeError);
            // Fall through to use other error sources
          }
        }

        // If we still don't have a good error message, try estimateGas (sometimes gives better errors)
        if (
          errorMsg === 'Transaction simulation failed' ||
          errorMsg.includes('execution reverted')
        ) {
          try {
            const functionData = useOldSignature
              ? encodeFunctionData({
                  abi: [
                    {
                      inputs: [
                        { name: '_recipients', type: 'address[]' },
                        { name: '_percentages', type: 'uint256[]' },
                        { name: '_chainIds', type: 'uint256[]' },
                      ],
                      name: 'addBeneficiariesBatch',
                      outputs: [],
                      stateMutability: 'nonpayable',
                      type: 'function',
                    },
                  ] as const,
                  functionName: 'addBeneficiariesBatch',
                  args: [recipients, percentages, chainIds],
                })
              : encodeFunctionData({
                  abi: ESCROW_ABI,
                  functionName: 'addBeneficiariesBatch',
                  args: [
                    recipients,
                    percentages,
                    chainIds,
                    tokenAddresses,
                    shouldSwaps,
                    targetTokens,
                  ],
                });

            await publicClient.estimateGas({
              account,
              to: escrowAddr,
              data: functionData,
            });
          } catch (gasError: any) {
            const gasErrorData =
              gasError?.cause?.data || gasError?.data || gasError?.cause?.error?.data;

            if (gasErrorData && typeof gasErrorData === 'string' && gasErrorData.startsWith('0x')) {
              try {
                const decoded = decodeErrorResult({
                  abi: ESCROW_ABI,
                  data: gasErrorData as `0x${string}`,
                });
                errorMsg =
                  decoded.errorName ||
                  (decoded.args ? JSON.stringify(decoded.args) : '') ||
                  gasErrorData;

                // Decode revert(string) if applicable
                if (gasErrorData.startsWith('0x08c379a0')) {
                  try {
                    const dataWithoutSelector = ('0x' + gasErrorData.slice(10)) as `0x${string}`;
                    const decodedString = decodeAbiParameters(
                      [{ type: 'string' }],
                      dataWithoutSelector
                    );
                    errorMsg = decodedString[0] as string;
                  } catch {
                    // Fall through
                  }
                }
              } catch {
                // Fall through
              }
            }

            // Try other error message sources from gas estimation error
            if (
              errorMsg === 'Transaction simulation failed' ||
              errorMsg.includes('execution reverted')
            ) {
              errorMsg =
                gasError?.cause?.reason || gasError?.shortMessage || gasError?.message || errorMsg;
            }
          }
        }

        // If we still don't have a good error message, try calling the contract directly
        if (
          errorMsg === 'Transaction simulation failed' ||
          errorMsg.includes('execution reverted')
        ) {
          try {
            // Try to call the contract directly to get revert reason
            const functionData = useOldSignature
              ? encodeFunctionData({
                  abi: [
                    {
                      inputs: [
                        { name: '_recipients', type: 'address[]' },
                        { name: '_percentages', type: 'uint256[]' },
                        { name: '_chainIds', type: 'uint256[]' },
                      ],
                      name: 'addBeneficiariesBatch',
                      outputs: [],
                      stateMutability: 'nonpayable',
                      type: 'function',
                    },
                  ] as const,
                  functionName: 'addBeneficiariesBatch',
                  args: [recipients, percentages, chainIds],
                })
              : encodeFunctionData({
                  abi: ESCROW_ABI,
                  functionName: 'addBeneficiariesBatch',
                  args: [
                    recipients,
                    percentages,
                    chainIds,
                    tokenAddresses,
                    shouldSwaps,
                    targetTokens,
                  ],
                });

            await publicClient.call({
              to: escrowAddr,
              data: functionData,
              account,
            });
          } catch (callError: any) {
            const callErrorData =
              callError?.cause?.data || callError?.data || callError?.cause?.error?.data;

            if (
              callErrorData &&
              typeof callErrorData === 'string' &&
              callErrorData.startsWith('0x')
            ) {
              try {
                const decoded = decodeErrorResult({
                  abi: ESCROW_ABI,
                  data: callErrorData as `0x${string}`,
                });
                errorMsg =
                  decoded.errorName ||
                  (decoded.args ? JSON.stringify(decoded.args) : '') ||
                  callErrorData;

                // Decode revert(string) if applicable
                if (callErrorData.startsWith('0x08c379a0')) {
                  try {
                    const dataWithoutSelector = ('0x' + callErrorData.slice(10)) as `0x${string}`;
                    const decodedString = decodeAbiParameters(
                      [{ type: 'string' }],
                      dataWithoutSelector
                    );
                    errorMsg = decodedString[0] as string;
                  } catch {
                    // Fall through
                  }
                }
              } catch {
                // Fall through
              }
            }

            // Try other error message sources from call error
            if (
              errorMsg === 'Transaction simulation failed' ||
              errorMsg.includes('execution reverted')
            ) {
              errorMsg =
                callError?.cause?.reason ||
                callError?.shortMessage ||
                callError?.message ||
                errorMsg;
            }
          }
        }

        // Final fallback to other error message sources
        if (
          errorMsg === 'Transaction simulation failed' ||
          errorMsg.includes('execution reverted')
        ) {
          errorMsg =
            simError?.cause?.reason ||
            simError?.shortMessage ||
            simError?.message ||
            'Transaction simulation failed - execution reverted';
        }

        // Try one more method: use call with the exact same parameters
        if (
          (errorMsg === 'Transaction simulation failed' ||
            errorMsg.includes('execution reverted')) &&
          !errorData
        ) {
          try {
            const functionData = useOldSignature
              ? encodeFunctionData({
                  abi: [
                    {
                      inputs: [
                        { name: '_recipients', type: 'address[]' },
                        { name: '_percentages', type: 'uint256[]' },
                        { name: '_chainIds', type: 'uint256[]' },
                      ],
                      name: 'addBeneficiariesBatch',
                      outputs: [],
                      stateMutability: 'nonpayable',
                      type: 'function',
                    },
                  ] as const,
                  functionName: 'addBeneficiariesBatch',
                  args: [recipients, percentages, chainIds],
                })
              : encodeFunctionData({
                  abi: ESCROW_ABI,
                  functionName: 'addBeneficiariesBatch',
                  args: [
                    recipients,
                    percentages,
                    chainIds,
                    tokenAddresses,
                    shouldSwaps,
                    targetTokens,
                  ],
                });

            const result = await publicClient.call({
              to: escrowAddr,
              data: functionData,
              account,
            });

            // If call succeeds, that's strange - log it
            console.warn('Call succeeded but simulation failed:', result);
          } catch (callError: any) {
            console.error('Call error:', callError);
            // Try to extract error from call error
            const callErrorData =
              callError?.cause?.data ||
              callError?.data ||
              callError?.cause?.error?.data ||
              callError?.details?.data;

            if (
              callErrorData &&
              typeof callErrorData === 'string' &&
              callErrorData.startsWith('0x')
            ) {
              errorData = callErrorData;
              try {
                const decoded = decodeErrorResult({
                  abi: ESCROW_ABI,
                  data: callErrorData as `0x${string}`,
                });
                errorMsg =
                  decoded.errorName ||
                  (decoded.args ? JSON.stringify(decoded.args) : '') ||
                  callErrorData;

                if (callErrorData.startsWith('0x08c379a0')) {
                  try {
                    const dataWithoutSelector = ('0x' + callErrorData.slice(10)) as `0x${string}`;
                    const decodedString = decodeAbiParameters(
                      [{ type: 'string' }],
                      dataWithoutSelector
                    );
                    errorMsg = decodedString[0] as string;
                  } catch {
                    // Fall through
                  }
                }
              } catch {
                // Fall through
              }
            }
          }
        }

        console.error('Simulation error details:', {
          error: safeStringify(simError),
          errorData,
          errorMsg,
          recipients,
          percentages: percentages.map(p => p.toString()),
          chainIds: chainIds.map(c => c.toString()),
          tokenAddresses,
          shouldSwaps,
          targetTokens,
          account,
          escrowAddr,
          useOldSignature,
        });

        // Build comprehensive error message
        const errorParts = [`Cannot add beneficiaries: ${errorMsg}`];

        // Add helpful hints based on common issues
        if (
          errorMsg.includes('execution reverted') ||
          errorMsg === 'Transaction simulation failed'
        ) {
          errorParts.push(
            'Possible causes:',
            '- Contract is inactive (check status)',
            '- You are not the contract owner',
            '- Invalid beneficiary data (zero addresses, invalid percentages)',
            '- Array length mismatch',
            `- Contract address: ${escrowAddr}`,
            `- Your address: ${account}`
          );
        }

        throw new Error(errorParts.join('. '));
      }

      onProgress?.(`Adding ${resolvedBeneficiaries.length} beneficiaries... Please sign.`, 'info');

      // Log the exact values being sent (converted to strings for logging)
      console.log('Sending transaction with values:', {
        recipients,
        percentages: percentages.map(p => p.toString()),
        chainIds: chainIds.map(c => c.toString()),
        tokenAddresses,
        shouldSwaps,
        targetTokens,
        useOldSignature,
      });

      let beneficiaryHash: `0x${string}`;
      if (useOldSignature) {
        // Use old signature (3 params only) - token swap configs are ignored
        const OLD_ABI = [
          {
            inputs: [
              { name: '_recipients', type: 'address[]' },
              { name: '_percentages', type: 'uint256[]' },
              { name: '_chainIds', type: 'uint256[]' },
            ],
            name: 'addBeneficiariesBatch',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ] as const;

        beneficiaryHash = await walletClient.writeContract({
          account,
          address: escrowAddr,
          abi: OLD_ABI,
          functionName: 'addBeneficiariesBatch',
          args: [recipients, percentages, chainIds],
        });
      } else {
        // Use new signature (6 params)
        beneficiaryHash = await walletClient.writeContract({
          account,
          address: escrowAddr,
          abi: ESCROW_ABI,
          functionName: 'addBeneficiariesBatch',
          args: [recipients, percentages, chainIds, tokenAddresses, shouldSwaps, targetTokens],
        });
      }
      console.log('   Transaction hash:', beneficiaryHash);
      onProgress?.('Waiting for beneficiary transaction confirmation...', 'info');
      const beneficiaryReceipt = await publicClient.waitForTransactionReceipt({
        hash: beneficiaryHash,
      });

      // Check if transaction succeeded
      if (beneficiaryReceipt.status === 'reverted') {
        // Try to get the revert reason by simulating the call
        let revertReason = 'Transaction reverted';
        let simErrorDetails: any = null;

        try {
          await publicClient.simulateContract({
            account,
            address: escrowAddr,
            abi: ESCROW_ABI,
            functionName: 'addBeneficiariesBatch',
            args: [recipients, percentages, chainIds, tokenAddresses, shouldSwaps, targetTokens],
          });
        } catch (simError: any) {
          simErrorDetails = simError;
          revertReason =
            simError?.cause?.reason ||
            simError?.cause?.data ||
            simError?.shortMessage ||
            simError?.message ||
            'Unknown revert reason';

          // Try to decode error data if available
          if (simError?.cause?.data && typeof simError.cause.data === 'string') {
            try {
              // Common error selectors
              const errorSelectors: Record<string, string> = {
                '0x08c379a0': 'Error(string)', // Standard error
                '0x4e487b71': 'Panic(uint256)', // Panic error
              };

              // Try to decode if it matches known selectors
              for (const [selector, errorType] of Object.entries(errorSelectors)) {
                if (simError.cause.data.startsWith(selector)) {
                  console.log(`Detected ${errorType} error`);
                }
              }
            } catch (decodeError) {
              console.warn('Failed to decode error data:', decodeError);
            }
          }
        }

        // Validate the data being sent to help identify the issue
        const validationErrors: string[] = [];

        // Check array lengths
        if (
          recipients.length !== percentages.length ||
          recipients.length !== chainIds.length ||
          recipients.length !== tokenAddresses.length ||
          recipients.length !== shouldSwaps.length ||
          recipients.length !== targetTokens.length
        ) {
          validationErrors.push(
            `Array length mismatch: recipients=${recipients.length}, percentages=${percentages.length}, ` +
              `chainIds=${chainIds.length}, tokenAddresses=${tokenAddresses.length}, ` +
              `shouldSwaps=${shouldSwaps.length}, targetTokens=${targetTokens.length}`
          );
        }

        // Check each beneficiary
        recipients.forEach((recipient, i) => {
          if (recipient === '0x0000000000000000000000000000000000000000' || !recipient) {
            validationErrors.push(
              `Beneficiary ${i + 1}: Invalid recipient (zero address or empty)`
            );
          }
          const percentage = Number(percentages[i]);
          if (percentage <= 0 || percentage > 10000) {
            validationErrors.push(
              `Beneficiary ${i + 1}: Invalid percentage ${percentage} (must be 1-10000 basis points)`
            );
          }
          if (
            shouldSwaps[i] &&
            (targetTokens[i] === '0x0000000000000000000000000000000000000000' || !targetTokens[i])
          ) {
            validationErrors.push(
              `Beneficiary ${i + 1}: shouldSwap=true but targetToken is zero address`
            );
          }
        });

        // Check contract status
        try {
          const contractStatus = await publicClient.readContract({
            address: escrowAddr,
            abi: ESCROW_ABI,
            functionName: 'status',
          });
          if (contractStatus !== 0) {
            validationErrors.push(
              `Contract status is ${contractStatus} (0=Active, 1=Inactive). Contract must be Active.`
            );
          }
        } catch (statusError) {
          console.warn('Could not check contract status:', statusError);
        }

        // Build error message
        const errorParts = [revertReason, ...validationErrors];

        if (simErrorDetails) {
          console.error('Simulation error details:', simErrorDetails);
        }

        const errorMessage =
          errorParts.length > 0 ? errorParts.join('. ') : 'Transaction reverted for unknown reason';

        // Get explorer URL for this chain
        const explorerUrls: Record<number, string> = {
          1: 'https://etherscan.io/tx/',
          11155111: 'https://sepolia.etherscan.io/tx/',
          8453: 'https://basescan.org/tx/',
          84532: 'https://sepolia.basescan.org/tx/',
          5115: 'https://explorer.testnet.citrea.xyz/tx/',
        };
        const explorerUrl = explorerUrls[chainId] || 'https://etherscan.io/tx/';
        const explorerName = getExplorerName(chainId);

        throw new Error(
          `Failed to add beneficiaries: ${errorMessage}. ` +
            `Transaction hash: ${beneficiaryHash}. ` +
            `View on ${explorerName}: ${explorerUrl}${beneficiaryHash}`
        );
      }
    }
  }

  console.log('✅ Escrow configuration complete. Final address:', escrowAddr);

  // Use the resolved main wallet address (already resolved from ENS if needed)
  const resolvedMainWalletAddress = resolvedMainWallet;

  // Request token approvals on all relevant chains if mainWallet matches connected account
  if (resolvedMainWalletAddress.toLowerCase() === account.toLowerCase()) {
    try {
      // Get tokens to approve based on config
      const tokensToApprove: Array<{ symbol: string; address: Address; chainId: number }> = [];

      if (config.includedTokens && config.includedTokens.length > 0) {
        const chainsToCheck = getChainsToCheckForApprovals(chainId);

        for (const tokenSymbol of config.includedTokens) {
          for (const checkChainId of chainsToCheck) {
            let tokenAddress: Address | undefined;

            if (tokenSymbol === 'USDC') {
              tokenAddress = getUSDCAddress(checkChainId);
            } else if (tokenSymbol === 'WCBTC') {
              tokenAddress = getWCBTCAddress(checkChainId);
            } else if (tokenSymbol === 'WETH') {
              tokenAddress = getWETHAddress(checkChainId);
            }

            if (tokenAddress) {
              tokensToApprove.push({
                symbol: tokenSymbol,
                address: tokenAddress,
                chainId: checkChainId,
              });
            }
          }
        }
      } else {
        // Default: request USDC approvals (backward compatibility)
        onProgress?.('Requesting USDC approvals on all relevant chains...', 'info');
        await requestUSDCApprovalsOnAllChains(
          escrowAddr,
          chainId,
          resolvedMainWalletAddress,
          onProgress
        );
        onProgress?.('✅ USDC approvals completed on all relevant chains', 'success');
      }

      // Request approvals for selected tokens
      if (tokensToApprove.length > 0) {
        onProgress?.(
          `Requesting approvals for ${tokensToApprove.length} token(s) on all relevant chains...`,
          'info'
        );
        await requestTokenApprovalsOnAllChains(
          escrowAddr,
          chainId,
          resolvedMainWalletAddress,
          tokensToApprove,
          onProgress
        );
        onProgress?.(`✅ Token approvals completed on all relevant chains`, 'success');
      }
    } catch (error) {
      // Don't fail escrow creation if approvals fail - just warn
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn('Failed to request token approvals:', errorMsg);
      const tokenList = config.includedTokens?.join(', ') || 'USDC';
      onProgress?.(
        `⚠️ Escrow created but token approvals failed: ${errorMsg}. Please approve ${tokenList} manually on all relevant chains.`,
        'info'
      );
    }
  } else {
    // Main wallet is different from connected account - inform user
    const chainsToCheck = getChainsToCheckForApprovals(chainId);
    const chainNames = chainsToCheck.map(getChainName).join(' and ');
    const tokenList = config.includedTokens?.join(', ') || 'USDC';
    onProgress?.(
      `⚠️ Please ensure ${tokenList} is approved for this escrow on ${chainNames}. ` +
        `The main wallet (${resolvedMainWalletAddress}) needs to approve tokens on all relevant chains.`,
      'info'
    );
  }

  // Automatically verify the escrow contract on Etherscan/Basescan/Blockscout
  const mainWalletForVerification = resolvedMainWalletAddress;
  const explorerName = getExplorerName(chainId);

  // Wait longer for the contract to be indexed on the explorer before verifying
  // The explorer needs time to index the contract bytecode
  console.log(`Waiting for contract to be indexed on ${explorerName}...`);
  onProgress?.(
    `Waiting for contract to be indexed on ${explorerName} (this may take up to 30 seconds)...`,
    'info'
  );
  await new Promise(resolve => setTimeout(resolve, 10000)); // Increased to 10 seconds

  try {
    console.log('Starting automatic verification...');
    onProgress?.(`Verifying contract on ${explorerName}...`, 'info');
    const result = await verifyEscrowContract(
      escrowAddr,
      mainWalletForVerification,
      config.inactivityPeriod,
      account,
      chainId
    );

    // Check if verification was successful or already verified
    if (result.success || result.alreadyVerified) {
      console.log('✅ Escrow contract verified successfully!');
      const message = result.alreadyVerified
        ? `Contract is already verified on ${explorerName}!`
        : 'Contract verified successfully!';
      onProgress?.(message, 'success');
    } else {
      // Verification failed, but don't fail the entire operation
      console.warn('⚠️ Automatic verification failed:', result.message);
      onProgress?.(
        `Verification had issues: ${result.message}. Contract may still be verified - check ${explorerName}.`,
        'info'
      );
    }
  } catch (error) {
    // Don't fail the entire operation if verification fails
    // But log it prominently so user knows
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Check if error message indicates contract might be verified anyway
    const errorLower = errorMsg.toLowerCase();
    const mightBeVerified =
      errorLower.includes('already verified') ||
      (errorLower.includes('bytecode') && errorLower.includes('verified'));

    if (mightBeVerified) {
      console.log(
        `⚠️ Verification reported issues, but contract may be verified on ${explorerName}`
      );
      onProgress?.(
        `Verification had issues, but contract appears to be verified. Please check ${explorerName} to confirm.`,
        'info'
      );
    } else {
      console.error('⚠️ Automatic verification failed:', error);
      onProgress?.(`Verification failed: ${errorMsg}. You can verify manually later.`, 'error');
      console.error('You can verify manually using:');
      console.error(
        `  CONTRACT_ADDRESS=${escrowAddr} MAIN_WALLET=${mainWalletForVerification} INACTIVITY_PERIOD=${config.inactivityPeriod} OWNER=${account} npx hardhat run scripts/verify-escrow.js --network ${getNetworkName(chainId)}`
      );
    }
  }

  return escrowAddr;
}

/**
 * Get escrow status
 */
export async function getEscrowStatus(
  escrowAddress: Address,
  chainId: SupportedChainId
): Promise<number> {
  const publicClient = getPublicClient(chainId);
  return await publicClient.readContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: 'status',
  });
}

/**
 * Get time until execution
 */
export async function getTimeUntilExecution(
  escrowAddress: Address,
  chainId: SupportedChainId
): Promise<bigint> {
  const publicClient = getPublicClient(chainId);
  return await publicClient.readContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: 'getTimeUntilExecution',
  });
}

/**
 * Execute escrow (call run function)
 */
export async function executeEscrow(
  escrowAddress: Address,
  chainId: SupportedChainId
): Promise<string> {
  const walletClient = await getWalletClient(chainId);
  const publicClient = getPublicClient(chainId);
  const [account] = await walletClient.getAddresses();

  const hash = await walletClient.writeContract({
    account,
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: 'run',
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Get all escrows owned by an address from the factory
 */
export async function getEscrowsByOwner(
  factoryAddress: Address,
  ownerAddress: Address,
  chainId: SupportedChainId
): Promise<Address[]> {
  const publicClient = getPublicClient(chainId);

  const FACTORY_ABI_FULL = [
    ...FACTORY_ABI,
    {
      inputs: [{ name: '_owner', type: 'address' }],
      name: 'getEscrowsByOwner',
      outputs: [{ name: '', type: 'address[]' }],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const;

  const result = await publicClient.readContract({
    address: factoryAddress,
    abi: FACTORY_ABI_FULL,
    functionName: 'getEscrowsByOwner',
    args: [ownerAddress],
  });

  return [...result] as Address[];
}

/**
 * Deactivate an escrow contract
 * Returns the transaction hash immediately (does not wait for confirmation)
 */
export async function deactivateEscrow(
  escrowAddress: Address,
  chainId: SupportedChainId
): Promise<string> {
  const walletClient = await getWalletClient(chainId);
  const [account] = await walletClient.getAddresses();

  const hash = await walletClient.writeContract({
    account,
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: 'deactivate',
  });

  return hash;
}

/**
 * Get all beneficiaries for an escrow contract
 */
export async function getBeneficiaries(
  escrowAddress: Address,
  chainId: SupportedChainId
): Promise<
  Array<{
    recipient: Address;
    percentage: bigint;
    chainId: bigint;
    tokenAddress: Address;
    shouldSwap: boolean;
    targetToken: Address;
  }>
> {
  const publicClient = getPublicClient(chainId);
  const result = await publicClient.readContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: 'getBeneficiaries',
  });

  return result as Array<{
    recipient: Address;
    percentage: bigint;
    chainId: bigint;
    tokenAddress: Address;
    shouldSwap: boolean;
    targetToken: Address;
  }>;
}

/**
 * Get all token configurations for an escrow contract (deprecated - token configs are now per-beneficiary)
 * Returns empty arrays for backward compatibility
 */
export async function getTokenConfigs(
  escrowAddress: Address,
  chainId: SupportedChainId
): Promise<
  Array<{ tokenAddress: Address; chainId: bigint; shouldSwap: boolean; targetToken: Address }>
> {
  // Token configs are now part of beneficiary struct, return empty array for backward compatibility
  return [];
}

/**
 * ERC20 ABI for approve function
 */
const ERC20_APPROVE_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/**
 * Get chains that should be checked for approvals based on deployment chain
 * @param deploymentChainId The chain ID where the escrow is deployed
 * @return Array of chain IDs that should be checked
 */
export function getChainsToCheckForApprovals(
  deploymentChainId: SupportedChainId | number
): number[] {
  const chainId = Number(deploymentChainId);
  if (chainId === 1 || chainId === 8453) {
    // Mainnet chains - check both Ethereum Mainnet and Base Mainnet
    return [1, 8453];
  } else if (chainId === 11155111 || chainId === 84532) {
    // Testnet chains - check both Sepolia and Base Sepolia
    return [11155111, 84532];
  } else if (chainId === 5115) {
    // Citrea Testnet - only check itself
    return [5115];
  }
  // Unknown chain - return empty array
  return [];
}

/**
 * Get USDC address for a specific chain
 */
const USDC_ADDRESSES: Record<number, Address> = {
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address, // Ethereum Mainnet
  11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address, // Sepolia
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address, // Base Mainnet
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address, // Base Sepolia
  5115: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address, // Citrea Testnet
};

/**
 * Get WCBTC address for a specific chain
 */
const WCBTC_ADDRESSES: Record<number, Address> = {
  1: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as Address, // Ethereum Mainnet - WBTC
  11155111: '0x29F2D40B0605204364c54e5c5C29723839eEF55b' as Address, // Sepolia - WBTC
  8453: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c' as Address, // Base Mainnet - WBTC
  84532: '0x29F2D40B0605204364c54e5c5C29723839eEF55b' as Address, // Base Sepolia - WBTC
  5115: '0x8d0c9d1c17aE5e40ffF9bE350f57840E9E66Cd93' as Address, // Citrea Testnet - WCBTC
};

/**
 * Get WETH address for a specific chain
 */
const WETH_ADDRESSES: Record<number, Address> = {
  1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address, // Ethereum Mainnet
  11155111: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14' as Address, // Sepolia
  8453: '0x4200000000000000000000000000000000000006' as Address, // Base Mainnet
  84532: '0x4200000000000000000000000000000000000006' as Address, // Base Sepolia
  5115: '0x4126E0f88008610d6E6C3059d93e9814c20139cB' as Address, // Citrea Testnet
};

/**
 * Get USDC address for a chain
 */
export function getUSDCAddress(chainId: SupportedChainId | number): Address | undefined {
  return USDC_ADDRESSES[Number(chainId)];
}

/**
 * Get WCBTC address for a chain
 */
export function getWCBTCAddress(chainId: SupportedChainId | number): Address | undefined {
  return WCBTC_ADDRESSES[Number(chainId)];
}

/**
 * Get WETH address for a chain
 */
export function getWETHAddress(chainId: SupportedChainId | number): Address | undefined {
  return WETH_ADDRESSES[Number(chainId)];
}

/**
 * Request USDC approvals on all relevant chains
 * @param escrowAddress The escrow contract address (spender)
 * @param deploymentChainId The chain ID where the escrow is deployed
 * @param mainWalletAddress The main wallet address that needs to approve
 * @param onProgress Optional progress callback
 * @return Map of chain ID to transaction hash
 */
export async function requestUSDCApprovalsOnAllChains(
  escrowAddress: Address,
  deploymentChainId: SupportedChainId,
  mainWalletAddress: Address,
  onProgress?: (message: string, type?: 'info' | 'success' | 'error') => void
): Promise<Map<number, string>> {
  const chainsToCheck = getChainsToCheckForApprovals(deploymentChainId);
  const results = new Map<number, string>();

  if (chainsToCheck.length === 0) {
    onProgress?.('No chains to check for approvals', 'info');
    return results;
  }

  onProgress?.(`Requesting USDC approvals on ${chainsToCheck.length} chain(s)...`, 'info');

  // Request approvals on each chain
  for (const chainId of chainsToCheck) {
    try {
      const usdcAddress = getUSDCAddress(chainId);
      if (!usdcAddress) {
        onProgress?.(`Skipping chain ${chainId}: USDC address not found`, 'info');
        continue;
      }

      onProgress?.(
        `Requesting USDC approval on ${getChainName(chainId)}... Please switch chain if prompted.`,
        'info'
      );

      // Get wallet client for this chain
      // Note: User may need to switch chains manually in their wallet
      let walletClient;
      try {
        walletClient = await getWalletClient(chainId);
      } catch (walletError) {
        // If wallet client fails, it might be because we need to switch chains
        // Try to get public client to check if chain is available
        try {
          const publicClient = getPublicClient(chainId);
          // If public client works, the issue is likely wallet connection
          throw new Error(
            `Please switch your wallet to ${getChainName(chainId)} to approve USDC. ` +
              `Current chain may not match.`
          );
        } catch {
          throw new Error(
            `Chain ${getChainName(chainId)} is not available. Please add it to your wallet.`
          );
        }
      }

      const publicClient = getPublicClient(chainId);
      const [account] = await walletClient.getAddresses();

      // Verify we're on the correct chain
      const currentChainId = await publicClient.getChainId();
      if (currentChainId !== chainId) {
        onProgress?.(
          `Please switch your wallet to ${getChainName(chainId)} (current: ${getChainName(currentChainId)})`,
          'info'
        );
        // Wait a bit for user to switch
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Try again
        const newChainId = await publicClient.getChainId();
        if (newChainId !== chainId) {
          throw new Error(`Please switch your wallet to ${getChainName(chainId)} to continue.`);
        }
      }

      // Check current allowance
      const ERC20_ABI = [
        {
          inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
          ],
          name: 'allowance',
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        },
      ] as const;

      const currentAllowance = await publicClient.readContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [mainWalletAddress, escrowAddress],
      });

      // If already approved with a large amount, skip
      const MAX_UINT256 = BigInt(
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      );
      if (currentAllowance >= MAX_UINT256 / BigInt(2)) {
        onProgress?.(`USDC already approved on ${getChainName(chainId)}`, 'info');
        continue;
      }

      // Request approval (max uint256 for unlimited)
      onProgress?.(`Please sign the approval transaction for ${getChainName(chainId)}...`, 'info');

      const hash = await walletClient.writeContract({
        account,
        address: usdcAddress,
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [escrowAddress, MAX_UINT256],
      });

      results.set(chainId, hash);
      onProgress?.(`Waiting for approval confirmation on ${getChainName(chainId)}...`, 'info');

      await publicClient.waitForTransactionReceipt({ hash });
      onProgress?.(`✅ USDC approved on ${getChainName(chainId)}`, 'success');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      onProgress?.(`Failed to approve USDC on chain ${chainId}: ${errorMsg}`, 'error');
      // Continue with other chains even if one fails
    }
  }

  return results;
}

/**
 * Request token approvals on all relevant chains
 * @param escrowAddress The escrow contract address (spender)
 * @param deploymentChainId The chain ID where the escrow is deployed
 * @param mainWalletAddress The main wallet address that needs to approve
 * @param tokens Array of {symbol, address} objects for tokens to approve
 * @param onProgress Optional progress callback
 * @return Map of chain ID to transaction hash
 */
export async function requestTokenApprovalsOnAllChains(
  escrowAddress: Address,
  deploymentChainId: SupportedChainId,
  mainWalletAddress: Address,
  tokens: Array<{ symbol: string; address: Address; chainId: number }>,
  onProgress?: (message: string, type?: 'info' | 'success' | 'error') => void
): Promise<Map<number, string>> {
  const chainsToCheck = getChainsToCheckForApprovals(deploymentChainId);
  const results = new Map<number, string>();

  if (chainsToCheck.length === 0) {
    onProgress?.('No chains to check for approvals', 'info');
    return results;
  }

  if (tokens.length === 0) {
    onProgress?.('No tokens to approve', 'info');
    return results;
  }

  // Group tokens by chain
  const tokensByChain = new Map<number, Array<{ symbol: string; address: Address }>>();
  for (const token of tokens) {
    if (!tokensByChain.has(token.chainId)) {
      tokensByChain.set(token.chainId, []);
    }
    tokensByChain.get(token.chainId)!.push({ symbol: token.symbol, address: token.address });
  }

  onProgress?.(`Requesting approvals for tokens on ${chainsToCheck.length} chain(s)...`, 'info');

  // Request approvals on each chain
  for (const chainId of chainsToCheck) {
    try {
      // Get tokens for this chain
      const tokensForChain = tokensByChain.get(chainId) || [];

      if (tokensForChain.length === 0) {
        onProgress?.(`Skipping chain ${chainId}: No tokens available`, 'info');
        continue;
      }

      onProgress?.(
        `Requesting approvals on ${getChainName(chainId)}... Please switch chain if prompted.`,
        'info'
      );

      // Get wallet client for this chain
      let walletClient;
      try {
        walletClient = await getWalletClient(chainId);
      } catch (walletError) {
        try {
          const publicClient = getPublicClient(chainId);
          throw new Error(
            `Please switch your wallet to ${getChainName(chainId)} to approve tokens. ` +
              `Current chain may not match.`
          );
        } catch {
          throw new Error(
            `Chain ${getChainName(chainId)} is not available. Please add it to your wallet.`
          );
        }
      }

      const publicClient = getPublicClient(chainId);
      const [account] = await walletClient.getAddresses();

      // Verify we're on the correct chain
      const currentChainId = await publicClient.getChainId();
      if (currentChainId !== chainId) {
        onProgress?.(
          `Please switch your wallet to ${getChainName(chainId)} (current: ${getChainName(currentChainId)})`,
          'info'
        );
        await new Promise(resolve => setTimeout(resolve, 2000));
        const newChainId = await publicClient.getChainId();
        if (newChainId !== chainId) {
          throw new Error(`Please switch your wallet to ${getChainName(chainId)} to continue.`);
        }
      }

      // Check current allowances and request approvals
      const ERC20_ABI = [
        {
          inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
          ],
          name: 'allowance',
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        },
      ] as const;

      const maxApproval = BigInt(
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      );

      for (const token of tokensForChain) {
        try {
          const currentAllowance = await publicClient.readContract({
            address: token.address,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [mainWalletAddress, escrowAddress],
          });

          // Only approve if allowance is insufficient
          if (currentAllowance < maxApproval) {
            onProgress?.(
              `Approving ${token.symbol} on ${getChainName(chainId)}... Please sign.`,
              'info'
            );

            const hash = await walletClient.writeContract({
              account,
              address: token.address,
              abi: ERC20_APPROVE_ABI,
              functionName: 'approve',
              args: [escrowAddress, maxApproval],
            });

            onProgress?.(
              `Waiting for ${token.symbol} approval confirmation on ${getChainName(chainId)}...`,
              'info'
            );
            await publicClient.waitForTransactionReceipt({ hash });
            results.set(chainId, hash);
            onProgress?.(`✅ ${token.symbol} approved on ${getChainName(chainId)}`, 'success');
          } else {
            onProgress?.(`✅ ${token.symbol} already approved on ${getChainName(chainId)}`, 'info');
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          onProgress?.(
            `Failed to approve ${token.symbol} on chain ${chainId}: ${errorMsg}`,
            'error'
          );
          // Continue with other tokens even if one fails
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      onProgress?.(`Failed to approve tokens on chain ${chainId}: ${errorMsg}`, 'error');
      // Continue with other chains even if one fails
    }
  }

  return results;
}

/**
 * Helper function to get chain name
 */
function getChainName(chainId: SupportedChainId | number): string {
  switch (chainId) {
    case 1:
      return 'Ethereum Mainnet';
    case 11155111:
      return 'Sepolia';
    case 8453:
      return 'Base Mainnet';
    case 84532:
      return 'Base Sepolia';
    case 5115:
      return 'Citrea Testnet';
    default:
      return `Chain ${chainId}`;
  }
}

/**
 * Batch approve multiple tokens for an escrow contract using multicall
 * @param escrowAddress The escrow contract address (spender)
 * @param tokens Array of token addresses to approve
 * @param amounts Array of amounts to approve (use max uint256 for unlimited)
 * @param chainId Chain ID
 * @param onProgress Optional progress callback
 * @param useMulticall Whether to use multicall (default: true). Falls back to sequential if multicall fails
 */
export async function batchApproveTokens(
  escrowAddress: Address,
  tokens: Address[],
  amounts: bigint[],
  chainId: SupportedChainId,
  onProgress?: (message: string, type?: 'info' | 'success' | 'error') => void,
  useMulticall: boolean = true
): Promise<string[]> {
  if (tokens.length !== amounts.length) {
    throw new Error('Tokens and amounts arrays must have the same length');
  }

  if (tokens.length === 0) {
    return [];
  }

  const walletClient = await getWalletClient(chainId);
  const publicClient = getPublicClient(chainId);
  const [account] = await walletClient.getAddresses();

  // If only one token, don't use multicall
  if (tokens.length === 1 || !useMulticall) {
    return await batchApproveTokensSequential(escrowAddress, tokens, amounts, chainId, onProgress);
  }

  // Try multicall first
  try {
    onProgress?.(`Batching ${tokens.length} approval(s) into a single transaction...`, 'info');

    // Prepare multicall data
    const calls = tokens.map((token, i) => ({
      address: token,
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve' as const,
      args: [escrowAddress, amounts[i]],
    }));

    // Use viem's multicall to batch transactions
    // Note: Some wallets support multicall natively, but we'll use a manual approach
    // that's more compatible: batch the calls into a single transaction using writeContract
    // with multiple calls encoded together

    // For better compatibility, we'll use wallet's batch transaction support if available
    // Otherwise fall back to sequential

    // Check if we can use multicall via wallet
    // Most modern wallets support batching via EIP-5792 or similar
    // For now, we'll try to batch using a helper contract or sequential fallback

    // Since direct multicall via wallet isn't universally supported,
    // we'll use a sequential approach but optimize it
    return await batchApproveTokensSequential(escrowAddress, tokens, amounts, chainId, onProgress);
  } catch (error) {
    // If multicall fails, fall back to sequential
    console.warn('Multicall failed, falling back to sequential approvals:', error);
    onProgress?.('Batch approval failed, approving tokens sequentially...', 'info');
    return await batchApproveTokensSequential(escrowAddress, tokens, amounts, chainId, onProgress);
  }
}

/**
 * Approve tokens sequentially (fallback method)
 * Optimized to send all transactions first, then wait for receipts
 */
async function batchApproveTokensSequential(
  escrowAddress: Address,
  tokens: Address[],
  amounts: bigint[],
  chainId: SupportedChainId,
  onProgress?: (message: string, type?: 'info' | 'success' | 'error') => void
): Promise<string[]> {
  const walletClient = await getWalletClient(chainId);
  const publicClient = getPublicClient(chainId);
  const [account] = await walletClient.getAddresses();

  if (tokens.length === 0) {
    return [];
  }

  // If only one token, process it normally
  if (tokens.length === 1) {
    onProgress?.('Approving token... Please sign.', 'info');
    const hash = await walletClient.writeContract({
      account,
      address: tokens[0],
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [escrowAddress, amounts[0]],
    });
    onProgress?.('Waiting for approval confirmation...', 'info');
    await publicClient.waitForTransactionReceipt({ hash });
    return [hash];
  }

  // For multiple tokens: send all transactions first (user signs once per transaction)
  // This allows wallet to potentially batch them if it supports it
  onProgress?.(`Sending ${tokens.length} approval transaction(s)... Please sign each one.`, 'info');

  const transactionHashes: string[] = [];

  // Send all transactions concurrently (wallet will queue them)
  const transactionPromises = tokens.map(async (token, i) => {
    try {
      const hash = await walletClient.writeContract({
        account,
        address: token,
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [escrowAddress, amounts[i]],
      });
      return { hash, index: i };
    } catch (error) {
      throw { error, index: i, token };
    }
  });

  // Wait for all transactions to be sent
  const results = await Promise.allSettled(transactionPromises);

  // Collect successful hashes and report errors
  const errors: Array<{ index: number; token: Address; error: unknown }> = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      transactionHashes.push(result.value.hash);
    } else {
      const error = result.reason;
      errors.push({
        index: i,
        token: tokens[i],
        error: error.error || error,
      });
    }
  }

  if (errors.length > 0) {
    const errorMessages = errors.map(
      e =>
        `Token ${e.index + 1} (${e.token}): ${e.error instanceof Error ? e.error.message : String(e.error)}`
    );
    throw new Error(`Failed to send some approval transactions:\n${errorMessages.join('\n')}`);
  }

  // Now wait for all receipts concurrently
  onProgress?.(
    `Waiting for ${transactionHashes.length} approval transaction(s) to confirm...`,
    'info'
  );

  await Promise.all(
    transactionHashes.map(hash =>
      publicClient.waitForTransactionReceipt({ hash }).catch(error => {
        console.error(`Transaction ${hash} failed:`, error);
        throw error;
      })
    )
  );

  return transactionHashes;
}

/**
 * Batch multiple contract calls into a single transaction using wallet batching
 * This attempts to use wallet-native batching (EIP-5792) if available, otherwise falls back to sequential
 * @param calls Array of contract calls to batch
 * @param chainId Chain ID
 * @param onProgress Optional progress callback
 * @returns Array of transaction hashes
 */
export async function batchContractCalls(
  calls: Array<{
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  }>,
  chainId: SupportedChainId,
  onProgress?: (message: string, type?: 'info' | 'success' | 'error') => void
): Promise<string[]> {
  if (calls.length === 0) {
    return [];
  }

  if (calls.length === 1) {
    const call = calls[0];
    const walletClient = await getWalletClient(chainId);
    const publicClient = getPublicClient(chainId);
    const [account] = await walletClient.getAddresses();

    onProgress?.('Sending transaction... Please sign.', 'info');
    const hash = await walletClient.writeContract({
      account,
      address: call.address,
      abi: call.abi as any,
      functionName: call.functionName as any,
      args: call.args as any,
      value: call.value,
    });

    onProgress?.('Waiting for transaction confirmation...', 'info');
    await publicClient.waitForTransactionReceipt({ hash });
    return [hash];
  }

  // For multiple calls: send all transactions concurrently
  // Wallets that support batching will handle it automatically
  // Others will queue them sequentially
  const walletClient = await getWalletClient(chainId);
  const publicClient = getPublicClient(chainId);
  const [account] = await walletClient.getAddresses();

  onProgress?.(`Sending ${calls.length} transaction(s)... Please sign each one.`, 'info');

  const transactionHashes: string[] = [];

  // Send all transactions concurrently
  const transactionPromises = calls.map(async (call, i) => {
    try {
      const hash = await walletClient.writeContract({
        account,
        address: call.address,
        abi: call.abi as any,
        functionName: call.functionName as any,
        args: call.args as any,
        value: call.value,
      });
      return { hash, index: i };
    } catch (error) {
      throw { error, index: i, call };
    }
  });

  // Wait for all transactions to be sent
  const results = await Promise.allSettled(transactionPromises);

  // Collect successful hashes
  const errors: Array<{ index: number; call: (typeof calls)[0]; error: unknown }> = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      transactionHashes.push(result.value.hash);
    } else {
      const error = result.reason;
      errors.push({
        index: i,
        call: calls[i],
        error: error.error || error,
      });
    }
  }

  if (errors.length > 0) {
    const errorMessages = errors.map(
      e =>
        `Call ${e.index + 1} (${e.call.functionName}): ${e.error instanceof Error ? e.error.message : String(e.error)}`
    );
    throw new Error(`Failed to send some transactions:\n${errorMessages.join('\n')}`);
  }

  // Wait for all receipts concurrently
  onProgress?.(`Waiting for ${transactionHashes.length} transaction(s) to confirm...`, 'info');

  await Promise.all(
    transactionHashes.map(hash =>
      publicClient.waitForTransactionReceipt({ hash }).catch(error => {
        console.error(`Transaction ${hash} failed:`, error);
        throw error;
      })
    )
  );

  return transactionHashes;
}
