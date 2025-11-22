import React from 'react';
import { createPortal } from 'react-dom';
import { RainbowKitProvider as RKProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider, useAccount } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfigForRainbowKit } from './rainbowkit-wagmi-config';
import { updateWalletStateFromAccount } from './wallet';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient();

function WalletStateSync() {
  const account = useAccount();
  React.useEffect(() => {
    updateWalletStateFromAccount(account);
  }, [account.address, account.chainId, account.isConnected]);
  return null;
}

function CustomConnectButton() {
  const [stableAccount, setStableAccount] = React.useState<{
    displayName: string;
    ensAvatar: string | null;
  } | null>(null);
  const stableTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const accountAddressRef = React.useRef<string | null>(null);

  return React.createElement(
    ConnectButton.Custom,
    {
      children: ({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }: any) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === 'authenticated');

        // Wait for ENS data to stabilize before showing button
        React.useEffect(() => {
          if (!connected || !account) {
            setStableAccount(null);
            accountAddressRef.current = null;
            return;
          }

          // Reset if address changed
          if (accountAddressRef.current !== account.address) {
            accountAddressRef.current = account.address || null;
            setStableAccount(null); // Reset to hide button
          }

          // Clear any existing timeout
          if (stableTimeoutRef.current) {
            clearTimeout(stableTimeoutRef.current);
          }

          // Check if ENS data appears to be loaded
          const address = account.address || '';
          const formattedAddress = `${address.slice(0, 4)}…${address.slice(-4)}`;
          const hasEnsName = account.displayName && account.displayName !== formattedAddress;

          // If ENS name is already loaded, wait less time (it's ready)
          // Otherwise wait longer for ENS data to potentially load
          const delay = hasEnsName ? 200 : 500;

          stableTimeoutRef.current = setTimeout(() => {
            const displayName = account.displayName || account.ensName || formattedAddress;
            const ensAvatar = account.ensAvatar || null;

            // Only update if this is the first time or if data has changed
            setStableAccount(prev => {
              // If we don't have stable account yet, set it
              if (!prev) {
                return {
                  displayName,
                  ensAvatar,
                };
              }

              // Only update if ENS name or avatar actually changed
              if (prev.displayName !== displayName || prev.ensAvatar !== ensAvatar) {
                return {
                  displayName,
                  ensAvatar,
                };
              }

              return prev;
            });
          }, delay);

          return () => {
            if (stableTimeoutRef.current) {
              clearTimeout(stableTimeoutRef.current);
            }
          };
        }, [connected, account?.address, account?.displayName, account?.ensName, account?.ensAvatar]);

        if (!ready) {
          return React.createElement('div', {
            'aria-hidden': true,
            style: {
              opacity: 0,
              pointerEvents: 'none',
              userSelect: 'none',
            },
          });
        }

        if (!connected) {
          return React.createElement(
            'button',
            {
              onClick: openConnectModal,
              type: 'button',
              className: 'rk-custom-button',
            },
            'Connect Wallet'
          );
        }

        if (chain.unsupported) {
          return React.createElement(
            'button',
            {
              onClick: openChainModal,
              type: 'button',
              className: 'rk-custom-button',
            },
            'Wrong network'
          );
        }

        // Don't show account button until we have stable data (waited for ENS to load)
        // This prevents flashing between address and ENS name
        if (!stableAccount) {
          // Show only chain button while waiting for account data to stabilize
          return React.createElement(
            'div',
            {
              className: 'rk-buttons-container',
            },
            [
              React.createElement(
                'button',
                {
                  key: 'chain',
                  onClick: openChainModal,
                  type: 'button',
                  'data-testid': 'rk-chain-button',
                  className: 'rk-custom-button',
                },
                [
                  chain.hasIcon &&
                  chain.iconUrl &&
                  React.createElement(
                    'div',
                    {
                      key: 'chain-icon',
                      className: 'rk-chain-icon',
                      style: {
                        background: chain.iconBackground || 'transparent',
                      },
                    },
                    React.createElement('img', {
                      alt: chain.name ?? 'Chain icon',
                      src: chain.iconUrl,
                    })
                  ),
                  React.createElement('span', { key: 'chain-name' }, chain.name),
                ]
              ),
            ]
          );
        }

        const displayName = stableAccount.displayName;
        const ensAvatar = stableAccount.ensAvatar;

        return React.createElement(
          'div',
          {
            className: 'rk-buttons-container',
          },
          [
            // Chain Selector Button
            React.createElement(
              'button',
              {
                key: 'chain',
                onClick: openChainModal,
                type: 'button',
                'data-testid': 'rk-chain-button',
                className: 'rk-custom-button',
              },
              [
                chain.hasIcon &&
                chain.iconUrl &&
                React.createElement(
                  'div',
                  {
                    key: 'chain-icon',
                    className: 'rk-chain-icon',
                    style: {
                      background: chain.iconBackground || 'transparent',
                    },
                  },
                  React.createElement('img', {
                    alt: chain.name ?? 'Chain icon',
                    src: chain.iconUrl,
                  })
                ),
                React.createElement('span', { key: 'chain-name' }, chain.name),
              ]
            ),
            // Account Button
            React.createElement(
              'button',
              {
                key: 'account',
                onClick: openAccountModal,
                type: 'button',
                'data-testid': 'rk-account-button',
                className: 'rk-custom-button',
              },
              [
                React.createElement(
                  'div',
                  {
                    key: 'avatar',
                    className: 'rk-avatar',
                  },
                  ensAvatar
                    ? React.createElement('img', {
                      src: ensAvatar,
                      alt: 'ENS Avatar',
                      style: {
                        opacity: 0,
                        transition: 'opacity 0.2s',
                      },
                      onLoad: (e: React.SyntheticEvent<HTMLImageElement>) => {
                        e.currentTarget.style.opacity = '1';
                      },
                      onError: (e: React.SyntheticEvent<HTMLImageElement>) => {
                        e.currentTarget.style.display = 'none';
                      },
                    })
                    : React.createElement('div', {
                      className: 'rk-avatar-placeholder',
                    })
                ),
                React.createElement('span', { key: 'address' }, displayName),
              ]
            ),
          ]
        );
      }
    }
  );
}

function ConnectButtonPortal({ targetId }: { targetId: string }) {
  const [targetElement, setTargetElement] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    let attempts = 0;
    const maxAttempts = 40;
    const findElement = () => {
      const element = document.getElementById(targetId);
      if (element) {
        setTargetElement(element);
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(findElement, 50);
      }
    };
    findElement();
  }, [targetId]);

  if (!targetElement) return null;
  return createPortal(React.createElement(CustomConnectButton), targetElement);
}

export function RainbowKitApp({ connectButtonTargetId }: { connectButtonTargetId: string }) {
  const customLightTheme = lightTheme({
    accentColor: '#fed80e',
    accentColorForeground: '#000000',
    borderRadius: 'medium',
    fontStack: 'system',
    overlayBlur: 'small',
  });

  const customDarkTheme = darkTheme({
    accentColor: '#fed80e',
    accentColorForeground: '#000000',
    borderRadius: 'medium',
    fontStack: 'system',
    overlayBlur: 'small',
  });

  // Detect dark mode and watch for changes
  const [isDarkMode, setIsDarkMode] = React.useState(
    typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const theme = isDarkMode ? customDarkTheme : customLightTheme;

  return React.createElement(
    WagmiProvider,
    { config: wagmiConfigForRainbowKit },
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        RKProvider,
        {
          theme,
          children: [
            React.createElement(WalletStateSync, { key: 'wallet-state-sync' }),
            React.createElement(ConnectButtonPortal, { key: 'connect-button-portal', targetId: connectButtonTargetId })
          ]
        }
      )
    )
  );
}
