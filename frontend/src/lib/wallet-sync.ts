export function syncRainbowKitWalletState() {
  if (typeof window === 'undefined') return;

  // The wallet state will be synced automatically through RainbowKit's connection handling.
  // We'll update the store when connections change.
  // This function is called on mount to ensure sync is initialized.
}
