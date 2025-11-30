// Shared constants

export const VALID_NETWORKS = [
  "eth-sepolia",
  "eth-mainnet",
  "base-sepolia",
  "base-mainnet",
  "citrea-testnet",
];

// Blockscout explorer URLs for each network
export const BLOCKSCOUT_URLS = {
  "eth-sepolia": "https://eth-sepolia.blockscout.com",
  "eth-mainnet": "https://eth.blockscout.com",
  "base-sepolia": "https://base-sepolia.blockscout.com",
  "base-mainnet": "https://base.blockscout.com",
  "citrea-testnet": "https://explorer.testnet.citrea.xyz",
};

// Get Blockscout explorer URL for a network
export function getBlockscoutUrl(network) {
  return BLOCKSCOUT_URLS[network] || `https://explorer.${network}.org`;
}

// Get explorer URL for viewing a contract
export function getExplorerUrl(network, address) {
  const baseUrl = getBlockscoutUrl(network);
  return `${baseUrl}/address/${address.toLowerCase()}`;
}
