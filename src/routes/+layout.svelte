<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { listen } from '@tauri-apps/api/event';
  import { overlayModeStore } from '$lib/stores/overlayMode';
  import Toast from '$lib/components/Toast.svelte';

  let { children } = $props();

  const isOverlayMode = $derived($overlayModeStore);

  onMount(() => {
    let unlisten: (() => void) | undefined;

    // Load overlay mode setting
    overlayModeStore.load();

    // Listen for navigation events from the tray menu
    listen<string>('navigate', (event) => {
      goto(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  });
</script>

<svelte:head>
  <link rel="preconnect" href="https://api.fontshare.com">
  <link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap" rel="stylesheet">
</svelte:head>

<div class="h-screen flex flex-col overflow-hidden {isOverlayMode ? 'overlay-mode' : ''}">
  {@render children()}
</div>

<Toast />
