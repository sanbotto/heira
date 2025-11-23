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
  import { mainnet, sepolia } from 'viem/chains';
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
  let emailNotification: string | null = null;
  let loadingEmail = false;
  let emailInput: string = '';
  let enablingEmail = false;
  let disablingEmail = false;

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

      // Load email notification data from backend
      await loadEmailNotification();
    } catch (err) {
      console.error('Failed to load escrow data:', err);
      error = err instanceof Error ? err.message : 'Failed to load escrow data';
    } finally {
      loading = false;
    }
  }

  async function loadEmailNotification() {
    if (!escrowAddress || !$wallet.chainId) {
      return;
    }

    loadingEmail = true;
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const networkName = getNetworkName($wallet.chainId);

      const response = await fetch(
        `${backendUrl}/api/escrows/${escrowAddress}?network=${networkName}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.escrow) {
          emailNotification = data.escrow.email || null;
        }
      } else {
        // Escrow might not be registered with keeper, that's okay
        emailNotification = null;
      }
    } catch (err) {
      console.warn('Failed to load email notification data:', err);
      emailNotification = null;
    } finally {
      loadingEmail = false;
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
      5115: 'https://explorer.testnet.citrea.xyz/address/',
    };

    return (baseUrls[$wallet.chainId] || 'https://etherscan.io/address/') + address + '#code';
  }

  function getExplorerName(): string {
    if (!$wallet.chainId) return 'Etherscan';

    switch ($wallet.chainId) {
      case 1:
      case 11155111:
        return 'Etherscan';
      case 8453:
      case 84532:
        return 'Basescan';
      case 5115:
        return 'Blockscout';
      default:
        return 'Etherscan';
    }
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

  function getNetworkName(chainId: number): string {
    if (chainId === mainnet.id) return 'mainnet';
    if (chainId === sepolia.id) return 'sepolia';
    if (chainId === 8453) return 'base';
    if (chainId === 84532) return 'baseSepolia';
    if (chainId === 5115) return 'citreaTestnet';
    return `chain-${chainId}`;
  }

  async function handleEnableEmail() {
    if (!emailInput.trim() || !$wallet.chainId || !escrowAddress) {
      return;
    }

    const email = emailInput.trim();

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToastMessage('Please enter a valid email address', 'error');
      return;
    }

    enablingEmail = true;
    showToastMessage('Enabling email notifications...', 'info');

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const networkName = getNetworkName($wallet.chainId);

      // Get inactivity period from the escrow contract
      let inactivityPeriod: number | undefined = undefined;
      try {
        const publicClient = getPublicClient($wallet.chainId);
        const inactivityPeriodBigInt = await publicClient.readContract({
          address: escrowAddress as Address,
          abi: [
            {
              name: 'inactivityPeriod',
              type: 'function',
              stateMutability: 'view',
              inputs: [],
              outputs: [{ type: 'uint256' }],
            },
          ] as const,
          functionName: 'inactivityPeriod',
        });
        inactivityPeriod = Number(inactivityPeriodBigInt);
      } catch (error) {
        console.warn('Could not fetch inactivity period, proceeding without it:', error);
      }

      const response = await fetch(`${backendUrl}/api/escrows/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          escrowAddress,
          network: networkName,
          email,
          inactivityPeriod,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to enable email notifications');
      }

      showToastMessage('Email notifications enabled successfully!', 'success');
      emailInput = '';

      // Reload email notification data
      await loadEmailNotification();
    } catch (error) {
      console.error('Failed to enable email notifications:', error);
      const errorMsg =
        error instanceof Error ? error.message : 'Failed to enable email notifications';
      showToastMessage(errorMsg, 'error');
    } finally {
      enablingEmail = false;
    }
  }

  async function handleDisableEmail() {
    if (!$wallet.chainId || !escrowAddress) {
      return;
    }

    disablingEmail = true;
    showToastMessage('Disabling email notifications...', 'info');

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const networkName = getNetworkName($wallet.chainId);

      // Get inactivity period from the escrow contract
      let inactivityPeriod: number | undefined = undefined;
      try {
        const publicClient = getPublicClient($wallet.chainId);
        const inactivityPeriodBigInt = await publicClient.readContract({
          address: escrowAddress as Address,
          abi: [
            {
              name: 'inactivityPeriod',
              type: 'function',
              stateMutability: 'view',
              inputs: [],
              outputs: [{ type: 'uint256' }],
            },
          ] as const,
          functionName: 'inactivityPeriod',
        });
        inactivityPeriod = Number(inactivityPeriodBigInt);
      } catch (error) {
        console.warn('Could not fetch inactivity period, proceeding without it:', error);
      }

      // Register with empty email to disable notifications
      const response = await fetch(`${backendUrl}/api/escrows/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          escrowAddress,
          network: networkName,
          email: null, // Set to null to disable
          inactivityPeriod,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to disable email notifications');
      }

      showToastMessage('Email notifications disabled successfully!', 'success');

      // Reload email notification data
      await loadEmailNotification();
    } catch (error) {
      console.error('Failed to disable email notifications:', error);
      const errorMsg =
        error instanceof Error ? error.message : 'Failed to disable email notifications';
      showToastMessage(errorMsg, 'error');
    } finally {
      disablingEmail = false;
    }
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
          View on {getExplorerName()}
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

    <!-- Email Notification Section -->
    <div class="card">
      <div class="card-header">
        <h2>Email Notifications</h2>
      </div>
      <div class="card-content">
        {#if loadingEmail}
          <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading notification settings...</p>
          </div>
        {:else if emailNotification}
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Status</span>
              <span class="status-badge status-active">Enabled</span>
            </div>
            <div class="info-item">
              <span class="info-label">Email Address</span>
              <span class="info-value">{emailNotification}</span>
            </div>
          </div>
          <div style="margin-top: 1.5rem;">
            <button
              class="btn btn-secondary"
              on:click={handleDisableEmail}
              disabled={disablingEmail}
            >
              {#if disablingEmail}
                Disabling...
              {:else}
                Disable Notifications
              {/if}
            </button>
          </div>
          <p style="margin-top: 1.5rem; font-size: 0.875rem;">
            <strong>Notification Details:</strong> You will receive an email notification when your escrow
            is approaching its inactivity period (less than 7 days remaining). This helps ensure you're
            aware before the escrow becomes executable.
          </p>
        {:else if status === 0}
          <div>
            <p style="margin-bottom: 1rem;">Email notifications are not enabled for this escrow.</p>
            <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
              <input
                type="email"
                bind:value={emailInput}
                placeholder="your@email.com"
                class="form-input"
                style="flex: 1;"
                disabled={enablingEmail}
              />
              <button
                class="btn btn-primary"
                on:click={handleEnableEmail}
                disabled={enablingEmail || !emailInput.trim()}
              >
                {#if enablingEmail}
                  Enabling...
                {:else}
                  Enable
                {/if}
              </button>
            </div>
            <p style="margin-top: 0.75rem; color: #6b7280; font-size: 0.875rem;">
              You will receive an email notification when less than 7 days remain until the
              inactivity period expires.
            </p>
          </div>
        {:else}
          <div class="empty-state">
            <p style="margin-bottom: 0.5rem;">
              Email notifications cannot be enabled for inactive escrows.
            </p>
            <p style="color: #6b7280; font-size: 0.875rem;">
              Only active escrows can be monitored for inactivity.
            </p>
          </div>
        {/if}
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
