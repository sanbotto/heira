<script lang="ts">
  import { onMount } from 'svelte';
  import { wallet } from '../../lib/stores/wallet';
  import { goto } from '$app/navigation';
  import { getEscrowsByOwner, getEscrowStatus, getTimeUntilExecution } from '../../lib/escrow';
  import { sepolia } from 'viem/chains';
  import type { Address } from 'viem';

  let escrows: Array<{
    address: string;
    timeUntilExecution: bigint;
    status: number;
  }> = [];

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
      if ($wallet.chainId === sepolia.id) {
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

  function getTimeColor(seconds: bigint, status: number): string {
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

  function handleEscrowClick(address: string) {
    goto(`/escrows/${address}`);
  }

  function handleEscrowKeydown(event: KeyboardEvent, address: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleEscrowClick(address);
    }
  }
</script>

<div class="container">
  <div class="header">
    <div>
      <h1>Manage Escrows</h1>
      <p class="description">View and manage your inheritance escrow contracts</p>
    </div>
    {#if $wallet.isConnected}
      <button class="btn btn-primary" on:click={() => goto('/create')}> Create New Escrow </button>
    {/if}
  </div>

  {#if $wallet.isConnected}
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
              <div
                class="escrow-item"
                role="button"
                tabindex="0"
                on:click={() => handleEscrowClick(escrow.address)}
                on:keydown={e => handleEscrowKeydown(e, escrow.address)}
              >
                <div class="escrow-header">
                  <span class="escrow-address text-mono">
                    {escrow.address}
                  </span>
                  <span class="status-badge {getStatusColor(escrow.status)}">
                    {getStatusText(escrow.status)}
                  </span>
                </div>
                <div class="escrow-footer">
                  <div class="escrow-time {getTimeColor(escrow.timeUntilExecution, escrow.status)}">
                    {formatTimeUntilExecution(escrow.timeUntilExecution, escrow.status)}
                  </div>
                  <span class="view-details">View Details →</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="card">
      <div class="empty-state">
        <p>Connect your wallet to get started</p>
        <p class="text-muted">
          You'll be able to view and manage your inheritance escrow contracts
        </p>
      </div>
    </div>
  {/if}
</div>

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
    cursor: pointer;
    transition: all 0.2s;
  }

  .escrow-item:hover {
    background-color: var(--color-background);
    border-color: var(--color-primary);
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
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
    word-break: break-all;
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

  .escrow-time {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .time-inactive {
    color: var(--color-text-muted);
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

  .view-details {
    font-size: 0.875rem;
    color: var(--color-primary);
    font-weight: 500;
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
