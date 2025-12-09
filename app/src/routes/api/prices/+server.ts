import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const ONEINCH_API_BASE = 'https://api.1inch.com/price/v1.1';

// Token addresses for price lookup
const ETHEREUM_TOKEN_ADDRESSES: Record<string, string> = {
  ETH: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  WBTC: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
  WCBTC: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
};

const BASE_TOKEN_ADDRESSES: Record<string, string> = {
  ETH: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  WBTC: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
  WCBTC: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
};

const CITREA_TOKEN_ADDRESSES: Record<string, string> = {
  ETH: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  WETH: '0x4126E0f88008610d6E6C3059d93e9814c20139cB',
  USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  CBTC: '0x383f2be66D530AB48e286efaA380dC0F214082b9',
  WCBTC: '0x8d0c9d1c17aE5e40ffF9bE350f57840E9E66Cd93',
  WBTC: '0x8d0c9d1c17aE5e40ffF9bE350f57840E9E66Cd93',
};

function getPriceLookupChainId(chainId: number): number {
  if (chainId === 11155111) {
    return 11155111; // Sepolia testnet
  }
  if (chainId === 84532) {
    return 84532; // Base Sepolia testnet
  }
  if (chainId === 5115) {
    return 11155111; // Citrea Testnet - use Sepolia as fallback
  }
  return 11155111; // Default to Sepolia testnet
}

function getTokenAddresses(chainId: number): Record<string, string> {
  if (chainId === 84532) {
    return BASE_TOKEN_ADDRESSES;
  }
  if (chainId === 5115) {
    return CITREA_TOKEN_ADDRESSES;
  }
  // Default to Sepolia/Ethereum testnet addresses
  return ETHEREUM_TOKEN_ADDRESSES;
}

/**
 * GET /api/prices
 * Fetch token prices from 1inch API via proxy
 *
 * Query params:
 * - chainId: number (required)
 * - tokens: comma-separated list of token symbols (optional, defaults to all)
 */
export const GET: RequestHandler = async ({ url, platform }) => {
  try {
    const chainIdParam = url.searchParams.get('chainId');
    const chainId = chainIdParam ? parseInt(chainIdParam) : NaN;
    const tokensParam = url.searchParams.get('tokens');

    if (!chainId || isNaN(chainId)) {
      throw error(400, 'chainId query parameter is required');
    }

    const env = (platform?.env || {}) as Record<string, string>;
    const apiKey = env.ONEINCH_API_KEY;
    if (!apiKey) {
      throw error(500, 'ONEINCH_API_KEY not configured on server');
    }

    const lookupChainId = getPriceLookupChainId(chainId);
    const tokenAddresses = getTokenAddresses(chainId);

    // If specific tokens requested, filter the addresses
    const tokensToFetch = tokensParam
      ? tokensParam.split(',').map(t => t.trim().toUpperCase())
      : Object.keys(tokenAddresses);

    const prices: Record<string, number> = {};

    // Collect all addresses to fetch in a single batch request
    const addressesToFetch: Array<{ symbol: string; address: string }> = [];
    for (const symbol of tokensToFetch) {
      const address = tokenAddresses[symbol];
      if (address) {
        addressesToFetch.push({ symbol, address });
      }
    }

    if (addressesToFetch.length === 0) {
      return json({
        success: true,
        prices: {},
      });
    }

    try {
      // 1inch Price API format: GET /price/v1.1/{chainId}/{address1},{address2},...
      // Response format: { "0x...": price_number, ... }
      const addresses = addressesToFetch.map(item => item.address.toLowerCase()).join(',');
      const apiUrl = `${ONEINCH_API_BASE}/${lookupChainId}/${addresses}`;
      console.log(`Fetching prices from ${apiUrl} (${addressesToFetch.length} tokens)`);

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch prices: ${response.status} ${errorText}`);
        return json({
          success: true,
          prices: {},
        });
      }

      const data: any = await response.json();
      console.log(`1inch API response:`, JSON.stringify(data, null, 2));

      // Parse prices from response
      for (const { symbol, address } of addressesToFetch) {
        const lowerAddress = address.toLowerCase();

        let priceValue: string | number | undefined;

        // Price is directly in the response object, not nested
        if (data[lowerAddress] !== undefined) {
          priceValue = data[lowerAddress];
        } else if (data[address] !== undefined) {
          priceValue = data[address];
        }

        if (priceValue !== undefined) {
          const rawPrice = typeof priceValue === 'string' ? parseFloat(priceValue) : priceValue;
          if (!isNaN(rawPrice) && rawPrice > 0) {
            // 1inch API returns prices as integers scaled by 1e18
            const priceInUSD = Number(rawPrice) / 1e18;
            prices[symbol] = priceInUSD;
            console.log(`Found price for ${symbol}: ${rawPrice} -> ${priceInUSD} USD`);
          }
        }
      }
    } catch (fetchError) {
      console.error('Error fetching prices from 1inch:', fetchError);
    }

    // Map WETH to ETH
    if (prices.WETH !== undefined) {
      prices.ETH = prices.WETH;
    }

    // Map WBTC to cBTC and WCBTC
    if (prices.WBTC !== undefined) {
      prices.CBTC = prices.WBTC;
      prices.WCBTC = prices.WBTC;
    }

    return json({
      success: true,
      prices,
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    console.error('Error in prices endpoint:', err);
    const message = err instanceof Error ? err.message : 'Failed to fetch prices';
    throw error(500, message);
  }
};
