/**
 * Token price queries using 1inch Spot Price API via backend proxy
 * Backend endpoint: /api/prices
 */

const CACHE_DURATION = 60000; // 1 minute cache

let priceCache: {
  data: Record<string, number>;
  timestamp: number;
  chainId: number;
} | null = null;

/**
 * Fetch prices from backend proxy endpoint
 */
async function fetchPrices(chainId: number): Promise<Record<string, number>> {
  if (
    priceCache &&
    priceCache.chainId === chainId &&
    Date.now() - priceCache.timestamp < CACHE_DURATION
  ) {
    return priceCache.data;
  }

  const backendUrl = import.meta.env.VITE_BACKEND_API_URL;
  if (!backendUrl) {
    console.warn('VITE_BACKEND_API_URL not configured');
    if (priceCache && priceCache.chainId === chainId) {
      return priceCache.data;
    }
    return {};
  }

  try {
    const url = `${backendUrl}/api/prices?chainId=${chainId}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Prices API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success || !data.prices) {
      throw new Error('Invalid response from prices API');
    }

    // Update cache
    priceCache = {
      data: data.prices,
      timestamp: Date.now(),
      chainId,
    };

    return data.prices;
  } catch (error) {
    console.error('Failed to fetch prices from backend:', error);

    if (priceCache && priceCache.chainId === chainId) {
      console.warn('Using cached price data due to API error');
      return priceCache.data;
    }

    return {};
  }
}

/**
 * Get token price
 * Returns price in USD
 */
export async function getTokenPrice(symbol: string, chainId: number): Promise<number | null> {
  try {
    const prices = await fetchPrices(chainId);
    const upperSymbol = symbol.toUpperCase();

    if (prices[upperSymbol] !== undefined) {
      return prices[upperSymbol];
    }

    if (upperSymbol === 'BASE' && prices.ETH !== undefined) {
      return prices.ETH;
    }

    if (upperSymbol === 'CBTC' && prices.WBTC !== undefined) {
      return prices.WBTC;
    }

    console.warn(`Price not found for token ${symbol} on chain ${chainId}`);
    return null;
  } catch (error) {
    console.error(`Failed to get price for ${symbol} on chain ${chainId}:`, error);
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
  const allPrices = await fetchPrices(chainId);

  for (const symbol of symbols) {
    const upperSymbol = symbol.toUpperCase();

    if (allPrices[upperSymbol] !== undefined) {
      prices[symbol] = allPrices[upperSymbol];
    } else if (upperSymbol === 'BASE' && allPrices.ETH !== undefined) {
      prices[symbol] = allPrices.ETH;
    } else if (upperSymbol === 'CBTC' && allPrices.WBTC !== undefined) {
      prices[symbol] = allPrices.WBTC;
    }
  }

  return prices;
}
