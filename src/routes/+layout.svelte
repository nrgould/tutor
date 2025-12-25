<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { listen } from '@tauri-apps/api/event';
  import { getCurrentWindow } from '@tauri-apps/api/window';

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

  async function minimizeWindow() {
    const window = getCurrentWindow();
    await window.hide();
  }

  async function closeWindow() {
    const window = getCurrentWindow();
    await window.hide();
  }
</script>

<div class="h-screen flex flex-col bg-[var(--gray-1)] rounded-xl overflow-hidden border border-[var(--gray-4)]">
  <!-- Custom Title Bar -->
  <div
    data-tauri-drag-region
    class="h-10 flex items-center justify-between px-3 bg-[var(--gray-2)] border-b border-[var(--gray-4)] flex-shrink-0"
  >
    <!-- App Title -->
    <div class="flex items-center gap-2" data-tauri-drag-region>
      <div class="w-6 h-6 rounded-lg bg-[var(--accent)] flex items-center justify-center">
        <span class="text-white font-bold text-xs">E</span>
      </div>
      <span class="text-sm font-semibold text-[var(--gray-11)]" data-tauri-drag-region>Eigen</span>
    </div>

    <!-- Window Controls -->
    <div class="flex items-center gap-1">
      <button
        onclick={minimizeWindow}
        class="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
        title="Minimize to tray"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12h-15" />
        </svg>
      </button>
      <button
        onclick={closeWindow}
        class="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--gray-9)] hover:text-white hover:bg-[var(--error)] transition-colors"
        title="Close"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Content Area -->
  <div class="flex-1 overflow-hidden">
    {@render children()}
  </div>
</div>
