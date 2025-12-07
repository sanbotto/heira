<script lang="ts">
  import { theme, type Theme } from '$lib/stores/theme';
  import { onMount } from 'svelte';

  let currentTheme: Theme = 'auto';
  let isOpen = false;

  onMount(() => {
    const unsubscribe = theme.subscribe(value => {
      currentTheme = value;
    });
    return unsubscribe;
  });

  function handleThemeChange(newTheme: Theme) {
    theme.set(newTheme);
    isOpen = false;
  }

  function toggleDropdown() {
    isOpen = !isOpen;
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.theme-switcher')) {
      isOpen = false;
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="theme-switcher">
  <button
    class="theme-button"
    onclick={toggleDropdown}
    aria-label="Theme switcher"
    aria-expanded={isOpen}
  >
    <svg
      class="theme-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      {#if currentTheme === 'dark'}
        <!-- Moon icon for dark mode -->
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      {:else if currentTheme === 'light'}
        <!-- Sun icon for light mode -->
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      {:else}
        <!-- Auto icon (sun/moon combination) -->
        <circle cx="12" cy="12" r="5"></circle>
        <path
          d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        ></path>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" opacity="0.5"></path>
      {/if}
    </svg>
    <span class="theme-label"
      >{currentTheme === 'auto' ? 'Auto' : currentTheme === 'light' ? 'Light' : 'Dark'}</span
    >
  </button>

  {#if isOpen}
    <div class="theme-dropdown">
      <button
        class="theme-option"
        class:active={currentTheme === 'auto'}
        onclick={() => handleThemeChange('auto')}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="5"></circle>
          <path
            d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
          ></path>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" opacity="0.5"></path>
        </svg>
        <span>Auto</span>
      </button>
      <button
        class="theme-option"
        class:active={currentTheme === 'light'}
        onclick={() => handleThemeChange('light')}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
        <span>Light</span>
      </button>
      <button
        class="theme-option"
        class:active={currentTheme === 'dark'}
        onclick={() => handleThemeChange('dark')}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
        <span>Dark</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .theme-switcher {
    position: relative;
  }

  .theme-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.875rem;
    color: var(--color-text);
  }

  .theme-button:hover {
    background-color: var(--color-background-light);
    border-color: var(--color-primary);
  }

  .theme-icon {
    flex-shrink: 0;
  }

  .theme-label {
    font-weight: 500;
  }

  .theme-dropdown {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    background: var(--color-background-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    min-width: 140px;
    overflow: hidden;
    z-index: 1000;
  }

  .theme-option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background-color 0.2s;
    font-size: 0.875rem;
    color: var(--color-text);
    text-align: left;
  }

  .theme-option:hover {
    background-color: var(--color-background-light);
  }

  .theme-option.active {
    background-color: var(--color-primary);
    color: #000;
  }

  .theme-option.active svg {
    stroke: #000;
  }

  .theme-option svg {
    flex-shrink: 0;
  }
</style>
