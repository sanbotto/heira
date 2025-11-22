import { createConfig, http } from '@wagmi/core';
import { mainnet, base, sepolia, baseSepolia } from 'viem/chains';
import { metaMask, walletConnect, injected } from '@wagmi/connectors';

export const supportedChains = [mainnet, base, sepolia, baseSepolia] as const;
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
  },
});
