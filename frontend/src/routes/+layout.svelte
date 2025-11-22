<script lang="ts">
  import '../app.css';
  import { theme } from '$lib/stores/theme';
  import { onMount } from 'svelte';
  import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
  import WalletConnect from '../components/WalletConnect.svelte';
  import { goto } from '$app/navigation';
  import { initializeWallet } from '$lib/wallet';

  onMount(() => {
    theme.init();
    // Initialize wallet connection and restore if previously connected
    initializeWallet();
  });
</script>

<div class="app">
  <header>
    <nav>
      <div class="nav-brand">
        <a href="/" aria-label="Heira Home">
          <h1 class="logo">Heira</h1>
        </a>
      </div>
      <div class="nav-links">
        <a href="/" class="nav-link">Dashboard</a>
        <a href="/create" class="nav-link">Create Escrow</a>
      </div>
      <div class="nav-right">
        <ThemeSwitcher />
        <WalletConnect />
      </div>
    </nav>
  </header>

  <main>
    <slot />
  </main>
</div>

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
  }

  .logo {
    font-size: 1.75rem;
    font-weight: 700;
    margin: 0;
    color: var(--color-primary);
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
  }

  main {
    flex: 1;
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
  }
</style>
