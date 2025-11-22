<script lang="ts">
  import { wallet } from '../../lib/stores/wallet';
  import { resolveEnsName } from '../../lib/ens';
  import { createEscrow, type BeneficiaryConfig, type TokenConfig } from '../../lib/escrow';
  import { mainnet } from 'viem/chains';
  import type { Address } from 'viem';
  import { supportedChains, type SupportedChainId } from '../../lib/wallet';
  import Toast from '../../lib/components/Toast.svelte';

  let mainWallet: string = '';
  let inactivityPeriod: number = 90; // days

  // Dynamic beneficiary rows
  let beneficiaryRows: Array<{
    address: string;
    percentage: number;
    chainId: number;
    tokenType: 'native' | 'usdc';
  }> = [{ address: '', percentage: 0, chainId: 1, tokenType: 'native' }];

  let showTokenInfo = false;
  let tooltipPosition = { top: 0, left: 0 };
  let infoIconElement: SVGSVGElement | null = null;

  // USDC token addresses
  const USDC_ADDRESSES: Record<number, Address> = {
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address, // Ethereum
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address, // Base
  };

  let creating = false;
  let toastMessage = '';
  let toastType: 'error' | 'success' | 'info' = 'error';
  let showToast = false;

  function showErrorToast(message: string) {
    toastMessage = message;
    toastType = 'error';
    showToast = true;
  }

  function showSuccessToast(message: string) {
    toastMessage = message;
    toastType = 'success';
    showToast = true;
  }

  // Calculate total percentage from all rows
  $: totalPercentage = beneficiaryRows.reduce((sum, row) => sum + (row.percentage || 0), 0);

  // Check if total exceeds 100%
  $: isTotalOver100 = totalPercentage > 100;

  // Check if all rows are filled (both address and percentage)
  $: allRowsFilled = beneficiaryRows.every(row => row.address && row.percentage > 0);

  // Add a new empty row
  function addRow() {
    beneficiaryRows = [
      ...beneficiaryRows,
      { address: '', percentage: 0, chainId: 1, tokenType: 'native' },
    ];
  }

  // Remove a row
  function removeRow(index: number) {
    if (beneficiaryRows.length > 1) {
      beneficiaryRows = beneficiaryRows.filter((_, i) => i !== index);
    } else {
      // If only one row, just clear it
      beneficiaryRows = [{ address: '', percentage: 0, chainId: 1, tokenType: 'native' }];
    }
  }

  // Get valid beneficiaries (rows with both address and percentage)
  $: validBeneficiaries = beneficiaryRows
    .filter(row => row.address && row.percentage > 0)
    .map(row => ({
      recipient: row.address as Address,
      percentage: row.percentage,
      chainId: row.chainId as any,
    }));

  async function resolveAddress(input: string): Promise<Address | null> {
    if (input.endsWith('.eth')) {
      return await resolveEnsName(input);
    }
    if (input.startsWith('0x') && input.length === 42) {
      return input as Address;
    }
    return null;
  }

  async function handleCreateEscrow() {
    if (!$wallet.address || !$wallet.chainId) {
      showErrorToast('Please connect your wallet first');
      return;
    }

    if (validBeneficiaries.length === 0) {
      showErrorToast('Please add at least one beneficiary');
      return;
    }

    if (totalPercentage !== 100) {
      showErrorToast(`Total percentage must equal 100% (currently ${totalPercentage}%)`);
      return;
    }

    creating = true;

    try {
      const mainWalletAddress = (await resolveAddress(mainWallet)) || ($wallet.address as Address);
      const inactivityPeriodSeconds = inactivityPeriod * 24 * 60 * 60;

      // Build token configs based on beneficiary selections
      // Group by chainId and tokenType to create token configs
      const tokenConfigs: TokenConfig[] = [];
      const chainTokenMap = new Map<string, { chainId: number; tokenType: 'native' | 'usdc' }>();

      // Collect unique chainId + tokenType combinations from beneficiaries
      // Match beneficiaries to rows by index since validBeneficiaries maintains order
      validBeneficiaries.forEach((beneficiary, idx) => {
        // Find the corresponding row by matching address, chainId, and percentage
        const row = beneficiaryRows.find(
          r =>
            r.address &&
            r.address.toLowerCase() === beneficiary.recipient.toLowerCase() &&
            r.chainId === beneficiary.chainId &&
            r.percentage === beneficiary.percentage
        );

        if (row && row.tokenType) {
          const key = `${beneficiary.chainId}-${row.tokenType}`;
          if (!chainTokenMap.has(key)) {
            chainTokenMap.set(key, { chainId: beneficiary.chainId, tokenType: row.tokenType });
          }
        }
      });

      // Create token configs for chains that need USDC swap
      chainTokenMap.forEach(({ chainId, tokenType }) => {
        if (tokenType === 'usdc') {
          const usdcAddress = USDC_ADDRESSES[chainId];
          if (usdcAddress) {
            tokenConfigs.push({
              tokenAddress: '0x0000000000000000000000000000000000000000' as Address, // Native token
              chainId: chainId as SupportedChainId,
              shouldSwap: true,
              targetToken: usdcAddress,
            });
          }
        }
      });

      // Get factory address from environment based on current chain
      const factoryAddress = (
        $wallet.chainId === mainnet.id
          ? import.meta.env.VITE_FACTORY_ADDRESS_ETHEREUM
          : import.meta.env.VITE_FACTORY_ADDRESS_BASE
      ) as Address;

      if (!factoryAddress || factoryAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error(
          `Factory address not configured for chain ${$wallet.chainId}. Please set ${$wallet.chainId === mainnet.id ? 'VITE_FACTORY_ADDRESS_ETHEREUM' : 'VITE_FACTORY_ADDRESS_BASE'} in .env`
        );
      }

      const escrowAddress = await createEscrow(
        factoryAddress,
        {
          mainWallet: mainWalletAddress,
          inactivityPeriod: inactivityPeriodSeconds,
          beneficiaries: validBeneficiaries,
          tokenConfigs,
        },
        $wallet.chainId
      );

      showSuccessToast(`Escrow created successfully at ${escrowAddress}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create escrow';
      showErrorToast(errorMsg);
    } finally {
      creating = false;
    }
  }
</script>

<div class="container">
  <h1>Create Inheritance Escrow</h1>
  <p class="description">
    Set up an escrow contract that will transfer your assets to beneficiaries after a period of
    inactivity
  </p>

  <div class="card">
    <div class="card-content">
      <!-- Main Wallet -->
      <div class="form-group">
        <label for="main-wallet" class="form-label"> Main Wallet Address (or ENS name) </label>
        <input
          id="main-wallet"
          type="text"
          bind:value={mainWallet}
          placeholder={$wallet.address || '0x... or name.eth'}
          class="form-input"
        />
        <p class="form-help">
          Wallet to monitor for activity. Leave empty to use connected wallet.
        </p>
      </div>

      <!-- Inactivity Period -->
      <div class="form-group">
        <label for="inactivity-period" class="form-label"> Inactivity Period (days) </label>
        <input
          id="inactivity-period"
          type="number"
          bind:value={inactivityPeriod}
          min="1"
          class="form-input"
        />
        <p class="form-help">
          After this many days of no transactions, the escrow can be executed.
        </p>
      </div>

      <!-- Beneficiaries -->
      <div class="form-group">
        <h3 class="form-label">Beneficiaries</h3>

        <div class="beneficiaries-table-wrapper">
          <table class="beneficiaries-table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Percentage</th>
                <th>Chain</th>
                <th>
                  Token Distribution
                  <div class="info-icon-container">
                    <svg
                      class="info-icon"
                      width="16"
                      height="16"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 15"
                      fill="none"
                      role="button"
                      aria-label="Token distribution information"
                      tabindex="0"
                      bind:this={infoIconElement}
                      on:mouseenter={() => {
                        if (infoIconElement) {
                          const rect = infoIconElement.getBoundingClientRect();
                          tooltipPosition = {
                            top: rect.top - 10,
                            left: rect.left + rect.width / 2,
                          };
                        }
                        showTokenInfo = true;
                      }}
                      on:mouseleave={() => (showTokenInfo = false)}
                      on:focus={() => {
                        if (infoIconElement) {
                          const rect = infoIconElement.getBoundingClientRect();
                          tooltipPosition = {
                            top: rect.top - 10,
                            left: rect.left + rect.width / 2,
                          };
                        }
                        showTokenInfo = true;
                      }}
                      on:blur={() => (showTokenInfo = false)}
                    >
                      <path
                        d="M7.11816 3.75H8.61816V5.25H7.11816V3.75ZM7.11816 6.75H8.61816V11.25H7.11816V6.75ZM7.86816 0C3.72816 0 0.368164 3.36 0.368164 7.5C0.368164 11.64 3.72816 15 7.86816 15C12.0082 15 15.3682 11.64 15.3682 7.5C15.3682 3.36 12.0082 0 7.86816 0ZM7.86816 13.5C4.56066 13.5 1.86816 10.8075 1.86816 7.5C1.86816 4.1925 4.56066 1.5 7.86816 1.5C11.1757 1.5 13.8682 4.1925 13.8682 7.5C13.8682 10.8075 11.1757 13.5 7.86816 13.5Z"
                        fill="currentColor"
                      ></path>
                    </svg>
                    {#if showTokenInfo}
                      <div
                        class="info-tooltip"
                        style="top: {tooltipPosition.top}px; left: {tooltipPosition.left}px;"
                      >
                        <p>
                          <strong>Native:</strong> Send existing tokens as-is to this beneficiary.
                        </p>
                        <p>
                          <strong>USDC:</strong> Swap all tokens to USDC before sending to this beneficiary.
                        </p>
                      </div>
                    {/if}
                  </div>
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each beneficiaryRows as row, index}
                <tr>
                  <td>
                    <input
                      type="text"
                      bind:value={row.address}
                      placeholder="0x... or name.eth"
                      class="form-input"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      bind:value={row.percentage}
                      placeholder="%"
                      min="0"
                      max="100"
                      class="form-input"
                    />
                  </td>
                  <td>
                    <select bind:value={row.chainId} class="form-select">
                      {#each supportedChains as chain}
                        <option value={chain.id}>{chain.name}</option>
                      {/each}
                    </select>
                  </td>
                  <td>
                    <select bind:value={row.tokenType} class="form-select">
                      <option value="native">Native</option>
                      <option value="usdc">USDC</option>
                    </select>
                  </td>
                  <td>
                    <button
                      class="btn-remove-row"
                      on:click={() => removeRow(index)}
                      type="button"
                      aria-label="Remove row"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <button class="btn btn-secondary" on:click={addRow} disabled={!allRowsFilled} type="button">
          Add Beneficiary
        </button>

        <p class="form-help" class:total-error={isTotalOver100}>
          Total: {totalPercentage}%
        </p>
      </div>

      <!-- Submit -->
      <div class="form-actions">
        <button
          class="btn btn-primary"
          on:click={handleCreateEscrow}
          disabled={creating || validBeneficiaries.length === 0 || totalPercentage !== 100}
          type="button"
        >
          {creating ? 'Creating Escrow...' : 'Create Escrow'}
        </button>
      </div>
    </div>
  </div>
</div>

{#if showToast}
  <Toast message={toastMessage} type={toastType} onClose={() => (showToast = false)} />
{/if}

<style>
  .container {
    max-width: 800px;
    margin: 0 auto;
  }

  h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
    color: var(--color-text);
  }

  .description {
    color: var(--color-text-secondary);
    margin-bottom: 2rem;
  }

  .card-content {
    padding: 2rem;
    overflow: visible;
  }

  .card {
    overflow: visible;
  }

  .form-group {
    margin-bottom: var(--spacing-xl);
    overflow: visible;
  }

  .form-group:last-of-type {
    margin-bottom: 0;
  }

  .form-help {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .beneficiaries-table-wrapper {
    margin-top: 1rem;
    margin-bottom: 1rem;
    position: relative;
  }

  .beneficiaries-table {
    width: 100%;
    border-collapse: collapse;
    background: transparent;
  }

  .beneficiaries-table thead {
    background: transparent;
  }

  .beneficiaries-table th {
    padding: 0;
    padding-bottom: 0.5rem;
    text-align: left;
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--color-text);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
    position: relative;
    vertical-align: bottom;
    border-bottom: 1px solid var(--color-border);
  }

  .beneficiaries-table th:last-child {
    width: 3rem;
    text-align: center;
  }

  .beneficiaries-table tbody tr {
    background: transparent;
    border: none;
  }

  .beneficiaries-table tbody tr:hover {
    background: transparent;
  }

  .beneficiaries-table td {
    padding: 0;
    padding-top: 0.75rem;
    vertical-align: middle;
  }

  .beneficiaries-table td:last-child {
    text-align: center;
  }

  .btn-remove-row {
    width: 2rem;
    height: 2rem;
    padding: 0;
    background-color: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 1.25rem;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .btn-remove-row:hover {
    background-color: var(--color-danger-bg);
    border-color: var(--color-danger);
    color: var(--color-danger);
  }

  .total-error {
    color: var(--color-danger);
    font-weight: 600;
  }

  .info-icon-container {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 0.5rem;
    vertical-align: middle;
  }

  .beneficiaries-table th .info-icon-container {
    margin-left: 0.25rem;
  }

  .info-icon {
    cursor: help;
    color: var(--color-text-muted);
    transition: color 0.2s;
    flex-shrink: 0;
  }

  .info-icon:hover {
    color: var(--color-primary);
  }

  .info-tooltip {
    position: fixed;
    transform: translate(-50%, -100%);
    margin-top: -0.75rem;
    background: var(--color-background-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 0.75rem 1rem;
    box-shadow: var(--shadow-lg);
    min-width: 280px;
    max-width: 320px;
    z-index: 10000;
    pointer-events: none;
    white-space: normal;
  }

  .info-tooltip::before {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--color-border);
    margin-top: -1px;
  }

  .info-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--color-background-card);
  }

  .info-tooltip p {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    color: var(--color-text);
    line-height: 1.5;
  }

  .info-tooltip p:last-child {
    margin-bottom: 0;
  }

  .info-tooltip strong {
    color: var(--color-primary);
    font-weight: 600;
  }

  .btn.btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: var(--color-background-light);
    border-color: var(--color-border);
    color: var(--color-text-muted);
  }

  .btn.btn-secondary:disabled:hover {
    background-color: var(--color-background-light);
    border-color: var(--color-border);
    color: var(--color-text-muted);
  }

  .form-actions {
    margin-top: var(--spacing-xl);
    padding-top: var(--spacing-xl);
    border-top: 1px solid var(--color-border);
  }

  .form-actions .btn {
    width: 100%;
    font-size: 1.125rem;
    padding: 1rem 1.5rem;
  }

  @media (max-width: 640px) {
    .card-content {
      padding: 1.5rem;
    }

    .form-group {
      margin-bottom: var(--spacing-lg);
    }
  }
</style>
