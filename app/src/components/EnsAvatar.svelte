<script lang="ts">
  import { onMount } from 'svelte';
  import type { Address } from 'viem';
  import { getEnsAvatar, getEnsName, getEnsAvatarByName } from '../lib/ens';

  export let address: Address | string;
  export let size: number = 40;

  let avatarUrl: string | null = null;
  let ensName: string | null = null;

  onMount(async () => {
    if (typeof address === 'string' && address.endsWith('.eth')) {
      // It's an ENS name
      avatarUrl = await getEnsAvatarByName(address);
      ensName = address;
    } else {
      // It's an address
      const addr = address as Address;
      avatarUrl = await getEnsAvatar(addr);
      ensName = await getEnsName(addr);
    }
  });
</script>

<div class="ens-avatar" style="width: {size * 2}px; height: {size * 2}px;">
  {#if avatarUrl}
    <img src={avatarUrl} alt={ensName || address} />
  {/if}
</div>

<style>
  .ens-avatar {
    border-radius: 50%;
    background-color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }

  .ens-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }
</style>
