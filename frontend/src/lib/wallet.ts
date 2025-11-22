import { createPublicClient, createWalletClient, http, custom, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import {
  getAccount,
  getConnections,
  watchAccount,
  watchConnections,
  connect,
  disconnect,
  getPublicClient as getWagmiPublicClient,
} from '@wagmi/core';
import { wagmiConfig, supportedChains, type SupportedChainId } from './wagmi-config';

// Re-export for backward compatibility
export { supportedChains, type SupportedChainId };

// Create public clients for each chain (for direct access if needed)
export const publicClients = {
  [mainnet.id]: createPublicClient({
    chain: mainnet,
    transport: http(),
  }),
  [supportedChains[1].id]: createPublicClient({
    chain: supportedChains[1],
    transport: http(),
  }),
  [supportedChains[2].id]: createPublicClient({
    chain: supportedChains[2],
    transport: http(),
  }),
};

// Wallet connection state
export interface WalletState {
  address: Address | null;
  chainId: SupportedChainId | null;
  isConnected: boolean;
  ensName: string | null;
}

let walletState: WalletState = {
  address: null,
  chainId: null,
  isConnected: false,
  ensName: null,
};

const listeners = new Set<(state: WalletState) => void>();
let isInitialized = false;

export function subscribe(callback: (state: WalletState) => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notify() {
  listeners.forEach(callback => callback(walletState));
}

async function updateWalletState() {
  const account = getAccount(wagmiConfig);

  walletState = {
    address: account.address as Address | null,
    chainId: account.chainId as SupportedChainId | null,
    isConnected: account.isConnected,
    ensName: null,
  };

  // Resolve ENS name if on mainnet
  if (walletState.address && walletState.chainId === mainnet.id) {
    try {
      const client = getWagmiPublicClient(wagmiConfig, { chainId: mainnet.id });
      const ensName = await client.getEnsName({ address: walletState.address });
      walletState.ensName = ensName;
    } catch (error) {
      console.error('Failed to resolve ENS name:', error);
    }
  }

  notify();
}

// Export function to update wallet state from wagmi v2 account (used by RainbowKit)
export function updateWalletStateFromAccount(account: {
  address?: `0x${string}` | null;
  chainId?: number | null;
  isConnected: boolean;
}) {
  walletState = {
    address: (account.address as Address | null) || null,
    chainId: (account.chainId as SupportedChainId | null) || null,
    isConnected: account.isConnected,
    ensName: walletState.ensName, // Preserve existing ENS name
  };

  // Resolve ENS name if on mainnet
  if (walletState.address && walletState.chainId === mainnet.id && !walletState.ensName) {
    const client = publicClients[mainnet.id];
    client
      .getEnsName({ address: walletState.address })
      .then(ensName => {
        walletState.ensName = ensName;
        notify();
      })
      .catch(error => {
        console.error('Failed to resolve ENS name:', error);
      });
  }

  notify();
}

// Initialize wallet event listeners (should be called once on app mount)
export function initializeWallet() {
  if (typeof window === 'undefined' || isInitialized) {
    return;
  }

  isInitialized = true;

  // Watch for account changes
  watchAccount(wagmiConfig, {
    onChange: async account => {
      await updateWalletState();
    },
  });

  // Watch for connection changes
  watchConnections(wagmiConfig, {
    onChange: async () => {
      await updateWalletState();
    },
  });

  // Check if wallet is already connected
  checkWalletConnection();
}

// Check if wallet is already connected (without requesting permission)
export async function checkWalletConnection() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    await updateWalletState();
  } catch (error) {
    console.error('Failed to check wallet connection:', error);
  }
}

export async function connectWallet(connectorId?: string) {
  if (typeof window === 'undefined') {
    throw new Error('Wallet connection is only available in the browser.');
  }

  // Ensure initialization
  if (!isInitialized) {
    initializeWallet();
  }

  try {
    const connections = getConnections(wagmiConfig);

    // If connectorId is provided, use that connector
    if (connectorId) {
      const connector = wagmiConfig.connectors.find(
        c =>
          c.id === connectorId ||
          c.name === connectorId ||
          c.name.toLowerCase().includes(connectorId.toLowerCase())
      );
      if (!connector) {
        throw new Error(`Connector "${connectorId}" not found`);
      }
      await connect(wagmiConfig, { connector });
    } else {
      // If no connector specified, try to use an existing connection or the first available
      if (connections.length > 0) {
        await connect(wagmiConfig, { connector: connections[0].connector });
      } else {
        // Try MetaMask first as default, then injected, then others
        const metaMaskConnector = wagmiConfig.connectors.find(
          c =>
            c.id === 'io.metamask' ||
            c.name === 'MetaMask' ||
            c.name.toLowerCase().includes('metamask')
        );
        const injectedConnector = wagmiConfig.connectors.find(
          c => c.id === 'injected' || c.name === 'Injected'
        );
        const connector = metaMaskConnector || injectedConnector || wagmiConfig.connectors[0];

        if (connector) {
          await connect(wagmiConfig, { connector });
        } else {
          throw new Error('No wallet connector available. Please install a wallet extension.');
        }
      }
    }

    await updateWalletState();
    return walletState;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet';
    throw new Error(errorMessage);
  }
}

export async function disconnectWallet() {
  try {
    await disconnect(wagmiConfig);
    await updateWalletState();
  } catch (error) {
    console.error('Failed to disconnect wallet:', error);
  }
}

export function getWalletState(): WalletState {
  return walletState;
}

export function getPublicClient(chainId: SupportedChainId) {
  return getWagmiPublicClient(wagmiConfig, { chainId });
}

export async function getWalletClient(chainId: SupportedChainId) {
  // Use the wallet store state (synced with RainbowKit) to get the address
  // Then create a wallet client directly using viem with window.ethereum
  // This works regardless of which wagmi instance connected the wallet
  const currentState = getWalletState();

  if (!currentState.isConnected || !currentState.address) {
    throw new Error('Wallet not connected');
  }

  // Check if window.ethereum is available
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No Ethereum provider found. Please install a wallet extension.');
  }

  // Find the chain config
  const chain = supportedChains.find(c => c.id === chainId);
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  // Create wallet client directly using viem with window.ethereum as custom transport
  // This bypasses wagmi config issues and works with any connected wallet (RainbowKit, direct, etc.)
  return createWalletClient({
    chain,
    transport: custom(window.ethereum),
    account: currentState.address,
  });
}
