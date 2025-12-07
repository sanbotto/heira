<script lang="ts">
  import { onMount } from 'svelte';
  import type { TokenBalance } from '../lib/tokens';
  import { getTokenBalances } from '../lib/tokens';
  import { getTokenPrices } from '../lib/prices';
  import { wallet } from '../lib/stores/wallet';

  let tokens: TokenBalance[] = [];
  let loading = true;
  let prices: Record<string, number> = {};

  onMount(async () => {
    if ($wallet.address) {
      await loadTokens();
    }
  });

  async function loadTokens() {
    if (!$wallet.address) return;

    loading = true;
    try {
      // Query balances for the current chain
      tokens = await getTokenBalances($wallet.address, $wallet.chainId || undefined);

      // Get prices for all unique symbols
      const symbols = [...new Set(tokens.map(t => t.symbol))];
      if ($wallet.chainId) {
        prices = await getTokenPrices(symbols, $wallet.chainId);
      }

      // Calculate USD values
      tokens = tokens.map(token => {
        const price = prices[token.symbol] || 0;
        const balanceNum = parseFloat(token.balance) / Math.pow(10, token.decimals);
        return {
          ...token,
          usdValue: balanceNum * price,
        };
      });
    } catch (error) {
      console.error('Failed to load tokens:', error);
    } finally {
      loading = false;
    }
  }

  function formatBalance(balance: string, decimals: number): string {
    const num = parseFloat(balance) / Math.pow(10, decimals);
    // Format with exactly 5 decimal places, avoiding scientific notation
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 5,
      maximumFractionDigits: 5,
    });
  }

  function getChainName(chainId: number): string {
    switch (chainId) {
      case 1:
        return 'Ethereum';
      case 11155111:
        return 'Sepolia';
      case 8453:
        return 'Base';
      case 84532:
        return 'Base Sepolia';
      case 5115:
        return 'Citrea Testnet';
      default:
        return `Chain ${chainId}`;
    }
  }

  $: if ($wallet.isConnected && $wallet.address) {
    loadTokens();
  }
</script>

<div class="token-list">
  {#if loading}
    <div class="loading">Loading tokens...</div>
  {:else if tokens.length === 0}
    <div class="empty-state">
      <p>No tokens found</p>
    </div>
  {:else}
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Chain</th>
            <th class="text-right">Balance</th>
            <th class="text-right">USD Value</th>
          </tr>
        </thead>
        <tbody>
          {#each tokens as token}
            <tr>
              <td>
                <div class="token-info">
                  <span class="token-symbol">{token.symbol}</span>
                  <span class="token-name">{token.name}</span>
                </div>
              </td>
              <td>{getChainName(token.chainId)}</td>
              <td class="text-right text-mono">
                {formatBalance(token.balance, token.decimals)}
              </td>
              <td class="text-right">
                {#if token.usdValue !== undefined}
                  ${token.usdValue.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                {:else}
                  <span class="text-muted">-</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .token-list {
    width: 100%;
  }

  .token-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .token-symbol {
    font-weight: 600;
    color: var(--color-text);
  }

  .token-name {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }

  .table th.text-right,
  .table td.text-right {
    text-align: right;
  }
</style>
