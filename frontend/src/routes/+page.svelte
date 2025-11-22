<script lang="ts">
  import { onMount } from 'svelte';
  import TokenList from '../components/TokenList.svelte';
  import { wallet } from '../lib/stores/wallet';
  import { goto } from '$app/navigation';
  import { getEscrowsByOwner, getEscrowStatus, getTimeUntilExecution } from '../lib/escrow';
  import { mainnet, sepolia } from 'viem/chains';
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
      const factoryAddress = (
        $wallet.chainId === mainnet.id || $wallet.chainId === sepolia.id
          ? import.meta.env.VITE_FACTORY_ADDRESS_ETHEREUM
          : import.meta.env.VITE_FACTORY_ADDRESS_BASE
      ) as Address;

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

  function formatTimeUntilExecution(seconds: bigint): string {
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

  function getTimeColor(seconds: bigint): string {
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
                    <span class="escrow-address text-mono"
                      >{escrow.address.slice(0, 10)}...{escrow.address.slice(-8)}</span
                    >
                    <span class="status-badge {getStatusColor(escrow.status)}">
                      {getStatusText(escrow.status)}
                    </span>
                  </div>
                  <div class="escrow-time {getTimeColor(escrow.timeUntilExecution)}">
                    {formatTimeUntilExecution(escrow.timeUntilExecution)}
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
    color: var(--color-text);
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
