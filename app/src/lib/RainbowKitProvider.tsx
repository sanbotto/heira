import React, { useEffect } from 'react';
import { RainbowKitProvider as RKProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider, useAccount } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfigForRainbowKit } from './rainbowkit-wagmi-config';
import { updateWalletStateFromAccount } from './wallet';
import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient();

// Component to sync wallet state
function WalletStateSync() {
  const account = useAccount();

  useEffect(() => {
    updateWalletStateFromAccount(account);
  }, [account.address, account.chainId, account.isConnected]);

  return null;
}

export function RainbowKitProvider({ children }: { children?: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfigForRainbowKit}>
      <QueryClientProvider client={queryClient}>
        <RKProvider>
          <WalletStateSync />
          {children || null}
        </RKProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
