/**
 * Token price queries using BlockAnalitica Price API
 * API: https://info-sky.blockanalitica.com/api/v1/prices/?format=json
 * For Sepolia testnets, uses mainnet prices (same API)
 */

// BlockAnalitica Price API endpoint
const PRICE_API_URL = 'https://info-sky.blockanalitica.com/api/v1/prices/?format=json';

// Cache for prices to avoid repeated API calls
let priceCache: {
  data: Record<string, number>;
  timestamp: number;
} | null = null;

const CACHE_DURATION = 60000; // 1 minute cache

// Map token symbols to addresses (for lookup)
// Addresses are lowercase in the API response
const TOKEN_ADDRESSES: Record<string, string> = {
  ETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH address (ETH uses WETH price)
  WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  DAI: '0x6b175474e89094c44da98b954eedeac495271d0f',
  WBTC: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
  MKR: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
  // Add more as needed
};

interface PriceResponse {
  underlying_address: string;
  underlying_symbol: string;
  price: string;
  datetime: string;
  source: string;
}

/**
 * Fetch prices from BlockAnalitica API
 */
async function fetchPrices(): Promise<Record<string, number>> {
  // Check cache first
  if (priceCache && Date.now() - priceCache.timestamp < CACHE_DURATION) {
    return priceCache.data;
  }

  try {
    const response = await fetch(PRICE_API_URL);

    if (!response.ok) {
      throw new Error(`Price API error: ${response.status} ${response.statusText}`);
    }

    const data: PriceResponse[] = await response.json();

    // Build price map: symbol -> price
    const prices: Record<string, number> = {};

    for (const item of data) {
      const symbol = item.underlying_symbol.toUpperCase();
      const price = parseFloat(item.price);

      if (!isNaN(price)) {
        prices[symbol] = price;
      }
    }

    // Map WETH to ETH (WETH price is ETH price)
    if (prices.WETH !== undefined) {
      prices.ETH = prices.WETH;
    }

    // Update cache
    priceCache = {
      data: prices,
      timestamp: Date.now(),
    };

    return prices;
  } catch (error) {
    console.error('Failed to fetch prices from BlockAnalitica API:', error);

    // Return cached data if available, even if expired
    if (priceCache) {
      console.warn('Using cached price data due to API error');
      return priceCache.data;
    }

    return {};
  }
}

/**
 * Get token price from BlockAnalitica API
 * Returns price in USD
 */
export async function getTokenPrice(symbol: string, chainId: number): Promise<number | null> {
  try {
    const prices = await fetchPrices();
    const upperSymbol = symbol.toUpperCase();

    // Check direct symbol match
    if (prices[upperSymbol] !== undefined) {
      return prices[upperSymbol];
    }

    // For BASE token (native Base token), try to use ETH price as approximation
    if (upperSymbol === 'BASE') {
      if (prices.ETH !== undefined) {
        return prices.ETH;
      }
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

  // Fetch all prices once
  const allPrices = await fetchPrices();

  // Map requested symbols to prices
  for (const symbol of symbols) {
    const upperSymbol = symbol.toUpperCase();

    if (allPrices[upperSymbol] !== undefined) {
      prices[symbol] = allPrices[upperSymbol];
    } else if (upperSymbol === 'BASE' && allPrices.ETH !== undefined) {
      // Use ETH price for BASE token as approximation
      prices[symbol] = allPrices.ETH;
    }
  }

  return prices;
}
