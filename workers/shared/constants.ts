/**
 * Shared constants
 */

export const VALID_NETWORKS = [
  "sepolia",
  "baseSepolia",
  "mainnet",
  "base",
  "citreaTestnet",
] as const;

export type NetworkName = (typeof VALID_NETWORKS)[number];

/**
 * Blockscout explorer URLs for each network
 */
export const BLOCKSCOUT_URLS: Record<string, string> = {
  sepolia: "https://eth-sepolia.blockscout.com",
  baseSepolia: "https://base-sepolia.blockscout.com",
  mainnet: "https://eth.blockscout.com",
  base: "https://base.blockscout.com",
  citreaTestnet: "https://explorer.testnet.citrea.xyz",
};

/**
 * Get Blockscout explorer URL for a network
 */
export function getBlockscoutUrl(network: string): string {
  return BLOCKSCOUT_URLS[network] || `https://explorer.${network}.org`;
}

/**
 * Get explorer URL for viewing a contract
 */
export function getExplorerUrl(network: string, address: string): string {
  const baseUrl = getBlockscoutUrl(network);
  return `${baseUrl}/address/${address.toLowerCase()}`;
}
