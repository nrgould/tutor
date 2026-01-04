<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';

  let isSelecting = $state(false);
  let startX = $state(0);
  let startY = $state(0);
  let currentX = $state(0);
  let currentY = $state(0);

  // Selection box dimensions
  let selectionLeft = $derived(Math.min(startX, currentX));
  let selectionTop = $derived(Math.min(startY, currentY));
  let selectionWidth = $derived(Math.abs(currentX - startX));
  let selectionHeight = $derived(Math.abs(currentY - startY));

  function handleMouseDown(e: MouseEvent) {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    currentX = e.clientX;
    currentY = e.clientY;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isSelecting) return;
    currentX = e.clientX;
    currentY = e.clientY;
  }

  async function handleMouseUp() {
    if (!isSelecting) return;
    isSelecting = false;

    // Minimum selection size
    if (selectionWidth < 10 || selectionHeight < 10) {
      return;
    }

    // Send the region bounds to Rust for capture
    try {
      await invoke('region_selected', {
        bounds: {
          x: Math.round(selectionLeft),
          y: Math.round(selectionTop),
          width: Math.round(selectionWidth),
          height: Math.round(selectionHeight),
        },
      });
    } catch (error) {
      console.error('Failed to capture region:', error);
      // Close the selector on error
      await invoke('close_region_selector');
    }
  }

  async function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      try {
        await invoke('close_region_selector');
      } catch (error) {
        console.error('Failed to close region selector:', error);
      }
    }
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div
  class="fixed inset-0 cursor-crosshair select-none"
  role="application"
  aria-label="Region selector"
  tabindex="-1"
  style="background: rgba(0, 0, 0, 0.3);"
  onmousedown={handleMouseDown}
  onmousemove={handleMouseMove}
  onmouseup={handleMouseUp}
  onmouseleave={handleMouseUp}
>
  <!-- Selection box (cut out from overlay) -->
  {#if isSelecting || (selectionWidth > 0 && selectionHeight > 0)}
    <div
      class="absolute border-2 border-white pointer-events-none"
      style="
        left: {selectionLeft}px;
        top: {selectionTop}px;
        width: {selectionWidth}px;
        height: {selectionHeight}px;
        background: transparent;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.3);
      "
    >
      <!-- Corner handles -->
      <div class="absolute -top-1 -left-1 w-3 h-3 bg-white rounded-sm"></div>
      <div class="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-sm"></div>
      <div class="absolute -bottom-1 -left-1 w-3 h-3 bg-white rounded-sm"></div>
      <div class="absolute -bottom-1 -right-1 w-3 h-3 bg-white rounded-sm"></div>

      <!-- Dimensions label -->
      {#if selectionWidth > 50 && selectionHeight > 30}
        <div class="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
          {Math.round(selectionWidth)} x {Math.round(selectionHeight)}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Instructions -->
  <div class="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-sm pointer-events-none">
    Drag to select region | Press ESC to cancel
  </div>
</div>

<style>
  :global(html), :global(body) {
    margin: 0;
    padding: 0;
    background: transparent !important;
    overflow: hidden;
  }
</style>
