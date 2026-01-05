<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';

  let screenshot = $state<string | null>(null);
  let imageLoaded = $state(false);
  let img: HTMLImageElement;

  let isSelecting = $state(false);
  let hasSelection = $state(false);
  let startX = $state(0);
  let startY = $state(0);
  let currentX = $state(0);
  let currentY = $state(0);

  // Selection box dimensions
  let selectionLeft = $derived(Math.min(startX, currentX));
  let selectionTop = $derived(Math.min(startY, currentY));
  let selectionWidth = $derived(Math.abs(currentX - startX));
  let selectionHeight = $derived(Math.abs(currentY - startY));

  onMount(async () => {
    // Fetch the screenshot that was captured before this window opened
    try {
      const data = await invoke<string>('get_pending_screenshot');
      screenshot = data;
      // Preload the image
      img = new Image();
      img.onload = () => {
        imageLoaded = true;
      };
      img.src = `data:image/png;base64,${data}`;
    } catch (error) {
      console.error('Failed to get screenshot:', error);
      // Close the selector if we can't get the screenshot
      await invoke('close_region_selector');
    }
  });

  function handleMouseDown(e: MouseEvent) {
    if (!imageLoaded) return;
    isSelecting = true;
    hasSelection = true;
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
      hasSelection = false;
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
  class="region-selector-container"
  role="application"
  aria-label="Region selector"
  tabindex="-1"
  onmousedown={handleMouseDown}
  onmousemove={handleMouseMove}
  onmouseup={handleMouseUp}
  onmouseleave={handleMouseUp}
>
  {#if screenshot && imageLoaded}
    <!-- Screenshot as background image for better performance -->
    <div
      class="screenshot-bg"
      style="background-image: url('data:image/png;base64,{screenshot}');"
    ></div>

    <!-- Dark overlay - only shown when NO selection is active -->
    {#if !hasSelection}
      <div class="dark-overlay"></div>
    {/if}

    <!-- Selection box with cutout effect -->
    {#if hasSelection && (selectionWidth > 0 || selectionHeight > 0)}
      <div
        class="selection-box"
        style="
          left: {selectionLeft}px;
          top: {selectionTop}px;
          width: {selectionWidth}px;
          height: {selectionHeight}px;
        "
      >
        <!-- Corner handles -->
        <div class="handle handle-tl"></div>
        <div class="handle handle-tr"></div>
        <div class="handle handle-bl"></div>
        <div class="handle handle-br"></div>

        <!-- Dimensions label -->
        {#if selectionWidth > 60 && selectionHeight > 40}
          <div class="dimensions-label">
            {Math.round(selectionWidth)} × {Math.round(selectionHeight)}
          </div>
        {/if}
      </div>
    {/if}
  {:else}
    <!-- Loading state -->
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <div class="loading-text">Preparing screen capture...</div>
    </div>
  {/if}

  <!-- Instructions -->
  <div class="instructions">
    Click and drag to select a region · Press ESC to cancel
  </div>
</div>

<style>
  :global(html), :global(body) {
    margin: 0;
    padding: 0;
    background: #000 !important;
    overflow: hidden;
    width: 100vw;
    height: 100vh;
  }

  .region-selector-container {
    position: fixed;
    inset: 0;
    cursor: crosshair;
    user-select: none;
    background: #000;
  }

  .screenshot-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    pointer-events: none;
  }

  .dark-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    pointer-events: none;
  }

  .selection-box {
    position: absolute;
    border: 2px solid #fff;
    background: transparent;
    pointer-events: none;
    /* This creates the "cutout" effect - dark overlay everywhere EXCEPT inside the box */
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
  }

  .handle {
    position: absolute;
    width: 8px;
    height: 8px;
    background: #fff;
    border-radius: 2px;
  }

  .handle-tl { top: -4px; left: -4px; }
  .handle-tr { top: -4px; right: -4px; }
  .handle-bl { bottom: -4px; left: -4px; }
  .handle-br { bottom: -4px; right: -4px; }

  .dimensions-label {
    position: absolute;
    top: 8px;
    left: 8px;
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    font-size: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: 500;
  }

  .instructions {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    font-size: 13px;
    font-family: system-ui, -apple-system, sans-serif;
    padding: 10px 20px;
    border-radius: 8px;
    pointer-events: none;
    z-index: 100;
    white-space: nowrap;
  }

  .loading-state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .loading-text {
    color: #fff;
    font-size: 14px;
    font-family: system-ui, -apple-system, sans-serif;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
