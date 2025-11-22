import { createPublicClient, createWalletClient, custom, http, type Address } from 'viem';
import { mainnet, base, sepolia } from 'viem/chains';

// Chain configurations
export const supportedChains = [mainnet, base, sepolia] as const;
export type SupportedChainId = (typeof supportedChains)[number]['id'];

// Create public clients for each chain
export const publicClients = {
  [mainnet.id]: createPublicClient({
    chain: mainnet,
    transport: http(),
  }),
  [base.id]: createPublicClient({
    chain: base,
    transport: http(),
  }),
  [sepolia.id]: createPublicClient({
    chain: sepolia,
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
let eventHandlersAttached = false;
let isInitialized = false;

export function subscribe(callback: (state: WalletState) => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notify() {
  listeners.forEach(callback => callback(walletState));
}

// Initialize wallet event listeners (should be called once on app mount)
export function initializeWallet() {
  if (typeof window === 'undefined' || !window.ethereum || isInitialized) {
    return;
  }

  // Attach event listeners (keep them attached even after disconnect)
  window.ethereum.on('accountsChanged', handleAccountsChanged);
  window.ethereum.on('chainChanged', handleChainChanged);
  window.ethereum.on('disconnect', handleDisconnect);

  eventHandlersAttached = true;
  isInitialized = true;

  // Check if wallet is already connected
  checkWalletConnection();
}

// Check if wallet is already connected (without requesting permission)
export async function checkWalletConnection() {
  if (typeof window === 'undefined' || !window.ethereum) {
    return;
  }

  try {
    const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];

    if (accounts.length > 0) {
      const chainId = (await window.ethereum.request({ method: 'eth_chainId' })) as string;

      walletState = {
        address: accounts[0] as Address,
        chainId: parseInt(chainId, 16) as SupportedChainId,
        isConnected: true,
        ensName: null,
      };

      // Resolve ENS name
      if (walletState.address && walletState.chainId === mainnet.id) {
        try {
          const client = publicClients[mainnet.id];
          const ensName = await client.getEnsName({ address: walletState.address });
          walletState.ensName = ensName;
        } catch (error) {
          console.error('Failed to resolve ENS name:', error);
        }
      }

      notify();
    }
  } catch (error) {
    console.error('Failed to check wallet connection:', error);
  }
}

export async function connectWallet() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No wallet found. Please install MetaMask or another Web3 wallet.');
  }

  // Ensure event listeners are attached
  if (!eventHandlersAttached) {
    initializeWallet();
  }

  const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
  const chainId = (await window.ethereum.request({ method: 'eth_chainId' })) as string;

  walletState = {
    address: accounts[0] as Address,
    chainId: parseInt(chainId, 16) as SupportedChainId,
    isConnected: true,
    ensName: null,
  };

  // Resolve ENS name
  if (walletState.address && walletState.chainId === mainnet.id) {
    try {
      const client = publicClients[mainnet.id];
      const ensName = await client.getEnsName({ address: walletState.address });
      walletState.ensName = ensName;
    } catch (error) {
      console.error('Failed to resolve ENS name:', error);
    }
  }

  notify();

  return walletState;
}

export async function disconnectWallet() {
  walletState = {
    address: null,
    chainId: null,
    isConnected: false,
    ensName: null,
  };

  // Don't remove event listeners - keep them attached to detect reconnections
  // The event listeners will handle reconnection automatically

  notify();
}

function handleDisconnect() {
  // Wallet provider disconnected
  disconnectWallet();
}

function handleAccountsChanged(...args: unknown[]) {
  const accounts = args[0] as string[];
  if (accounts.length === 0) {
    // User disconnected wallet in MetaMask
    disconnectWallet();
  } else {
    // User switched accounts
    const newAddress = accounts[0] as Address;
    if (newAddress.toLowerCase() !== walletState.address?.toLowerCase()) {
      walletState.address = newAddress;
      walletState.isConnected = true;
      // Reset ENS name - will be resolved again if on mainnet
      walletState.ensName = null;

      // Resolve ENS name if on mainnet
      if (walletState.chainId === mainnet.id) {
        resolveEnsNameForAddress(newAddress);
      }

      notify();
    }
  }
}

function handleChainChanged(...args: unknown[]) {
  const chainId = args[0] as string;
  const newChainId = parseInt(chainId, 16);

  // Check if the new chain is supported
  const isSupported = supportedChains.some(chain => chain.id === newChainId);

  if (isSupported) {
    walletState.chainId = newChainId as SupportedChainId;
    // Resolve ENS name if switching to mainnet
    if (newChainId === mainnet.id && walletState.address) {
      resolveEnsNameForAddress(walletState.address);
    } else {
      walletState.ensName = null;
    }
  } else {
    // Unsupported chain - don't disconnect, but update chainId
    walletState.chainId = newChainId as SupportedChainId;
    walletState.ensName = null;
  }

  notify();
}

async function resolveEnsNameForAddress(address: Address) {
  try {
    const client = publicClients[mainnet.id];
    const ensName = await client.getEnsName({ address });
    walletState.ensName = ensName;
    notify();
  } catch (error) {
    console.error('Failed to resolve ENS name:', error);
  }
}

export function getWalletState(): WalletState {
  return walletState;
}

export function getPublicClient(chainId: SupportedChainId) {
  return publicClients[chainId];
}

export function getWalletClient(chainId: SupportedChainId) {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No wallet found');
  }

  return createWalletClient({
    chain: supportedChains.find(c => c.id === chainId)!,
    transport: custom(window.ethereum),
  });
}

// Type augmentation for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
      removeAllListeners?: (event?: string) => void;
    };
  }
}
