<script lang="ts">
  import { wallet } from '../lib/stores/wallet';
  import EnsAvatar from './EnsAvatar.svelte';
  import Toast from '../lib/components/Toast.svelte';

  let connecting = false;
  let toastMessage = '';
  let toastType: 'error' | 'success' | 'info' = 'error';
  let showToast = false;

  function showErrorToast(message: string) {
    toastMessage = message;
    toastType = 'error';
    showToast = true;
  }

  async function handleConnect() {
    connecting = true;
    try {
      await wallet.connect();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to connect wallet';
      showErrorToast(errorMsg);
    } finally {
      connecting = false;
    }
  }

  async function handleDisconnect() {
    await wallet.disconnect();
  }
</script>

<div class="wallet-connect">
  {#if $wallet.isConnected}
    <div class="wallet-info">
      <button class="wallet-button" on:click={handleDisconnect} type="button"> Disconnect </button>
      <div class="wallet-address">
        {#if $wallet.ensName}
          <span class="wallet-name">{$wallet.ensName}</span>
        {:else}
          <span class="text-mono">
            {$wallet.address?.slice(0, 6)}...{$wallet.address?.slice(-4)}
          </span>
        {/if}
        {#if $wallet.ensName}
          <EnsAvatar address={$wallet.ensName} size={20} />
        {/if}
      </div>
    </div>
  {:else}
    <button
      class="wallet-button wallet-button-primary"
      on:click={handleConnect}
      disabled={connecting}
      type="button"
    >
      {connecting ? 'Connecting...' : 'Connect Wallet'}
    </button>
  {/if}
</div>

{#if showToast}
  <Toast message={toastMessage} type={toastType} onClose={() => (showToast = false)} />
{/if}

<style>
  .wallet-connect {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
  }

  .wallet-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .wallet-address {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .wallet-name {
    color: var(--color-primary);
    font-weight: 600;
  }

  .wallet-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text);
    font-family: inherit;
    height: auto;
    line-height: 1.5;
  }

  .wallet-button:hover:not(:disabled) {
    background-color: var(--color-background-light);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .wallet-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .wallet-button-primary {
    background-color: var(--color-primary);
    color: #000;
    border-color: var(--color-primary);
  }

  .wallet-button-primary:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
    color: #000;
    border-color: var(--color-primary-hover);
  }
</style>
