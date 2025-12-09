/**
 * Token balance queries using The Graph public subgraphs
 */

import { getPublicClient, type SupportedChainId } from './wallet';
import { type Address, formatUnits } from 'viem';

export interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  chainId: number;
  usdValue?: number;
}

// The Graph public subgraph endpoints
const SUBGRAPH_ENDPOINTS: Record<number, string | null> = {
  11155111:
    'https://gateway.thegraph.com/api/subgraphs/id/F2bsVgAZjpkgRfGj4okjDPjJ4Nep8GbTFa29BVABF2y4', // Ethereum Sepolia
  84532:
    'https://gateway.thegraph.com/api/subgraphs/id/BDp94TTkobSoznjvUp65nb1uv6fUvRLHJLVCbQqmXom3', // Base Sepolia
};

/**
 * Query token balances for an address
 * Queries the current chain and includes native token balance
 */
export async function getTokenBalances(address: string, chainId?: number): Promise<TokenBalance[]> {
  const balances: TokenBalance[] = [];

  // If chainId is provided, query that chain
  // Otherwise query all supported chains
  const chainsToQuery = chainId ? [chainId] : [11155111, 84532, 5115]; // Sepolia, Base Sepolia, Citrea Testnet

  for (const chain of chainsToQuery) {
    try {
      const chainBalances = await queryChainBalances(address, chain);
      balances.push(...chainBalances);
    } catch (error) {
      console.error(`Failed to fetch balances for chain ${chain}:`, error);
    }
  }

  // Add native token balance for each chain
  for (const chain of chainsToQuery) {
    try {
      const publicClient = getPublicClient(chain as SupportedChainId);
      const balanceWei = await publicClient.getBalance({
        address: address as Address,
      });

      if (balanceWei > 0n) {
        const chainName = getChainNativeTokenName(chain);
        balances.push({
          address: '0x0000000000000000000000000000000000000000', // Native token address
          symbol: chainName,
          name: getChainNativeTokenFullName(chain),
          balance: balanceWei.toString(),
          decimals: 18,
          chainId: chain,
        });
      }
    } catch (error) {
      console.error(`Failed to fetch native balance for chain ${chain}:`, error);
    }
  }

  return balances;
}

/**
 * Get native token name for a chain
 */
function getChainNativeTokenName(chainId: number): string {
  switch (chainId) {
    case 11155111:
      return 'ETH';
    case 84532:
      return 'ETH'; // Base also uses ETH
    case 5115:
      return 'cBTC'; // Citrea Testnet uses cBTC
    default:
      return 'ETH';
  }
}

/**
 * Get native token full name for a chain
 */
function getChainNativeTokenFullName(chainId: number): string {
  switch (chainId) {
    case 11155111:
      return 'Sepolia Ether';
    case 84532:
      return 'Base Sepolia Ether';
    case 5115:
      return 'Citrea Bitcoin';
    default:
      return 'Ether';
  }
}

/**
 * Query token balances using The Graph subgraphs
 * Uses GraphQL to query subgraphs that index ERC20 token balances
 */
async function queryChainBalances(address: string, chainId: number): Promise<TokenBalance[]> {
  const subgraphUrl = SUBGRAPH_ENDPOINTS[chainId];

  // Use subgraphs if endpoint is configured, otherwise fall back to RPC
  if (subgraphUrl) {
    try {
      return await querySubgraphBalances(address, chainId, subgraphUrl);
    } catch (error) {
      console.warn(`Subgraph query failed for chain ${chainId}, falling back to RPC:`, error);
      // Fall through to RPC fallback
    }
  }

  // Fall back to RPC queries if no subgraph or subgraph query failed
  return await queryRPCBalances(address, chainId);
}

/**
 * Query token balances from a GraphQL subgraph
 */
async function querySubgraphBalances(
  address: string,
  chainId: number,
  subgraphUrl: string
): Promise<TokenBalance[]> {
  // GraphQL query to get token balances for an address
  // Common schema patterns for ERC20 balance subgraphs
  const queries = [
    // Pattern 1: Account with tokenBalances
    `
    query GetTokenBalances($address: Bytes!) {
      account(id: $address) {
        id
        tokenBalances(where: { balance_gt: "0" }) {
          id
          balance
          token {
            id
            symbol
            name
            decimals
          }
        }
      }
    }
    `,
    // Pattern 2: Direct balances query
    `
    query GetTokenBalances($address: Bytes!) {
      balances(where: { account: $address, balance_gt: "0" }) {
        id
        balance
        token {
          id
          symbol
          name
          decimals
        }
      }
    }
    `,
    // Pattern 3: TokenBalance entity
    `
    query GetTokenBalances($address: Bytes!) {
      tokenBalances(where: { account: $address, balance_gt: "0" }) {
        id
        balance
        token {
          id
          symbol
          name
          decimals
        }
      }
    }
    `,
  ];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Try each query pattern until one works
  for (const query of queries) {
    try {
      const response = await fetch(subgraphUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          variables: {
            address: address.toLowerCase(),
          },
        }),
      });

      const data = await response.json();

      if (data.errors) {
        // Try next query pattern
        continue;
      }

      // Parse response based on query structure
      let balances: TokenBalance[] = [];

      if (data.data?.account?.tokenBalances) {
        // Pattern 1: Account with tokenBalances
        balances = data.data.account.tokenBalances.map((item: any) => ({
          address: item.token.id.toLowerCase(),
          symbol: item.token.symbol || 'UNKNOWN',
          name: item.token.name || 'Unknown Token',
          balance: item.balance || '0',
          decimals: item.token.decimals || 18,
          chainId,
        }));
      } else if (data.data?.balances) {
        // Pattern 2: Direct balances query
        balances = data.data.balances.map((item: any) => ({
          address: item.token.id.toLowerCase(),
          symbol: item.token.symbol || 'UNKNOWN',
          name: item.token.name || 'Unknown Token',
          balance: item.balance || '0',
          decimals: item.token.decimals || 18,
          chainId,
        }));
      } else if (data.data?.tokenBalances) {
        // Pattern 3: TokenBalance entity
        balances = data.data.tokenBalances.map((item: any) => ({
          address: item.token.id.toLowerCase(),
          symbol: item.token.symbol || 'UNKNOWN',
          name: item.token.name || 'Unknown Token',
          balance: item.balance || '0',
          decimals: item.token.decimals || 18,
          chainId,
        }));
      }

      if (balances.length > 0) {
        return balances;
      }
    } catch (error) {
      // Try next query pattern
      continue;
    }
  }

  // If all queries fail, fall back to RPC
  console.warn(`All GraphQL query patterns failed for chain ${chainId}, falling back to RPC`);
  return await queryRPCBalances(address, chainId);
}

/**
 * Fallback: Query token balances using direct RPC calls
 * Used when subgraphs are not available or as fallback
 */
async function queryRPCBalances(address: string, chainId: number): Promise<TokenBalance[]> {
  const publicClient = getPublicClient(chainId as SupportedChainId);
  const balances: TokenBalance[] = [];

  // Common token addresses to check
  const commonTokens: Record<number, string[]> = {
    5115: [
      // Citrea Testnet
      '0x4126E0f88008610d6E6C3059d93e9814c20139cB', // WETH
      '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC
      '0x383f2be66D530AB48e286efaA380dC0F214082b9', // CBTC
      '0x8d0c9d1c17aE5e40ffF9bE350f57840E9E66Cd93', // WCBTC + WBTC
    ],
  };

  const tokensToCheck = commonTokens[chainId] || [];

  // Query balances for common tokens
  for (const tokenAddress of tokensToCheck) {
    try {
      const [balance, symbol, name, decimals] = await Promise.allSettled([
        publicClient.readContract({
          address: tokenAddress as Address,
          abi: [
            {
              inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
              name: 'balanceOf',
              outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
              stateMutability: 'view',
              type: 'function',
            },
          ],
          functionName: 'balanceOf',
          args: [address as Address],
        }),
        publicClient.readContract({
          address: tokenAddress as Address,
          abi: [
            {
              inputs: [],
              name: 'symbol',
              outputs: [{ internalType: 'string', name: '', type: 'string' }],
              stateMutability: 'view',
              type: 'function',
            },
          ],
          functionName: 'symbol',
        }),
        publicClient.readContract({
          address: tokenAddress as Address,
          abi: [
            {
              inputs: [],
              name: 'name',
              outputs: [{ internalType: 'string', name: '', type: 'string' }],
              stateMutability: 'view',
              type: 'function',
            },
          ],
          functionName: 'name',
        }),
        publicClient.readContract({
          address: tokenAddress as Address,
          abi: [
            {
              inputs: [],
              name: 'decimals',
              outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
              stateMutability: 'view',
              type: 'function',
            },
          ],
          functionName: 'decimals',
        }),
      ]);

      if (
        balance.status === 'fulfilled' &&
        balance.value > 0n &&
        symbol.status === 'fulfilled' &&
        name.status === 'fulfilled' &&
        decimals.status === 'fulfilled'
      ) {
        balances.push({
          address: tokenAddress.toLowerCase(),
          symbol: symbol.value,
          name: name.value,
          balance: balance.value.toString(),
          decimals: Number(decimals.value),
          chainId,
        });
      }
    } catch (error) {
      // Skip tokens that fail
      continue;
    }
  }

  return balances;
}

/**
 * Get native token balance (ETH, BASE)
 */
export async function getNativeBalance(address: string, chainId: number): Promise<string> {
  try {
    const publicClient = getPublicClient(chainId as SupportedChainId);
    const balance = await publicClient.getBalance({
      address: address as Address,
    });
    return formatUnits(balance, 18); // Native tokens have 18 decimals
  } catch (error) {
    console.error('Failed to get native balance:', error);
    return '0';
  }
}
