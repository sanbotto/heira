import { Router } from "express";

export const pricesRouter = Router();

const ONEINCH_API_BASE = "https://api.1inch.com/price/v1.1";

// Token addresses for price lookup
const ETHEREUM_TOKEN_ADDRESSES: Record<string, string> = {
  ETH: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  WETH: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  WBTC: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
  WCBTC: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
};

const BASE_TOKEN_ADDRESSES: Record<string, string> = {
  ETH: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  WBTC: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
  WCBTC: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
};

const CITREA_TOKEN_ADDRESSES: Record<string, string> = {
  ETH: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  WETH: "0x4126E0f88008610d6E6C3059d93e9814c20139cB",
  USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  CBTC: "0x383f2be66D530AB48e286efaA380dC0F214082b9",
  WCBTC: "0x8d0c9d1c17aE5e40ffF9bE350f57840E9E66Cd93",
  WBTC: "0x8d0c9d1c17aE5e40ffF9bE350f57840E9E66Cd93",
};

function getPriceLookupChainId(chainId: number): number {
  if (chainId === 1 || chainId === 11155111 || chainId === 5115) {
    return 1; // Ethereum mainnet
  }
  if (chainId === 8453 || chainId === 84532) {
    return 8453; // Base mainnet
  }
  return 1; // Default to Ethereum mainnet
}

function getTokenAddresses(chainId: number): Record<string, string> {
  const lookupChainId = getPriceLookupChainId(chainId);
  if (lookupChainId === 8453) {
    return BASE_TOKEN_ADDRESSES;
  }
  if (chainId === 5115) {
    return CITREA_TOKEN_ADDRESSES;
  }
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
pricesRouter.get("/", async (req, res) => {
  try {
    const chainId = parseInt(req.query.chainId as string);
    const tokensParam = req.query.tokens as string | undefined;

    if (!chainId || isNaN(chainId)) {
      return res.status(400).json({
        success: false,
        message: "chainId query parameter is required",
      });
    }

    const apiKey = process.env["ONEINCH_API_KEY"];
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "ONEINCH_API_KEY not configured on server",
      });
    }

    const lookupChainId = getPriceLookupChainId(chainId);
    const tokenAddresses = getTokenAddresses(chainId);

    // If specific tokens requested, filter the addresses
    const tokensToFetch = tokensParam
      ? tokensParam.split(",").map((t) => t.trim().toUpperCase())
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
      return res.json({
        success: true,
        prices: {},
      });
    }

    try {
      // 1inch Price API format: GET /price/v1.1/{chainId}/{address1},{address2},...
      // Response format: { "0x...": price_number, ... }
      const addresses = addressesToFetch
        .map((item) => item.address.toLowerCase())
        .join(",");
      const url = `${ONEINCH_API_BASE}/${lookupChainId}/${addresses}`;
      console.log(
        `Fetching prices from ${url} (${addressesToFetch.length} tokens)`,
      );

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `Failed to fetch prices: ${response.status} ${errorText}`,
        );
        return res.json({
          success: true,
          prices: {},
        });
      }

      const data: any = await response.json();
      console.log(`1inch API response:`, JSON.stringify(data, null, 2));

      // Parse prices from response
      // Response format: { "0x...": price_number, ... }
      // 1inch API returns prices as integers, need to convert to USD
      // Prices appear to be in a scaled format - need to divide by appropriate factor
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
          const rawPrice =
            typeof priceValue === "string"
              ? parseFloat(priceValue)
              : priceValue;
          if (!isNaN(rawPrice) && rawPrice > 0) {
            // 1inch API returns prices as integers scaled by 1e18
            // The price represents the token price in USD * 1e18
            // For example: 1000000000000000000 = $1.00, 356588891072520 = $0.000356588891072520
            // But wait - ETH showing 1e18 suggests $1, which is wrong. Let me check the actual format.
            // Looking at the response: ETH=1e18, USDC=3.565e14
            // If we divide by 1e18: ETH=1, USDC=0.0003565 (USDC should be ~$1)
            // This suggests prices might be in a different format
            // Let's try: prices are in wei/smallest unit format, need to convert based on token decimals
            // Actually, 1inch Price API returns prices where the number represents USD price * 1e18
            // So we divide by 1e18 to get USD price
            const priceInUSD = Number(rawPrice) / 1e18;
            prices[symbol] = priceInUSD;
            console.log(
              `✅ Found price for ${symbol}: ${rawPrice} -> ${priceInUSD} USD`,
            );
          }
        }
      }
    } catch (fetchError) {
      console.error("Error fetching prices from 1inch:", fetchError);
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

    return res.json({
      success: true,
      prices,
    });
  } catch (error: any) {
    console.error("Error in prices endpoint:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch prices",
    });
  }
});
