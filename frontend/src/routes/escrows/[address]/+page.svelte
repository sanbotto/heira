<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { wallet } from '../../../lib/stores/wallet';
  import { goto } from '$app/navigation';
  import {
    getBeneficiaries,
    getEscrowStatus,
    getTimeUntilExecution,
    deactivateEscrow,
  } from '../../../lib/escrow';
  import { getPublicClient } from '../../../lib/wallet';
  import ConfirmationModal from '../../../lib/components/ConfirmationModal.svelte';
  import Toast from '../../../lib/components/Toast.svelte';
  import type { Address } from 'viem';

  let loading = true;
  let error: string | null = null;
  let escrowAddress: string = '';
  let status: number = 0;
  let timeUntilExecution: bigint = BigInt(0);
  let beneficiaries: Array<{
    recipient: Address;
    percentage: bigint;
    chainId: bigint;
    tokenAddress: Address;
    shouldSwap: boolean;
    targetToken: Address;
  }> = [];

  let showConfirmModal = false;
  let deactivating = false;
  let toastMessage = '';
  let toastType: 'error' | 'success' | 'info' = 'info';
  let showToast = false;

  onMount(async () => {
    escrowAddress = $page.params.address ?? '';
    if (escrowAddress && $wallet.chainId) {
      await loadEscrowData();
    } else {
      error = 'Invalid escrow address or wallet not connected';
      loading = false;
    }
  });

  async function loadEscrowData() {
    if (!escrowAddress || !$wallet.chainId) {
      return;
    }

    loading = true;
    error = null;

    try {
      const [escrowStatus, timeUntilExec, bens] = await Promise.all([
        getEscrowStatus(escrowAddress as Address, $wallet.chainId),
        getTimeUntilExecution(escrowAddress as Address, $wallet.chainId),
        getBeneficiaries(escrowAddress as Address, $wallet.chainId),
      ]);

      status = Number(escrowStatus);
      timeUntilExecution = timeUntilExec;
      beneficiaries = bens;
    } catch (err) {
      console.error('Failed to load escrow data:', err);
      error = err instanceof Error ? err.message : 'Failed to load escrow data';
    } finally {
      loading = false;
    }
  }

  function getStatusColor(status: number): string {
    return status === 0 ? 'status-active' : 'status-inactive';
  }

  function getStatusText(status: number): string {
    return status === 0 ? 'Active' : 'Inactive';
  }

  function formatTimeUntilExecution(seconds: bigint, status: number): string {
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

  function getChainName(chainId: number | bigint): string {
    const id = Number(chainId);
    switch (id) {
      case 1:
        return 'Ethereum';
      case 11155111:
        return 'Sepolia';
      case 8453:
        return 'Base';
      case 84532:
        return 'Base Sepolia';
      default:
        return `Chain ${id}`;
    }
  }

  function formatPercentage(basisPoints: bigint): string {
    const percentage = Number(basisPoints) / 100;
    return `${percentage.toFixed(2)}%`;
  }

  function getExplorerUrl(address: string): string {
    if (!$wallet.chainId) return '#';

    const baseUrls: Record<number, string> = {
      1: 'https://etherscan.io/address/',
      11155111: 'https://sepolia.etherscan.io/address/',
      8453: 'https://basescan.org/address/',
      84532: 'https://sepolia.basescan.org/address/',
    };

    return (baseUrls[$wallet.chainId] || 'https://etherscan.io/address/') + address + '#code';
  }

  function formatAddress(address: string): string {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function getTokensForBeneficiary(beneficiaryChainId: bigint): Array<{
    tokenAddress: Address;
    chainId: bigint;
    shouldSwap: boolean;
    targetToken: Address;
  }> {
    return beneficiaries
      .filter(ben => ben.chainId === beneficiaryChainId)
      .map(ben => ({
        tokenAddress: ben.tokenAddress,
        chainId: ben.chainId,
        shouldSwap: ben.shouldSwap,
        targetToken: ben.targetToken,
      }));
  }

  function showToastMessage(message: string, type: 'error' | 'success' | 'info' = 'info') {
    toastMessage = message;
    toastType = type;
    showToast = true;
  }

  function handleDeactivateClick() {
    showConfirmModal = true;
  }

  function handleConfirmDeactivate() {
    showConfirmModal = false;
    performDeactivate();
  }

  function handleCancelDeactivate() {
    showConfirmModal = false;
  }

  async function performDeactivate() {
    if (!$wallet.chainId || !escrowAddress) return;

    deactivating = true;
    showToastMessage('Sending deactivation transaction...', 'info');

    try {
      const publicClient = getPublicClient($wallet.chainId);
      const txHash = await deactivateEscrow(escrowAddress as Address, $wallet.chainId);

      showToastMessage('Transaction sent! Waiting for confirmation...', 'info');

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
      });

      if (receipt.status === 'success') {
        showToastMessage('Escrow deactivated successfully!', 'success');
        // Reload escrow data to reflect the change
        await loadEscrowData();
      } else {
        showToastMessage('Transaction failed. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Failed to deactivate escrow:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to deactivate escrow';
      showToastMessage(errorMsg, 'error');
    } finally {
      deactivating = false;
    }
  }
</script>

<div class="container">
  <div class="header">
    <div>
      <button class="btn btn-secondary btn-sm" on:click={() => goto('/escrows')}>
        ← Back to Escrows
      </button>
      <h1 style="margin-top: 2rem;">Escrow Details</h1>
      <p class="description">View beneficiaries and token distribution for this escrow</p>
    </div>
    {#if escrowAddress}
      <div class="header-actions">
        {#if status === 0}
          <button
            class="btn btn-secondary"
            on:click={handleDeactivateClick}
            disabled={deactivating}
          >
            {#if deactivating}
              Deactivating...
            {:else}
              Deactivate Escrow
            {/if}
          </button>
        {/if}
        <a
          href={getExplorerUrl(escrowAddress)}
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-primary"
          style="text-decoration: none;"
        >
          View on Etherscan
        </a>
      </div>
    {/if}
  </div>

  {#if loading}
    <div class="card">
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading escrow data...</p>
      </div>
    </div>
  {:else if error}
    <div class="card">
      <div class="error-state">
        <p class="error-message">{error}</p>
        <button class="btn btn-primary" on:click={loadEscrowData}>Retry</button>
      </div>
    </div>
  {:else}
    <!-- Escrow Header -->
    <div class="card">
      <div class="card-header">
        <h2>Escrow Information</h2>
      </div>
      <div class="card-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Address</span>
            <span class="info-value text-mono">{escrowAddress}</span>
          </div>
          <div class="info-item text-center">
            <span class="info-label">Status</span>
            <span class="status-badge {getStatusColor(status)}">{getStatusText(status)}</span>
          </div>
          <div class="info-item text-center">
            <span class="info-label">Time Until Execution</span>
            <span class="info-value">{formatTimeUntilExecution(timeUntilExecution, status)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Beneficiaries Section -->
    <div class="card">
      <div class="card-header">
        <h2>Beneficiaries</h2>
      </div>
      <div class="card-content">
        {#if beneficiaries.length === 0}
          <div class="empty-state">
            <p>No beneficiaries configured</p>
          </div>
        {:else}
          <div class="table-wrapper">
            <table class="table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th class="text-center">Percentage</th>
                  <th class="text-center">Chain</th>
                  <th class="text-center">Token Distribution</th>
                </tr>
              </thead>
              <tbody>
                {#each beneficiaries as beneficiary}
                  <tr>
                    <td class="text-mono">{beneficiary.recipient}</td>
                    <td class="text-center">{formatPercentage(beneficiary.percentage)}</td>
                    <td class="text-center">{getChainName(beneficiary.chainId)}</td>
                    <td class="text-center token-distribution">
                      {#each getTokensForBeneficiary(beneficiary.chainId) as token}
                        <div class="token-item">
                          <span class="text-mono">{formatAddress(token.tokenAddress)}</span>
                          {#if token.shouldSwap && token.targetToken !== '0x0000000000000000000000000000000000000000'}
                            <span class="swap-arrow">→</span>
                            <span class="text-mono">{formatAddress(token.targetToken)}</span>
                          {/if}
                        </div>
                      {/each}
                      {#if getTokensForBeneficiary(beneficiary.chainId).length === 0}
                        <span class="text-muted">Transfer as-is</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
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

  .header-actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
    margin-top: 1rem;
    color: var(--color-text);
  }

  .description {
    color: var(--color-text-secondary);
    margin: 0;
  }

  .card {
    background: var(--color-background-card);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    border: 1px solid var(--color-border);
    overflow: hidden;
    margin-bottom: 1.5rem;
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

  .info-grid {
    display: grid;
    grid-template-columns: 40% 30% 30%;
    gap: 1.5rem;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .info-item.text-center {
    align-items: center;
    text-align: center;
  }

  .info-label {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .info-value {
    font-size: 1rem;
    color: var(--color-text);
    word-break: break-all;
  }

  .status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    font-weight: 500;
    display: inline-block;
    width: fit-content;
  }

  .status-active {
    background-color: #f0fff4;
    color: #166534;
  }

  .status-inactive {
    background-color: var(--color-background-light);
    color: var(--color-text-muted);
  }

  .table-wrapper {
    overflow-x: auto;
  }

  .table {
    width: 100%;
    border-collapse: collapse;
  }

  .table th {
    text-align: left;
    padding: 0.75rem;
    border-bottom: 1px solid var(--color-border);
    font-weight: 600;
    color: var(--color-text);
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .table td {
    padding: 0.75rem;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text);
  }

  .table tbody tr:hover {
    background-color: var(--color-background-light);
  }

  .table th.text-center,
  .table td.text-center {
    text-align: center;
  }

  .token-distribution {
    max-width: 400px;
  }

  .token-item {
    display: block;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .token-item:last-child {
    margin-bottom: 0;
  }

  .swap-arrow {
    color: var(--color-text-secondary);
    font-weight: 600;
    margin: 0 0.4rem;
  }

  .badge {
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .badge-success {
    background-color: #f0fff4;
    color: #166534;
  }

  .badge-secondary {
    background-color: var(--color-background-light);
    color: var(--color-text-muted);
  }

  .loading-state,
  .error-state,
  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
  }

  .loading-state p,
  .error-state p,
  .empty-state p {
    margin-top: 1rem;
    color: var(--color-text);
  }

  .error-message {
    color: var(--color-danger);
    margin-bottom: 1rem;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin: 0 auto;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  :root.dark .status-active {
    background-color: #14532d;
    color: #86efac;
  }

  :root.dark .badge-success {
    background-color: #14532d;
    color: #86efac;
  }
</style>
