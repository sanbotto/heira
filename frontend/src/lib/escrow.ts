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
} from 'viem';

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
    inputs: [
      { name: '_mainWallet', type: 'string' },
      { name: '_inactivityPeriod', type: 'uint256' },
    ],
    name: 'createEscrowENS',
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
    ],
    name: 'addBeneficiary',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_recipient', type: 'string' },
      { name: '_percentage', type: 'uint256' },
      { name: '_chainId', type: 'uint256' },
    ],
    name: 'addBeneficiaryENS',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
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
  {
    inputs: [
      { name: '_tokenAddress', type: 'address' },
      { name: '_chainId', type: 'uint256' },
      { name: '_shouldSwap', type: 'bool' },
      { name: '_targetToken', type: 'address' },
    ],
    name: 'addTokenConfig',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_tokenAddresses', type: 'address[]' },
      { name: '_chainIds', type: 'uint256[]' },
      { name: '_shouldSwaps', type: 'bool[]' },
      { name: '_targetTokens', type: 'address[]' },
    ],
    name: 'addTokenConfigsBatch',
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
] as const;

export interface BeneficiaryConfig {
  recipient: Address | string; // Address or ENS name
  percentage: number; // 0-100
  chainId: SupportedChainId;
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
  tokenConfigs: TokenConfig[];
}

/**
 * Map chain ID to network name for verification API
 */
function getNetworkName(chainId: SupportedChainId): string {
  const networkMap: Record<SupportedChainId, string> = {
    1: 'mainnet',
    11155111: 'sepolia',
    8453: 'base',
    84532: 'baseSepolia',
  };
  return networkMap[chainId] || 'sepolia';
}

/**
 * Automatically verify an escrow contract on Etherscan/Basescan
 */
async function verifyEscrowContract(
  escrowAddress: Address,
  mainWallet: Address | string,
  inactivityPeriod: number,
  owner: Address,
  chainId: SupportedChainId
): Promise<void> {
  // Ensure mainWallet is an address string (not ENS name)
  const mainWalletAddress =
    typeof mainWallet === 'string' && mainWallet.startsWith('0x')
      ? mainWallet
      : typeof mainWallet === 'string'
        ? mainWallet // If it's still a string but not an address, it might be an ENS name - this shouldn't happen if we use resolvedMainWallet
        : mainWallet;

  const networkName = getNetworkName(chainId);

  try {
    const response = await fetch('/api/verify-escrow', {
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

    if (!result.success) {
      throw new Error(result.message || result.details || 'Verification failed');
    }

    if (result.explorerUrl) {
      console.log(`✅ Escrow verified: ${result.explorerUrl}`);
    }
  } catch (error) {
    // Re-throw with more context, but include the original error details
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to verify escrow: ${errorMessage}`);
  }
}

/**
 * Create a new escrow contract
 * Automatically deactivates all previous active escrows for the same owner
 */
export async function createEscrow(
  factoryAddress: Address,
  config: EscrowConfig,
  chainId: SupportedChainId
): Promise<Address> {
  const walletClient = getWalletClient(chainId);
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

  // Validate mainWallet input
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
    }
  } else {
    // Should be an Address type
    if (!config.mainWallet || config.mainWallet === '0x0000000000000000000000000000000000000000') {
      throw new Error('Invalid main wallet address: cannot be zero address');
    }
  }

  // Use ENS function if mainWallet is a string (ENS name), otherwise use address function
  const isMainWalletENS =
    typeof config.mainWallet === 'string' && config.mainWallet.endsWith('.eth');

  // Simulate the transaction first to catch revert reasons
  // Try multiple methods to get the revert reason
  let simulationError: any = null;

  try {
    await publicClient.simulateContract({
      account,
      address: factoryAddress,
      abi: FACTORY_ABI,
      functionName: isMainWalletENS ? 'createEscrowENS' : 'createEscrow',
      args: [config.mainWallet, BigInt(config.inactivityPeriod)],
    });
  } catch (error: any) {
    simulationError = error;

    // Try to get better error details using call (sometimes gives better errors)
    try {
      const functionData = encodeFunctionData({
        abi: FACTORY_ABI,
        functionName: isMainWalletENS ? 'createEscrowENS' : 'createEscrow',
        args: [config.mainWallet, BigInt(config.inactivityPeriod)],
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
          functionName: isMainWalletENS ? 'createEscrowENS' : 'createEscrow',
          args: [config.mainWallet, BigInt(config.inactivityPeriod)],
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
      const inputType = isMainWalletENS ? 'ENS name' : 'address';
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
        `- ${isMainWalletENS ? `ENS name "${config.mainWallet}" may not exist or be resolvable on ${chainName}` : 'Invalid address format'}\n` +
        `- Invalid inactivity period: ${config.inactivityPeriod} seconds\n` +
        `- Contract validation error\n\n` +
        `Debugging steps:\n` +
        `1. ${isMainWalletENS ? `Try using a plain Ethereum address (0x...) instead of the ENS name` : 'Verify the address is correct'}\n` +
        `2. Check if the ENS name exists: https://app.ens.domains/name/${isMainWalletENS ? config.mainWallet : 'your-name.eth'}\n` +
        `3. Verify the factory contract address: ${factoryAddress}\n` +
        `4. Check the transaction on a block explorer to see the actual revert reason\n\n` +
        `Your inputs:\n` +
        `- Main wallet: ${config.mainWallet}\n` +
        `- Inactivity period: ${config.inactivityPeriod} seconds\n` +
        `- Chain: ${chainName} (${chainId})`;
    }

    throw new Error(revertReason);
  }

  const hash = await walletClient.writeContract({
    account,
    address: factoryAddress,
    abi: FACTORY_ABI,
    functionName: isMainWalletENS ? 'createEscrowENS' : 'createEscrow',
    args: [config.mainWallet, BigInt(config.inactivityPeriod)],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Check if transaction succeeded
  if (receipt.status === 'reverted') {
    // Try to get the revert reason by simulating the call
    try {
      await publicClient.simulateContract({
        account,
        address: factoryAddress,
        abi: FACTORY_ABI,
        functionName: isMainWalletENS ? 'createEscrowENS' : 'createEscrow',
        args: [config.mainWallet, BigInt(config.inactivityPeriod)],
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
        '- ENS name resolution failed (check if ENS name exists and is resolvable on this chain)\n' +
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
  // Separate addresses from ENS names - use batch for addresses, individual calls for ENS
  if (config.beneficiaries.length > 0) {
    const addressBeneficiaries: Array<{ recipient: Address; percentage: number; chainId: number }> =
      [];
    const ensBeneficiaries: Array<{ recipient: string; percentage: number; chainId: number }> = [];

    // Separate beneficiaries into addresses and ENS names
    for (const beneficiary of config.beneficiaries) {
      const isENS =
        typeof beneficiary.recipient === 'string' && beneficiary.recipient.endsWith('.eth');

      if (isENS) {
        ensBeneficiaries.push({
          recipient: beneficiary.recipient as string,
          percentage: beneficiary.percentage,
          chainId: beneficiary.chainId,
        });
      } else {
        const address =
          typeof beneficiary.recipient === 'string'
            ? (beneficiary.recipient as Address)
            : beneficiary.recipient;
        addressBeneficiaries.push({
          recipient: address,
          percentage: beneficiary.percentage,
          chainId: beneficiary.chainId,
        });
      }
    }

    // Batch add address-based beneficiaries in a single transaction
    if (addressBeneficiaries.length > 0) {
      const recipients = addressBeneficiaries.map(b => b.recipient);
      const percentages = addressBeneficiaries.map(b => BigInt(Math.floor(b.percentage * 100)));
      const chainIds = addressBeneficiaries.map(b => BigInt(b.chainId));

      console.log(
        `📝 Adding ${addressBeneficiaries.length} address-based beneficiaries to escrow:`,
        escrowAddr
      );
      const beneficiaryHash = await walletClient.writeContract({
        account,
        address: escrowAddr,
        abi: ESCROW_ABI,
        functionName: 'addBeneficiariesBatch',
        args: [recipients, percentages, chainIds],
      });
      console.log('   Transaction hash:', beneficiaryHash);
      await publicClient.waitForTransactionReceipt({ hash: beneficiaryHash });
    }

    // Add ENS-based beneficiaries individually (contract handles ENS resolution)
    for (const beneficiary of ensBeneficiaries) {
      console.log(`📝 Adding ENS beneficiary ${beneficiary.recipient} to escrow:`, escrowAddr);
      const ensHash = await walletClient.writeContract({
        account,
        address: escrowAddr,
        abi: ESCROW_ABI,
        functionName: 'addBeneficiaryENS',
        args: [
          beneficiary.recipient,
          BigInt(Math.floor(beneficiary.percentage * 100)), // Convert to basis points
          BigInt(beneficiary.chainId),
        ],
      });
      console.log('   Transaction hash:', ensHash);
      await publicClient.waitForTransactionReceipt({ hash: ensHash });
    }
  }

  // Configure tokens using batch function to reduce transactions
  if (config.tokenConfigs.length > 0) {
    const tokenAddresses: Address[] = [];
    const chainIds: bigint[] = [];
    const shouldSwaps: boolean[] = [];
    const targetTokens: Address[] = [];

    for (const tokenConfig of config.tokenConfigs) {
      tokenAddresses.push(tokenConfig.tokenAddress);
      chainIds.push(BigInt(tokenConfig.chainId));
      shouldSwaps.push(tokenConfig.shouldSwap);
      targetTokens.push(tokenConfig.targetToken || '0x0000000000000000000000000000000000000000');
    }

    // Batch add all token configs in a single transaction
    console.log(`📝 Adding ${config.tokenConfigs.length} token configs to escrow:`, escrowAddr);
    const tokenHash = await walletClient.writeContract({
      account,
      address: escrowAddr,
      abi: ESCROW_ABI,
      functionName: 'addTokenConfigsBatch',
      args: [tokenAddresses, chainIds, shouldSwaps, targetTokens],
    });
    console.log('   Transaction hash:', tokenHash);
    await publicClient.waitForTransactionReceipt({ hash: tokenHash });
  }

  console.log('✅ Escrow configuration complete. Final address:', escrowAddr);

  // Automatically verify the escrow contract on Etherscan/Basescan
  // Use the resolved main wallet address from the event (handles ENS resolution)
  const mainWalletForVerification =
    resolvedMainWallet ||
    (typeof config.mainWallet === 'string' && config.mainWallet.startsWith('0x')
      ? config.mainWallet
      : config.mainWallet);

  // Wait a bit for the contract to be indexed on Etherscan before verifying
  console.log('Waiting for contract to be indexed on Etherscan...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    console.log('Starting automatic verification...');
    await verifyEscrowContract(
      escrowAddr,
      mainWalletForVerification,
      config.inactivityPeriod,
      account,
      chainId
    );
    console.log('✅ Escrow contract verified successfully!');
  } catch (error) {
    // Don't fail the entire operation if verification fails
    // But log it prominently so user knows
    console.error('⚠️ Automatic verification failed:', error);
    console.error('You can verify manually using:');
    console.error(
      `  CONTRACT_ADDRESS=${escrowAddr} MAIN_WALLET=${mainWalletForVerification} INACTIVITY_PERIOD=${config.inactivityPeriod} OWNER=${account} npx hardhat run scripts/verify-escrow.js --network ${getNetworkName(chainId)}`
    );
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
  const walletClient = getWalletClient(chainId);
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
  const walletClient = getWalletClient(chainId);
  const [account] = await walletClient.getAddresses();

  const hash = await walletClient.writeContract({
    account,
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: 'deactivate',
  });

  return hash;
}
