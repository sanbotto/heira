import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { createConfig, http } from 'wagmi';
import { mainnet, base, sepolia } from 'wagmi/chains';
import {
  ledgerWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets';

export const supportedChains = [mainnet, base, sepolia] as const;

// Get WalletConnect project ID from environment
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

// Create connectors with explicit wallet list including Ledger Live
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [ledgerWallet, metaMaskWallet, rainbowWallet, walletConnectWallet, injectedWallet],
    },
  ],
  {
    appName: 'Heira',
    projectId: walletConnectProjectId,
  }
);

// Create wagmi config with custom connectors
export const wagmiConfigForRainbowKit = createConfig({
  connectors,
  chains: supportedChains,
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [sepolia.id]: http(),
  },
  ssr: false,
});
