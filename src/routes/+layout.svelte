<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { listen } from '@tauri-apps/api/event';

  let { children } = $props();

  onMount(() => {
    let unlisten: (() => void) | undefined;

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

<div class="h-screen flex flex-col bg-[var(--gray-1)] overflow-hidden">
  {@render children()}
</div>
