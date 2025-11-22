<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let message: string;
  export let type: 'error' | 'success' | 'info' = 'error';
  export let duration: number = 5000; // Auto-dismiss after 5 seconds
  export let onClose: (() => void) | null = null;

  let visible = false;
  let dismissTimeout: ReturnType<typeof setTimeout> | null = null;
  let isHovered = false;
  let startTime = Date.now();
  let remainingTime = duration;

  function startDismissTimer() {
    if (duration <= 0 || isHovered) return;

    // Clear any existing timeout
    if (dismissTimeout) {
      clearTimeout(dismissTimeout);
    }

    dismissTimeout = setTimeout(() => {
      visible = false;
      setTimeout(() => onClose?.(), 300); // Wait for fade-out animation
    }, remainingTime);
  }

  function handleMouseEnter() {
    isHovered = true;
    if (dismissTimeout) {
      clearTimeout(dismissTimeout);
      dismissTimeout = null;
      // Calculate remaining time
      const elapsed = Date.now() - startTime;
      remainingTime = Math.max(0, remainingTime - elapsed);
    }
  }

  function handleMouseLeave() {
    isHovered = false;
    startTime = Date.now();
    startDismissTimer();
  }

  onMount(() => {
    // Trigger animation
    setTimeout(() => (visible = true), 10);

    // Start auto-dismiss timer
    if (duration > 0) {
      remainingTime = duration;
      startTime = Date.now();
      startDismissTimer();
    }
  });

  onDestroy(() => {
    if (dismissTimeout) {
      clearTimeout(dismissTimeout);
    }
  });

  function handleClose() {
    visible = false;
    if (dismissTimeout) {
      clearTimeout(dismissTimeout);
    }
    setTimeout(() => onClose?.(), 300);
  }
</script>

<div
  class="toast"
  class:visible
  class:error={type === 'error'}
  class:success={type === 'success'}
  class:info={type === 'info'}
  on:mouseenter={handleMouseEnter}
  on:mouseleave={handleMouseLeave}
>
  <div class="toast-content">
    <span class="toast-message">{message}</span>
    <button class="toast-close" on:click={handleClose} aria-label="Close">×</button>
  </div>
</div>

<style>
  .toast {
    position: fixed;
    bottom: 1.5rem;
    left: 1.5rem;
    min-width: 300px;
    max-width: 500px;
    background: var(--color-background-card);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: 1rem 1.25rem;
    z-index: 2000;
    opacity: 0;
    transform: translateY(20px);
    transition:
      opacity 0.3s ease,
      transform 0.3s ease;
    pointer-events: none;
    border: 1px solid var(--color-border);
  }

  .toast.visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .toast.error {
    border-left: 4px solid var(--color-danger);
  }

  .toast.success {
    border-left: 4px solid var(--color-success);
  }

  .toast.info {
    border-left: 4px solid var(--color-primary);
  }

  .toast-content {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0; /* Allows flex item to shrink below content size */
  }

  .toast-message {
    color: var(--color-text);
    font-size: 0.95rem;
    line-height: 1.5;
    flex: 1;
    overflow-wrap: break-word;
    word-wrap: break-word;
    word-break: break-word;
    min-width: 0; /* Allows text to wrap properly */
  }

  .toast-close {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
    flex-shrink: 0;
  }

  .toast-close:hover {
    color: var(--color-text);
  }
</style>
