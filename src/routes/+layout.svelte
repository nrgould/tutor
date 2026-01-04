<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { listen } from '@tauri-apps/api/event';
  import { overlayModeStore } from '$lib/stores/overlayMode';

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

<div class="h-screen flex flex-col overflow-hidden {isOverlayMode ? 'overlay-mode' : 'bg-[var(--gray-1)]'}">
  {@render children()}
</div>
