<script lang="ts">
  interface Props {
    screenshot: string;
    onselect: (croppedImage: string) => void;
    oncancel: () => void;
  }

  let { screenshot, onselect, oncancel }: Props = $props();

  let canvas: HTMLCanvasElement;
  let isSelecting = $state(false);
  let startX = $state(0);
  let startY = $state(0);
  let currentX = $state(0);
  let currentY = $state(0);
  let imageLoaded = $state(false);
  let img: HTMLImageElement;

  // Selection box dimensions
  let selectionLeft = $derived(Math.min(startX, currentX));
  let selectionTop = $derived(Math.min(startY, currentY));
  let selectionWidth = $derived(Math.abs(currentX - startX));
  let selectionHeight = $derived(Math.abs(currentY - startY));

  $effect(() => {
    // Load image when component mounts
    img = new Image();
    img.onload = () => {
      imageLoaded = true;
    };
    img.src = `data:image/png;base64,${screenshot}`;
  });

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

  function handleMouseUp() {
    if (!isSelecting) return;
    isSelecting = false;

    // Minimum selection size
    if (selectionWidth < 10 || selectionHeight < 10) {
      return;
    }

    cropAndReturn();
  }

  function cropAndReturn() {
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
      oncancel();
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

    onselect(base64);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      oncancel();
    }
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div
  class="fixed inset-0 z-[9999] cursor-crosshair select-none"
  role="application"
  aria-label="Region selector"
  tabindex="-1"
  onmousedown={handleMouseDown}
  onmousemove={handleMouseMove}
  onmouseup={handleMouseUp}
  onmouseleave={handleMouseUp}
>
  <!-- Screenshot background -->
  {#if imageLoaded}
    <img
      src="data:image/png;base64,{screenshot}"
      alt="Screenshot"
      class="w-full h-full object-cover pointer-events-none"
      draggable="false"
    />
  {:else}
    <div class="w-full h-full bg-black flex items-center justify-center">
      <div class="text-white text-lg">Loading...</div>
    </div>
  {/if}

  <!-- Dark overlay outside selection -->
  <div class="absolute inset-0 bg-black/50 pointer-events-none" />

  <!-- Selection box (cut out from overlay) -->
  {#if isSelecting || (selectionWidth > 0 && selectionHeight > 0)}
    <!-- Clear area for selection -->
    <div
      class="absolute border-2 border-white shadow-lg pointer-events-none"
      style="
        left: {selectionLeft}px;
        top: {selectionTop}px;
        width: {selectionWidth}px;
        height: {selectionHeight}px;
        background: transparent;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
      "
    >
      <!-- Corner handles -->
      <div class="absolute -top-1 -left-1 w-3 h-3 bg-white rounded-sm" />
      <div class="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-sm" />
      <div class="absolute -bottom-1 -left-1 w-3 h-3 bg-white rounded-sm" />
      <div class="absolute -bottom-1 -right-1 w-3 h-3 bg-white rounded-sm" />

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
