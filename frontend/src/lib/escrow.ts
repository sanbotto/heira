/**
 * Escrow contract interaction utilities
 */

import { getPublicClient, getWalletClient, type SupportedChainId } from './wallet';
import { parseEther, formatEther, type Address } from 'viem';

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
] as const;

export interface BeneficiaryConfig {
  recipient: Address;
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
  mainWallet: Address;
  inactivityPeriod: number; // seconds
  beneficiaries: BeneficiaryConfig[];
  tokenConfigs: TokenConfig[];
}

/**
 * Create a new escrow contract
 */
export async function createEscrow(
  factoryAddress: Address,
  config: EscrowConfig,
  chainId: SupportedChainId
): Promise<Address> {
  const walletClient = getWalletClient(chainId);
  const publicClient = getPublicClient(chainId);

  const [account] = await walletClient.getAddresses();
  const hash = await walletClient.writeContract({
    account,
    address: factoryAddress,
    abi: FACTORY_ABI,
    functionName: 'createEscrow',
    args: [config.mainWallet, BigInt(config.inactivityPeriod)],
  });

  await publicClient.waitForTransactionReceipt({ hash });

  // Get the escrow address from events
  const receipt = await publicClient.getTransactionReceipt({ hash });
  const escrowAddress = receipt.logs[0].topics[1] as Address;

  // Configure beneficiaries
  for (const beneficiary of config.beneficiaries) {
    await walletClient.writeContract({
      account,
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: 'addBeneficiary',
      args: [
        beneficiary.recipient,
        BigInt(Math.floor(beneficiary.percentage * 100)), // Convert to basis points
        BigInt(beneficiary.chainId),
      ],
    });
  }

  // Configure tokens
  for (const tokenConfig of config.tokenConfigs) {
    await walletClient.writeContract({
      account: account,
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: 'addTokenConfig',
      args: [
        tokenConfig.tokenAddress,
        BigInt(tokenConfig.chainId),
        tokenConfig.shouldSwap,
        tokenConfig.targetToken || '0x0000000000000000000000000000000000000000',
      ],
    });
  }

  return escrowAddress;
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
