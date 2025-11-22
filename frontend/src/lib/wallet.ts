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

export function subscribe(callback: (state: WalletState) => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notify() {
  listeners.forEach(callback => callback(walletState));
}

export async function connectWallet() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No wallet found. Please install MetaMask or another Web3 wallet.');
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

  // Listen for account changes
  window.ethereum.on('accountsChanged', handleAccountsChanged);
  window.ethereum.on('chainChanged', handleChainChanged);

  return walletState;
}

export async function disconnectWallet() {
  walletState = {
    address: null,
    chainId: null,
    isConnected: false,
    ensName: null,
  };
  notify();
}

function handleAccountsChanged(...args: unknown[]) {
  const accounts = args[0] as string[];
  if (accounts.length === 0) {
    disconnectWallet();
  } else {
    walletState.address = accounts[0] as Address;
    notify();
  }
}

function handleChainChanged(...args: unknown[]) {
  const chainId = args[0] as string;
  walletState.chainId = parseInt(chainId, 16) as SupportedChainId;
  notify();
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
    };
  }
}
