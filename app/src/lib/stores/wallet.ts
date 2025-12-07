import { writable } from 'svelte/store';
import type { Address } from 'viem';
import type { SupportedChainId } from '../wallet';
import {
  subscribe as subscribeWallet,
  getWalletState,
  connectWallet,
  disconnectWallet,
} from '../wallet';

export interface WalletStore {
  address: Address | null;
  chainId: SupportedChainId | null;
  isConnected: boolean;
  ensName: string | null;
}

function createWalletStore() {
  const { subscribe, set } = writable<WalletStore>(getWalletState());

  // Subscribe to wallet changes
  subscribeWallet(state => {
    set({
      address: state.address,
      chainId: state.chainId,
      isConnected: state.isConnected,
      ensName: state.ensName,
    });
  });

  return {
    subscribe,
    connect: async (connectorId?: string) => {
      const state = await connectWallet(connectorId);
      set(state);
    },
    disconnect: async () => {
      await disconnectWallet();
      set(getWalletState());
    },
  };
}

export const wallet = createWalletStore();
