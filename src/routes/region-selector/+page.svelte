<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { getCurrentWindow } from '@tauri-apps/api/window';

  let screenshot = $state<string | null>(null);
  let imageLoaded = $state(false);
  let img: HTMLImageElement;

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

  onMount(() => {
    let unlisten: (() => void) | undefined;

    // Listen for the screenshot from the backend
    listen<string>('screenshot-ready', (event) => {
      screenshot = event.payload;
      // Preload the image
      img = new Image();
      img.onload = () => {
        imageLoaded = true;
      };
      img.src = `data:image/png;base64,${event.payload}`;
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  });

  function handleMouseDown(e: MouseEvent) {
    if (!imageLoaded) return;
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

    // Crop the screenshot on the frontend
    await cropAndReturn();
  }

  async function cropAndReturn() {
    if (!img || !imageLoaded) return;

    // Calculate scale factor between displayed image and actual image
    const scaleX = img.naturalWidth / window.innerWidth;
    const scaleY = img.naturalHeight / window.innerHeight;

    // Convert screen coordinates to image coordinates
    const cropX = Math.round(selectionLeft * scaleX);
    const cropY = Math.round(selectionTop * scaleY);
    const cropWidth = Math.round(selectionWidth * scaleX);
    const cropHeight = Math.round(selectionHeight * scaleY);

    // Create canvas for cropping
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    const ctx = cropCanvas.getContext('2d');

    if (!ctx) {
      console.error('Failed to get canvas context');
      await invoke('close_region_selector');
      return;
    }

    // Draw cropped region
    ctx.drawImage(
      img,
      cropX, cropY, cropWidth, cropHeight,
      0, 0, cropWidth, cropHeight
    );

    // Convert to base64 (remove data:image/png;base64, prefix)
    const dataUrl = cropCanvas.toDataURL('image/png');
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

    // Send the cropped image back to main window
    try {
      // Emit to main window and close this window
      const appWindow = getCurrentWindow();
      await appWindow.emit('region-captured-internal', base64);
      // The backend will handle closing this window and showing main
      await invoke('close_region_selector_with_result', { image: base64 });
    } catch (error) {
      console.error('Failed to send cropped image:', error);
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
  class="fixed inset-0 cursor-crosshair select-none bg-black"
  role="application"
  aria-label="Region selector"
  tabindex="-1"
  onmousedown={handleMouseDown}
  onmousemove={handleMouseMove}
  onmouseup={handleMouseUp}
  onmouseleave={handleMouseUp}
>
  <!-- Screenshot background -->
  {#if screenshot && imageLoaded}
    <img
      src="data:image/png;base64,{screenshot}"
      alt="Screenshot"
      class="w-full h-full object-cover pointer-events-none"
      draggable="false"
    />

    <!-- Dark overlay outside selection -->
    <div class="absolute inset-0 bg-black/40 pointer-events-none"></div>

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
          box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.4);
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
  {:else}
    <!-- Loading state -->
    <div class="w-full h-full flex items-center justify-center">
      <div class="text-white text-lg">Loading...</div>
    </div>
  {/if}

  <!-- Instructions -->
  <div class="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-sm pointer-events-none z-50">
    Drag to select region | Press ESC to cancel
  </div>
</div>

<style>
  :global(html), :global(body) {
    margin: 0;
    padding: 0;
    background: black !important;
    overflow: hidden;
  }
</style>
