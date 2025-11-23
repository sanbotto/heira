<script lang="ts">
  import { onMount } from 'svelte';
  import TokenList from '../../components/TokenList.svelte';
  import Toast from '../../lib/components/Toast.svelte';
  import ConfirmationModal from '../../lib/components/ConfirmationModal.svelte';
  import { wallet } from '../../lib/stores/wallet';
  import { goto } from '$app/navigation';
  import {
    getEscrowsByOwner,
    getEscrowStatus,
    getTimeUntilExecution,
    deactivateEscrow,
  } from '../../lib/escrow';
  import { mainnet, sepolia } from 'viem/chains';
  import type { Address } from 'viem';
  import { getPublicClient } from '../../lib/wallet';

  let escrows: Array<{
    address: string;
    timeUntilExecution: bigint;
    status: number;
  }> = [];

  let deactivating: Set<string> = new Set();
  let deactivationTxHashes: Map<string, string> = new Map();
  let escrowToDeactivate: string | null = null;
  let showConfirmModal = false;

  let toastMessage = '';
  let toastType: 'error' | 'success' | 'info' = 'info';
  let showToast = false;

  function showToastMessage(message: string, type: 'error' | 'success' | 'info' = 'info') {
    toastMessage = message;
    toastType = type;
    showToast = true;
  }

  function getNetworkName(chainId: number): string {
    if (chainId === mainnet.id) return 'mainnet';
    if (chainId === sepolia.id) return 'sepolia';
    if (chainId === 8453) return 'base';
    if (chainId === 84532) return 'baseSepolia';
    if (chainId === 5115) return 'citreaTestnet';
    return `chain-${chainId}`;
  }

  async function loadEscrows() {
    if (!$wallet.address || !$wallet.chainId) {
      escrows = [];
      return;
    }

    try {
      // Get factory address based on current chain
      // Sepolia uses the same env var as Ethereum mainnet
      // Citrea Testnet uses its own env var
      let factoryAddress: Address;
      if ($wallet.chainId === mainnet.id || $wallet.chainId === sepolia.id) {
        factoryAddress = import.meta.env.VITE_FACTORY_ADDRESS_ETHEREUM as Address;
      } else if ($wallet.chainId === 5115) {
        factoryAddress = import.meta.env.VITE_FACTORY_ADDRESS_CITREA as Address;
      } else {
        factoryAddress = import.meta.env.VITE_FACTORY_ADDRESS_BASE as Address;
      }

      if (!factoryAddress || factoryAddress === '0x0000000000000000000000000000000000000000') {
        return;
      }

      const escrowAddresses = await getEscrowsByOwner(
        factoryAddress,
        $wallet.address,
        $wallet.chainId
      );

      escrows = await Promise.all(
        escrowAddresses.map(async address => {
          const [status, timeUntilExecution] = await Promise.all([
            getEscrowStatus(address, $wallet.chainId!),
            getTimeUntilExecution(address, $wallet.chainId!),
          ]);
          return {
            address,
            status: Number(status),
            timeUntilExecution,
          };
        })
      );

      // Sort escrows: active (status === 0) first, then inactive
      escrows.sort((a, b) => {
        if (a.status === 0 && b.status !== 0) return -1;
        if (a.status !== 0 && b.status === 0) return 1;
        return 0;
      });
    } catch (error) {
      console.error('Failed to load escrows:', error);
    }
  }

  // Load escrows when wallet connects
  $: if ($wallet.isConnected && $wallet.address && $wallet.chainId) {
    loadEscrows();
  }

  function getStatusColor(status: number): string {
    return status === 0 ? 'status-active' : 'status-inactive';
  }

  function getStatusText(status: number): string {
    return status === 0 ? 'Active' : 'Inactive';
  }

  function formatTimeUntilExecution(seconds: bigint, status: number): string {
    // Inactive escrows return type(uint256).max from getTimeUntilExecution
    // Check if it's the max value (inactive) or if status is inactive
    const MAX_UINT256 = BigInt(
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    );
    if (status !== 0 || seconds === MAX_UINT256 || seconds > BigInt(Number.MAX_SAFE_INTEGER)) {
      return 'N/A';
    }

    if (seconds === BigInt(0)) {
      return 'Ready to execute';
    }

    const days = Number(seconds) / (24 * 60 * 60);
    if (days > 30) {
      return `${Math.floor(days / 30)} months`;
    }
    if (days > 7) {
      return `${Math.floor(days / 7)} weeks`;
    }
    return `${Math.floor(days)} days`;
  }

  function getExplorerUrl(address: string): string {
    if (!$wallet.chainId) return '#';

    const baseUrls: Record<number, string> = {
      1: 'https://etherscan.io/address/',
      11155111: 'https://sepolia.etherscan.io/address/',
      8453: 'https://basescan.org/address/',
      84532: 'https://sepolia.basescan.org/address/',
      5115: 'https://explorer.testnet.citrea.xyz/address/',
    };

    return (baseUrls[$wallet.chainId] || 'https://etherscan.io/address/') + address + '#code';
  }

  function getTimeColor(seconds: bigint, status: number): string {
    // Inactive escrows
    const MAX_UINT256 = BigInt(
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    );
    if (status !== 0 || seconds === MAX_UINT256 || seconds > BigInt(Number.MAX_SAFE_INTEGER)) {
      return 'time-inactive';
    }

    if (seconds === BigInt(0)) {
      return 'time-critical';
    }
    const days = Number(seconds) / (24 * 60 * 60);
    if (days < 7) {
      return 'time-critical';
    }
    if (days < 30) {
      return 'time-warning';
    }
    return 'time-ok';
  }

  function handleDeactivateClick(escrowAddress: string) {
    escrowToDeactivate = escrowAddress;
    showConfirmModal = true;
  }

  function handleConfirmDeactivate() {
    showConfirmModal = false;
    if (escrowToDeactivate) {
      performDeactivate(escrowToDeactivate);
      escrowToDeactivate = null;
    }
  }

  function handleCancelDeactivate() {
    showConfirmModal = false;
    escrowToDeactivate = null;
  }

  async function performDeactivate(escrowAddress: string) {
    if (!$wallet.chainId) return;

    deactivating.add(escrowAddress);
    showToastMessage('Sending deactivation transaction...', 'info');

    try {
      const publicClient = getPublicClient($wallet.chainId);
      const txHash = await deactivateEscrow(escrowAddress as Address, $wallet.chainId);
      deactivationTxHashes.set(escrowAddress, txHash);

      showToastMessage('Transaction sent! Waiting for confirmation...', 'info');

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
      });

      if (receipt.status === 'success') {
        showToastMessage(`Escrow deactivated successfully!`, 'success');

        // Unregister escrow from keeper service
        try {
          const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
          const networkName = getNetworkName($wallet.chainId);

          await fetch(`${backendUrl}/api/escrows/unregister`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              escrowAddress,
              network: networkName,
            }),
          });

          console.log('Escrow unregistered from keeper service');
        } catch (unregisterError) {
          console.warn('Failed to unregister escrow from keeper:', unregisterError);
          // Don't fail the whole flow if unregistration fails
        }

        // Reload escrows to reflect the change
        await loadEscrows();
      } else {
        showToastMessage('Transaction failed. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Failed to deactivate escrow:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to deactivate escrow';
      showToastMessage(errorMsg, 'error');
    } finally {
      deactivating.delete(escrowAddress);
      deactivationTxHashes.delete(escrowAddress);
    }
  }

  function getTxExplorerUrl(txHash: string): string {
    if (!$wallet.chainId) return '#';

    const baseUrls: Record<number, string> = {
      1: 'https://etherscan.io/tx/',
      11155111: 'https://sepolia.etherscan.io/tx/',
      8453: 'https://basescan.org/tx/',
      84532: 'https://sepolia.basescan.org/tx/',
      5115: 'https://explorer.testnet.citrea.xyz/tx/',
    };

    return (baseUrls[$wallet.chainId] || 'https://etherscan.io/tx/') + txHash;
  }
</script>

<div class="container">
  <div class="header">
    <div>
      <h1>Dashboard</h1>
      <p class="description">Manage your inheritance escrow contracts</p>
    </div>
    {#if $wallet.isConnected}
      <button class="btn btn-primary" on:click={() => goto('/create')}> Create New Escrow </button>
    {/if}
  </div>

  {#if $wallet.isConnected}
    <div class="grid">
      <!-- Escrows Card -->
      <div class="card">
        <div class="card-header">
          <h2>Your Escrows</h2>
        </div>
        <div class="card-content">
          {#if escrows.length === 0}
            <div class="empty-state">
              <p>No escrows found</p>
              <button class="btn btn-primary" on:click={() => goto('/create')}>
                Create Your First Escrow
              </button>
            </div>
          {:else}
            <div class="escrow-list">
              {#each escrows as escrow}
                <div class="escrow-item">
                  <div class="escrow-header">
                    <a href="/escrows/{escrow.address}" class="escrow-address text-mono">
                      {escrow.address}
                    </a>
                    <span class="status-badge {getStatusColor(escrow.status)}">
                      {getStatusText(escrow.status)}
                    </span>
                  </div>
                  <div class="escrow-footer">
                    <div
                      class="escrow-time {getTimeColor(escrow.timeUntilExecution, escrow.status)}"
                    >
                      {formatTimeUntilExecution(escrow.timeUntilExecution, escrow.status)}
                    </div>
                    {#if escrow.status === 0}
                      <div class="deactivate-section">
                        {#if deactivating.has(escrow.address)}
                          <div class="deactivating-indicator">
                            <span class="spinner"></span>
                            <span>Deactivating...</span>
                            {#if deactivationTxHashes.has(escrow.address)}
                              <a
                                href={getTxExplorerUrl(deactivationTxHashes.get(escrow.address)!)}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="tx-link"
                              >
                                View TX
                              </a>
                            {/if}
                          </div>
                        {:else}
                          <button
                            class="btn btn-secondary btn-sm"
                            on:click={() => handleDeactivateClick(escrow.address)}
                          >
                            Deactivate
                          </button>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Token Balances Card -->
      <div class="card">
        <div class="card-header">
          <h2>Token Balances</h2>
        </div>
        <div class="card-content">
          <TokenList />
        </div>
      </div>
    </div>
  {:else}
    <div class="card">
      <div class="empty-state">
        <p>Connect your wallet to get started</p>
        <p class="text-muted">You'll be able to create and manage inheritance escrow contracts</p>
      </div>
    </div>
  {/if}
</div>

<ConfirmationModal
  title="Deactivate Escrow"
  message="Are you sure you want to deactivate this escrow? This action cannot be undone."
  confirmText="Deactivate"
  cancelText="Cancel"
  confirmButtonClass="btn-secondary"
  isOpen={showConfirmModal}
  onConfirm={handleConfirmDeactivate}
  onCancel={handleCancelDeactivate}
/>

{#if showToast}
  <Toast message={toastMessage} type={toastType} onClose={() => (showToast = false)} />
{/if}

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    gap: 1rem;
    flex-wrap: wrap;
  }

  h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
    color: var(--color-text);
  }

  .description {
    color: var(--color-text-secondary);
    margin: 0;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 1.5rem;
  }

  .card {
    background: var(--color-background-card);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    border: 1px solid var(--color-border);
    overflow: hidden;
  }

  .card-header {
    padding: 1.5rem;
    border-bottom: 1px solid var(--color-border);
    background-color: var(--color-background-light);
  }

  .card-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .card-content {
    padding: 1.5rem;
  }

  .escrow-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .escrow-item {
    padding: 1rem;
    background-color: var(--color-background-light);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
  }

  .escrow-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .escrow-address {
    font-size: 0.9rem;
    color: var(--color-primary);
    text-decoration: none;
    word-break: break-all;
    transition: opacity 0.2s;
  }

  .escrow-address:hover {
    opacity: 0.8;
    text-decoration: underline;
  }

  .status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .status-active {
    background-color: #f0fff4;
    color: #166534;
  }

  .status-inactive {
    background-color: var(--color-background-light);
    color: var(--color-text-muted);
  }

  .escrow-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.5rem;
  }

  .btn-sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
  }

  .time-inactive {
    color: var(--color-text-muted);
  }

  .escrow-time {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .time-critical {
    color: var(--color-danger);
  }

  .time-warning {
    color: #f59e0b;
  }

  .time-ok {
    color: var(--color-success);
  }

  .deactivate-section {
    display: flex;
    align-items: center;
  }

  .deactivating-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text);
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .tx-link {
    color: var(--color-primary);
    text-decoration: none;
    font-size: 0.875rem;
    margin-left: 0.5rem;
  }

  .tx-link:hover {
    text-decoration: underline;
  }

  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
  }

  .empty-state p {
    margin-bottom: 1rem;
    color: var(--color-text);
  }

  :root.dark .status-active {
    background-color: #14532d;
    color: #86efac;
  }
</style>
