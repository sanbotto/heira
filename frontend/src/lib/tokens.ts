/**
 * Token balance queries using The Graph AMP
 * AMP uses SQL queries directly, no subgraphs needed
 */

export interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  chainId: number;
  usdValue?: number;
}

const AMP_ENDPOINT = 'https://amp-api.thegraph.com/query';

/**
 * Query token balances for an address across Ethereum and Base
 */
export async function getTokenBalances(address: string): Promise<TokenBalance[]> {
  const balances: TokenBalance[] = [];

  // Query Ethereum mainnet
  try {
    const ethBalances = await queryChainBalances(address, 1);
    balances.push(...ethBalances);
  } catch (error) {
    console.error('Failed to fetch Ethereum balances:', error);
  }

  // Query Base
  try {
    const baseBalances = await queryChainBalances(address, 8453);
    balances.push(...baseBalances);
  } catch (error) {
    console.error('Failed to fetch Base balances:', error);
  }

  return balances;
}

/**
 * Query token balances for a specific chain using AMP SQL
 */
async function queryChainBalances(address: string, chainId: number): Promise<TokenBalance[]> {
  // AMP SQL query to get ERC20 token balances
  const query = `
		SELECT 
			token_address as address,
			token_symbol as symbol,
			token_name as name,
			balance,
			decimals
		FROM token_balances
		WHERE owner_address = '${address.toLowerCase()}'
		AND chain_id = ${chainId}
		AND balance > 0
		ORDER BY balance DESC
	`;

  try {
    const response = await fetch(AMP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        chainId,
      }),
    });

    if (!response.ok) {
      throw new Error(`AMP query failed: ${response.statusText}`);
    }

    const data = await response.json();

    // Transform AMP response to TokenBalance format
    return (data.rows || []).map((row: any) => ({
      address: row.address,
      symbol: row.symbol || 'UNKNOWN',
      name: row.name || 'Unknown Token',
      balance: row.balance,
      decimals: row.decimals || 18,
      chainId,
    }));
  } catch (error) {
    console.error(`Failed to query chain ${chainId}:`, error);
    // Return empty array on error
    return [];
  }
}

/**
 * Get native token balance (ETH, BASE)
 */
export async function getNativeBalance(address: string, chainId: number): Promise<string> {
  try {
    // This would use viem to get native balance
    // For now, return empty string
    return '0';
  } catch (error) {
    console.error('Failed to get native balance:', error);
    return '0';
  }
}
