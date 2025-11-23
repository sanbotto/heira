<script lang="ts">
  import { theme } from '$lib/stores/theme';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  function getEffectiveTheme(currentTheme: string) {
    if (!browser) return 'light';
    if (currentTheme === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return currentTheme;
  }

  $: isDark = getEffectiveTheme($theme) === 'dark';

  onMount(() => {
    // Listen for system theme changes when in auto mode
    if (browser) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        // Trigger reactivity by accessing $theme
        isDark = getEffectiveTheme($theme) === 'dark';
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  });
</script>

<div class="container">
  <h1>Welcome to Heira</h1>
  <p class="description">Automated and permissionless Web3 inheritance management.</p>

  <div class="beta-disclaimer">
    ⚠️ This application is currently in <strong>beta</strong>. Please use with caution, only with
    amounts you're comfortable losing and only connect disposable wallets. Lastly, use only
    <strong>testnets</strong>! ⚠️
  </div>

  <div class="card">
    <div class="card-content">
      <section class="section">
        <h2>What is Heira?</h2>
        <p>
          Heira is a Web3 application that helps you manage your cryptocurrency inheritance through
          smart contract escrows. Instead of worrying about what happens to your digital assets if
          something happens to you, you can set up an escrow contract that automatically transfers
          your tokens to designated beneficiaries after a period of inactivity.
        </p>
        <p>
          Whether you want to ensure your family receives your crypto assets, or you're planning for
          the long-term distribution of your digital wealth, Heira provides a trustless, automated
          solution that works entirely on the blockchain.
        </p>
      </section>

      <section class="section">
        <h2>How It Works</h2>
        <p>Setting up an inheritance escrow is simple:</p>
        <ol class="steps-list">
          <li>
            <strong>Create an Escrow:</strong> Specify your beneficiaries, their percentage shares, and
            an inactivity period (e.g., 90 days).
          </li>
          <li>
            <strong>Monitor Activity:</strong> The escrow contract monitors your main wallet for transactions.
            As long as you're active, nothing happens.
          </li>
          <li>
            <strong>Automatic Execution:</strong> After the inactivity period passes without any transactions
            from your wallet, anyone can trigger the escrow to execute with the conditions set by you.
          </li>
          <li>
            <strong>Distribution:</strong> Your assets are automatically distributed to your beneficiaries
            according to your specified percentages, across multiple blockchain networks if needed.
          </li>
        </ol>
        <p>
          You maintain full control while you're active. You can also deactivate the escrow at any
          time if you so choose. The escrow only executes if you've been inactive for the full
          period.
        </p>
      </section>

      <section class="section">
        <h2>Your funds are safe with Heira</h2>
        <div class="safety-grid">
          <div class="safety-item">
            <h3>Smart Contract Security</h3>
            <p>
              Heira uses battle-tested OpenZeppelin contracts with security features like reentrancy
              protection. The code is immutable once deployed, meaning it can't be changed or
              manipulated by anyone.
            </p>
          </div>
          <div class="safety-item">
            <h3>You Stay in Control</h3>
            <p>
              As long as you're active, you maintain full control over your assets. The escrow only
              executes after verified inactivity, giving you complete peace of mind. You can also
              deactivate the escrow at any time if you so choose.
            </p>
          </div>
          <div class="safety-item">
            <h3>Transparent & Verifiable</h3>
            <p>
              All escrow contracts are deployed on public blockchains where anyone can verify the
              code and conditions. There's no hidden logic nor third parties. Our code is 100% open
              source.
            </p>
          </div>
          <div class="safety-item">
            <h3>Permissionless Execution</h3>
            <p>
              Once conditions are met, anyone can trigger the escrow execution. This ensures your
              beneficiaries can receive their inheritance even if they're not technical. In any
              case, we have a network of keepers making sure that all escrows are executed in time.
            </p>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Get Started</h2>
        <p>
          Ready to set up your inheritance escrow? Connect your wallet and create your first escrow
          contract in just a few minutes.
        </p>
        <div class="cta-buttons">
          <a href="/create" class="btn btn-primary">Create Escrow</a>
          <a href="/dashboard" class="btn btn-secondary">View Dashboard</a>
        </div>
      </section>
    </div>
  </div>
</div>

<section class="powered-by">
  <h2 class="powered-by-title">Powered by</h2>
  <div class="powered-by-logos">
    <div class="logo-item">
      <img src={isDark ? '/hardhat-logo-dark.svg' : '/hardhat-logo.svg'} alt="Hardhat" class="logo-img" />
    </div>
    <div class="logo-item">
      <img src={isDark ? '/the-graph-dark.svg' : '/the-graph.svg'} alt="The Graph" class="logo-img" />
    </div>
    <div class="logo-item">
      <img src={isDark ? '/ledger-dark.svg' : '/ledger.svg'} alt="Ledger" class="logo-img" />
    </div>
    <div class="logo-item">
      <img src={isDark ? '/ens-dark.svg' : '/ens.svg'} alt="ENS" class="logo-img" />
    </div>
    <div class="logo-item">
      <img src={isDark ? '/citrea-dark.svg' : '/citrea.svg'} alt="Citrea" class="logo-img" />
    </div>
    <div class="logo-item">
      <img src="/filecoin.svg" alt="Filecoin" class="logo-img" />
    </div>
    <div class="logo-item">
      <img src={isDark ? '/fluence-dark.svg' : '/fluence.svg'} alt="Fluence" class="logo-img" />
    </div>
    <div class="logo-item">
      <img src={isDark ? '/nethermind-dark.svg' : '/nethermind.svg'} alt="Nethermind" class="logo-img" />
    </div>
    <div class="logo-item">
      <img src={isDark ? '/keeperhub-dark.svg' : '/keeperhub.svg'} alt="KeeperHub" class="logo-img" />
    </div>
  </div>
</section>

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
    font-size: 1.125rem;
  }

  .beta-disclaimer {
    background-color: var(--color-background-light);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm);
    padding: 1rem 1.5rem;
    margin-bottom: 2rem;
    color: var(--color-text);
    font-size: 0.9375rem;
    line-height: 1.6;
  }

  .beta-disclaimer strong {
    color: var(--color-primary);
    font-weight: 600;
  }

  .card {
    background: var(--color-background-card);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    border: 1px solid var(--color-border);
  }

  .card-content {
    padding: 2rem;
  }

  .section {
    margin-bottom: 2.5rem;
  }

  .section:last-of-type {
    margin-bottom: 0;
  }

  h2 {
    font-size: 1.5rem;
    margin-bottom: 1rem;
    color: var(--color-text);
    font-weight: 600;
  }

  h3 {
    font-size: 1.125rem;
    margin-bottom: 0.5rem;
    color: var(--color-text);
    font-weight: 600;
  }

  p {
    color: var(--color-text);
    line-height: 1.7;
    margin-bottom: 1rem;
  }

  p:last-child {
    margin-bottom: 0;
  }

  .steps-list {
    margin: 1rem 0;
    padding-left: 1.5rem;
    color: var(--color-text);
  }

  .steps-list li {
    margin-bottom: 1rem;
    line-height: 1.7;
  }

  .steps-list li:last-child {
    margin-bottom: 0;
  }

  .steps-list strong {
    color: var(--color-primary);
    font-weight: 600;
  }

  .safety-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-top: 1.5rem;
  }

  .safety-item {
    padding: 1.5rem;
    background: var(--color-background-light);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
  }

  .safety-item h3 {
    margin-top: 0;
  }

  .safety-item p {
    margin-bottom: 0;
    font-size: 0.9375rem;
  }

  .cta-buttons {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
    flex-wrap: wrap;
  }

  .btn {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    border-radius: var(--radius-sm);
    text-decoration: none;
    font-weight: 500;
    transition: all 0.2s;
    border: none;
    cursor: pointer;
    font-size: 1rem;
  }

  .btn-primary {
    background-color: var(--color-primary);
    color: var(--color-btn-primary-text);
  }

  .btn-primary:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .btn-secondary {
    background-color: var(--color-background-light);
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }

  .btn-secondary:hover {
    background-color: var(--color-background);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  @media (max-width: 640px) {
    .card-content {
      padding: 1.5rem;
    }

    .section {
      margin-bottom: 2rem;
    }

    .safety-grid {
      grid-template-columns: 1fr;
    }

    .cta-buttons {
      flex-direction: column;
    }

    .btn {
      width: 100%;
      text-align: center;
    }
  }

  .powered-by {
    max-width: 1000px;
    margin: 4rem auto 2rem;
    padding: 0 2rem;
  }

  .powered-by-title {
    text-align: center;
    font-size: 1.5rem;
    margin-bottom: 2rem;
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .powered-by-logos {
    display: flex;
    flex-wrap: wrap;
    gap: 3rem;
    align-items: center;
    justify-content: center;
  }

  .logo-item {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 60px;
    min-width: 140px;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .logo-item:hover {
    opacity: 1;
  }

  .logo-img {
    max-width: 100%;
    max-height: 60px;
    width: auto;
    height: auto;
    object-fit: contain;
  }

  @media (max-width: 640px) {
    .powered-by {
      margin: 3rem auto 2rem;
      padding: 0 1rem;
    }

    .powered-by-logos {
      gap: 2rem;
    }

    .logo-item {
      height: 50px;
      min-width: 100px;
    }

    .logo-img {
      max-height: 50px;
    }
  }
</style>
