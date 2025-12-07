import { createConfig, http } from '@wagmi/core';
import { mainnet, base, sepolia, baseSepolia } from 'viem/chains';
import { metaMask, walletConnect, injected } from '@wagmi/connectors';
import type { Chain } from 'viem';

// Define Citrea Testnet
export const citreaTestnet = {
  id: 5115,
  name: 'Citrea Testnet',
  nativeCurrency: {
    name: 'cBTC',
    symbol: 'cBTC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.citrea.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Citrea Explorer',
      url: 'https://explorer.testnet.citrea.xyz',
    },
    routescan: {
      name: 'Routescan',
      url: 'https://5115.testnet.routescan.io',
    },
  },
  iconUrl: '/citrea-icon.svg',
  iconBackground: '#f0781b',
} as const;

export const supportedChains = [mainnet, base, sepolia, baseSepolia, citreaTestnet] as const;
export type SupportedChainId = (typeof supportedChains)[number]['id'];

// Get WalletConnect project ID from environment
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [
    metaMask(),
    walletConnect({
      projectId: walletConnectProjectId,
      showQrModal: true,
    }),
    injected(),
  ],
  transports: {
    [supportedChains[0].id]: http(),
    [supportedChains[1].id]: http(),
    [supportedChains[2].id]: http(),
    [supportedChains[3].id]: http(),
    [supportedChains[4].id]: http(),
  },
});
