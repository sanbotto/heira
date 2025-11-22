<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createRoot } from 'react-dom/client';
  import React from 'react';
  import { RainbowKitApp } from '../lib/RainbowKitApp.js';

  let providerRoot: ReturnType<typeof createRoot> | null = null;
  let providerElement: HTMLDivElement | null = null;
  const connectButtonTargetId = 'rainbowkit-connect-button-container';

  onMount(() => {
    // Create a container for the provider at document root
    // This renders both provider and ConnectButton (via portal) in same React tree
    if (typeof document !== 'undefined') {
      providerElement = document.createElement('div');
      providerElement.id = 'rainbowkit-provider-root';
      document.body.appendChild(providerElement);

      providerRoot = createRoot(providerElement);
      // Render RainbowKitApp which includes provider and ConnectButton portal
      providerRoot.render(React.createElement(RainbowKitApp, { connectButtonTargetId }));
    }
  });

  onDestroy(() => {
    if (providerRoot) {
      providerRoot.unmount();
      providerRoot = null;
    }
    if (providerElement && providerElement.parentNode) {
      providerElement.parentNode.removeChild(providerElement);
    }
  });
</script>

<slot />
