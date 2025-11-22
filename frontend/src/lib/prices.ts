/**
 * Chainlink Data Feeds (CRE) integration for token prices
 */

import { createPublicClient, http } from 'viem';
import { mainnet, base } from 'viem/chains';

// Chainlink Price Feed addresses
const CHAINLINK_FEEDS: Record<number, Record<string, string>> = {
  [mainnet.id]: {
    ETH: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', // ETH/USD
    USDC: '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6', // USDC/USD
    USDT: '0x3E7d1eAB13AD0104d2750B8863b489D65364e32D', // USDT/USD
  },
  [base.id]: {
    ETH: '0x71041dddad3595F9CEd3DcCF79f8b3B3b5D0C2E0', // ETH/USD on Base
    USDC: '0x7e860098F58bBFC8648a4311b374B1D669f2e5E6', // USDC/USD on Base
  },
};

const ABI = [
  {
    inputs: [],
    name: 'latestRoundData',
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Get token price from Chainlink
 */
export async function getTokenPrice(symbol: string, chainId: number): Promise<number | null> {
  const chain = chainId === mainnet.id ? mainnet : base;
  const feeds = CHAINLINK_FEEDS[chainId];
  const feedAddress = feeds[symbol.toUpperCase()];

  if (!feedAddress) {
    console.warn(`No Chainlink feed found for ${symbol} on chain ${chainId}`);
    return null;
  }

  try {
    const client = createPublicClient({
      chain,
      transport: http(),
    });

    const data = await client.readContract({
      address: feedAddress as `0x${string}`,
      abi: ABI,
      functionName: 'latestRoundData',
    });

    // Chainlink prices have 8 decimals
    return Number(data[1]) / 1e8;
  } catch (error) {
    console.error(`Failed to get price for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get multiple token prices
 */
export async function getTokenPrices(
  symbols: string[],
  chainId: number
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  await Promise.all(
    symbols.map(async symbol => {
      const price = await getTokenPrice(symbol, chainId);
      if (price !== null) {
        prices[symbol] = price;
      }
    })
  );

  return prices;
}
