/**
 * Coinbase CDP Trade API integration
 */

const COINBASE_API_BASE = 'https://api.coinbase.com/api/v1/brokerage';

interface CoinbaseConfig {
  projectId: string;
  apiKeyId: string;
  apiKeySecret: string;
}

let config: CoinbaseConfig | null = null;

export function setCoinbaseConfig(cfg: CoinbaseConfig) {
  config = cfg;
}

/**
 * Get authentication headers for Coinbase API
 */
async function getAuthHeaders(method: string, path: string, body?: string): Promise<HeadersInit> {
  if (!config) {
    throw new Error('Coinbase config not set');
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = timestamp + method + path + (body || '');

  // In production, you'd use proper HMAC signing here
  // For now, we'll use a simplified approach
  const signature = await signMessage(message, config.apiKeySecret);

  return {
    'CB-ACCESS-KEY': config.apiKeyId,
    'CB-ACCESS-SIGN': signature,
    'CB-ACCESS-TIMESTAMP': timestamp,
    'Content-Type': 'application/json',
  };
}

async function signMessage(message: string, secret: string): Promise<string> {
  // In production, implement proper HMAC-SHA256 signing
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  // Use Web Crypto API for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface SwapQuote {
  quoteId: string;
  amountIn: string;
  amountOut: string;
  tokenIn: string;
  tokenOut: string;
  gasEstimate: string;
}

/**
 * Get a swap quote from Coinbase CDP Trade API
 */
export async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string
): Promise<SwapQuote> {
  if (!config) {
    throw new Error('Coinbase config not set');
  }

  const path = '/quote';
  const body = JSON.stringify({
    tokenIn,
    tokenOut,
    amountIn,
  });

  const headers = await getAuthHeaders('POST', path, body);

  const response = await fetch(`${COINBASE_API_BASE}${path}`, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Coinbase API error: ${error}`);
  }

  return response.json();
}

/**
 * Execute a swap via Coinbase CDP Trade API
 */
export async function executeSwap(quoteId: string): Promise<string> {
  if (!config) {
    throw new Error('Coinbase config not set');
  }

  const path = '/execute';
  const body = JSON.stringify({ quoteId });

  const headers = await getAuthHeaders('POST', path, body);

  const response = await fetch(`${COINBASE_API_BASE}${path}`, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Coinbase API error: ${error}`);
  }

  const data = await response.json();
  return data.txHash;
}
