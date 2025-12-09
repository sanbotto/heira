/**
 * Shared network utilities
 * Consolidates network name, chain ID, and RPC URL mapping logic
 */

export type SupportedNetwork = 'sepolia' | 'baseSepolia' | 'citreaTestnet';

export interface NetworkConfig {
  name: SupportedNetwork;
  chainId: number;
  rpcEnvVar: string;
  explorerUrl: string;
}

export const NETWORK_CONFIGS: Record<SupportedNetwork, NetworkConfig> = {
  sepolia: {
    name: 'sepolia',
    chainId: 11155111,
    rpcEnvVar: 'SEPOLIA_RPC_URL',
    explorerUrl: 'https://sepolia.etherscan.io',
  },
  baseSepolia: {
    name: 'baseSepolia',
    chainId: 84532,
    rpcEnvVar: 'BASE_SEPOLIA_RPC_URL',
    explorerUrl: 'https://sepolia.basescan.org',
  },
  citreaTestnet: {
    name: 'citreaTestnet',
    chainId: 5115,
    rpcEnvVar: 'CITREA_TESTNET_RPC_URL',
    explorerUrl: 'https://explorer.testnet.citrea.xyz',
  },
};

/**
 * Get network name from chain ID
 */
export function getNetworkName(chainId: number): SupportedNetwork {
  for (const [name, config] of Object.entries(NETWORK_CONFIGS)) {
    if (config.chainId === chainId) {
      return name as SupportedNetwork;
    }
  }
  return 'sepolia'; // default fallback
}

/**
 * Get chain ID from network name
 */
export function getChainId(networkName: string): number | null {
  const config = NETWORK_CONFIGS[networkName as SupportedNetwork];
  return config?.chainId || null;
}

/**
 * Get RPC URL for a network name from environment variables
 */
export function getRpcUrlForNetwork(networkName: string, env: Record<string, string>): string | null {
  const config = NETWORK_CONFIGS[networkName as SupportedNetwork];
  if (!config) {
    return null;
  }
  const rpcUrl = env[config.rpcEnvVar] || '';
  return rpcUrl || null;
}

/**
 * Get the environment variable name for a network's RPC URL
 */
export function getRpcEnvVarName(networkName: string): string {
  const config = NETWORK_CONFIGS[networkName as SupportedNetwork];
  return config?.rpcEnvVar || 'RPC_URL';
}

/**
 * Get explorer URL for a network
 */
export function getExplorerUrl(network: string, address: string): string {
  const config = NETWORK_CONFIGS[network as SupportedNetwork];
  const baseUrl = config?.explorerUrl || NETWORK_CONFIGS.sepolia.explorerUrl;
  return `${baseUrl}/address/${address}`;
}

/**
 * Get provider for a network name (ethers.js)
 * Note: This function requires ethers to be imported by the caller
 */
export function getProviderForNetwork(networkName: string, env: Record<string, string>, ethers: typeof import('ethers')): import('ethers').Provider | null {
  const rpcUrl = getRpcUrlForNetwork(networkName, env);
  if (!rpcUrl) {
    return null;
  }

  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Get all valid network names
 */
export function getValidNetworks(): readonly SupportedNetwork[] {
  return Object.keys(NETWORK_CONFIGS) as SupportedNetwork[];
}
