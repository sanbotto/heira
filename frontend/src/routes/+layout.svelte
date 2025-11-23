<script lang="ts">
  import '../app.css';
  import { theme } from '$lib/stores/theme';
  import { onMount } from 'svelte';
  import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
  import WalletConnect from '../components/WalletConnect.svelte';
  import { goto } from '$app/navigation';
  import RainbowKitAppWrapper from '../components/RainbowKitAppWrapper.svelte';

  import { syncRainbowKitWalletState } from '../lib/wallet-sync';

  let mobileMenuOpen = false;

  function toggleMobileMenu() {
    mobileMenuOpen = !mobileMenuOpen;
  }

  function closeMobileMenu() {
    mobileMenuOpen = false;
  }

  onMount(() => {
    theme.init();
    // Sync RainbowKit wallet state
    syncRainbowKitWalletState();
  });
</script>

<RainbowKitAppWrapper>
  <div class="app">
    <header>
      <nav>
        <div class="nav-brand">
          <a href="/" aria-label="Heira Home">
            <img src="/logo.png" alt="Heira Logo" class="logo-img" />
            <h1 class="logo">Heira</h1>
            <span class="beta-badge">BETA</span>
          </a>
        </div>
        <div class="nav-links">
          <a href="/dashboard" class="nav-link">Dashboard</a>
          <a href="/create" class="nav-link">Create Escrow</a>
          <a href="/escrows" class="nav-link">Manage Escrows</a>
        </div>
        <div class="nav-right">
          <ThemeSwitcher />
          <WalletConnect />
        </div>
        <button
          class="mobile-menu-button"
          on:click={toggleMobileMenu}
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {#if mobileMenuOpen}
              <path
                d="M18 6L6 18M6 6L18 18"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            {:else}
              <path
                d="M3 12H21M3 6H21M3 18H21"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            {/if}
          </svg>
        </button>
      </nav>
      {#if mobileMenuOpen}
        <div class="mobile-menu">
          <a href="/dashboard" class="mobile-nav-link" on:click={closeMobileMenu}>Dashboard</a>
          <a href="/create" class="mobile-nav-link" on:click={closeMobileMenu}>Create Escrow</a>
          <a href="/escrows" class="mobile-nav-link" on:click={closeMobileMenu}>Manage Escrows</a>
        </div>
      {/if}
    </header>

    <main>
      <slot />
    </main>
  </div>
</RainbowKitAppWrapper>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    background: var(--color-background-card);
    box-shadow: var(--shadow-sm);
    position: sticky;
    top: 0;
    z-index: 100;
    border-bottom: 1px solid var(--color-border);
  }

  nav {
    display: grid;
    grid-template-columns: 200px 1fr 300px;
    align-items: center;
    padding: 1rem 2rem;
    gap: 2rem;
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
  }

  .nav-brand {
    width: 200px;
  }

  .nav-brand a {
    display: flex;
    align-items: center;
    text-decoration: none;
    color: var(--color-text);
    gap: 0.5rem;
  }

  .logo-img {
    height: 2rem;
    width: auto;
    display: block;
  }

  .logo {
    font-size: 1.75rem;
    font-weight: 700;
    margin: 0;
    color: var(--color-primary);
  }

  .beta-badge {
    display: inline-block;
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.125rem 0.375rem;
    background-color: var(--color-primary);
    color: var(--color-btn-primary-text);
    border-radius: var(--radius-sm);
    margin-left: 0.1rem;
    margin-bottom: 1rem;
    line-height: 1.2;
  }

  .nav-links {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
  }

  .nav-link {
    text-decoration: none;
    color: var(--color-text);
    font-weight: 500;
    padding: 0.5rem 1rem;
    border-radius: var(--radius-sm);
    transition: background-color 0.15s;
  }

  .nav-link:hover {
    background-color: var(--color-background-light);
    color: var(--color-primary);
  }

  .nav-right {
    width: 300px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .mobile-menu-button {
    display: none;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
    color: var(--color-text);
    transition: color 0.15s;
  }

  .mobile-menu-button:hover {
    color: var(--color-primary);
  }

  .mobile-menu-button svg {
    display: block;
  }

  .mobile-menu {
    display: none;
    flex-direction: column;
    background: var(--color-background-card);
    border-top: 1px solid var(--color-border);
    padding: 1rem;
    gap: 0.5rem;
  }

  .mobile-nav-link {
    display: block;
    padding: 0.75rem 1rem;
    text-decoration: none;
    color: var(--color-text);
    font-weight: 500;
    border-radius: var(--radius-sm);
    transition: background-color 0.15s;
  }

  .mobile-nav-link:hover {
    background-color: var(--color-background-light);
    color: var(--color-primary);
  }

  @media (max-width: 879px) {
    nav {
      grid-template-columns: auto 1fr auto;
      padding: 1rem;
      gap: 1rem;
    }

    .nav-brand {
      width: auto;
    }

    .nav-links {
      display: none;
    }

    .nav-right {
      width: auto;
      justify-content: flex-end;
    }

    .mobile-menu-button {
      display: block;
    }

    .mobile-menu {
      display: flex;
    }
  }

  main {
    flex: 1;
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
  }
</style>
