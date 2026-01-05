<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';

  interface Props {
    disabled?: boolean;
    onsubmit: (message: string, screenshot?: string) => void;
  }

  let { disabled = false, onsubmit }: Props = $props();

  let inputValue = $state('');
  let pendingScreenshot = $state<string | null>(null);
  let isCapturing = $state(false);
  let showCaptureMenu = $state(false);

  async function captureFullScreen() {
    if (isCapturing) return;

    isCapturing = true;
    showCaptureMenu = false;
    try {
      const screenshot = await invoke<string>('capture_screen');
      pendingScreenshot = screenshot;
    } catch (error) {
      console.error('Failed to capture screen:', error);
    } finally {
      isCapturing = false;
    }
  }

  async function startRegionCapture() {
    if (isCapturing) return;

    isCapturing = true;
    showCaptureMenu = false;
    try {
      // Open the region selector window
      await invoke('open_region_selector');

      // Poll for the result - the region selector will store it when done
      const result = await pollForCaptureResult();
      if (result) {
        pendingScreenshot = result;
      }
    } catch (error) {
      console.error('Failed to capture region:', error);
    } finally {
      isCapturing = false;
    }
  }

  async function pollForCaptureResult(): Promise<string | null> {
    // Poll every 100ms for up to 30 seconds
    const maxAttempts = 300;
    const pollInterval = 100;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      try {
        const result = await invoke<string>('get_region_capture_result');
        // If we get a result, return it
        return result;
      } catch {
        // No result yet, keep polling
        // Check if the main window is visible (region selector closed/cancelled)
        try {
          const mainWindow = getCurrentWindow();
          const isVisible = await mainWindow.isVisible();
          if (isVisible && i > 5) {
            // Main window is visible and we've waited a bit - user likely cancelled
            return null;
          }
        } catch {
          // Ignore visibility check errors
        }
      }
    }

    return null;
  }

  function clearScreenshot() {
    pendingScreenshot = null;
  }

  function handleSubmit() {
    const message = inputValue.trim();
    if (!message && !pendingScreenshot) return;

    onsubmit(message, pendingScreenshot ?? undefined);
    inputValue = '';
    pendingScreenshot = null;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function toggleCaptureMenu() {
    showCaptureMenu = !showCaptureMenu;
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.capture-menu-container')) {
      showCaptureMenu = false;
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="chat-input-bg border-t border-[var(--gray-3)] bg-[var(--gray-1)]/80 backdrop-blur-xl px-4 py-4">
  <div class="max-w-3xl mx-auto">
    <!-- Screenshot preview -->
    {#if pendingScreenshot}
      <div class="mb-3 relative inline-block animate-fade-in">
        <div class="relative rounded-xl overflow-hidden border border-[var(--gray-4)]">
          <img
            src="data:image/png;base64,{pendingScreenshot}"
            alt="Screenshot preview"
            class="h-24 object-cover"
          />
        </div>
        <button
          class="absolute -top-2 -right-2 w-6 h-6 bg-[var(--gray-2)] border border-[var(--gray-4)] text-[var(--gray-11)] rounded-full flex items-center justify-center hover:bg-[var(--error)] hover:border-[var(--error)] hover:text-white transition-colors"
          onclick={clearScreenshot}
          aria-label="Remove screenshot"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    {/if}

    <!-- Input area -->
    <div class="flex items-center gap-3">
      <!-- Screenshot button with dropdown -->
      <div class="capture-menu-container relative">
        <button
          class="flex-shrink-0 w-10 h-10 rounded-xl bg-[var(--gray-3)] border border-[var(--gray-4)] text-[var(--gray-10)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] hover:border-[var(--gray-5)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          onclick={toggleCaptureMenu}
          disabled={disabled || isCapturing}
          title="Capture screen"
        >
          {#if isCapturing}
            <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          {:else}
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
          {/if}
        </button>

        <!-- Capture menu dropdown -->
        {#if showCaptureMenu}
          <div class="absolute bottom-full left-0 mb-2 w-48 bg-[var(--gray-2)] border border-[var(--gray-4)] rounded-xl shadow-xl overflow-hidden animate-fade-in">
            <button
              class="w-full px-4 py-3 text-left text-sm text-[var(--gray-12)] hover:bg-[var(--gray-3)] flex items-center gap-3 transition-colors"
              onclick={captureFullScreen}
            >
              <svg class="w-4 h-4 text-[var(--gray-10)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
              </svg>
              Full Screen
            </button>
            <button
              class="w-full px-4 py-3 text-left text-sm text-[var(--gray-12)] hover:bg-[var(--gray-3)] flex items-center gap-3 transition-colors border-t border-[var(--gray-3)]"
              onclick={startRegionCapture}
            >
              <svg class="w-4 h-4 text-[var(--gray-10)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5" />
              </svg>
              Select Region
            </button>
          </div>
        {/if}
      </div>

      <!-- Text input -->
      <div class="flex-1 relative">
        <textarea
          bind:value={inputValue}
          placeholder="Ask a question..."
          {disabled}
          rows="1"
          class="w-full px-4 py-3 text-sm rounded-xl bg-[var(--gray-2)] border border-[var(--gray-4)] text-[var(--gray-12)]
            placeholder:text-[var(--gray-8)] resize-none
            focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-muted)]
            disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          onkeydown={handleKeydown}
        ></textarea>
      </div>

      <!-- Send button -->
      <button
        class="flex-shrink-0 w-10 h-10 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
        onclick={handleSubmit}
        disabled={disabled || (!inputValue.trim() && !pendingScreenshot)}
        title="Send message"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
        </svg>
      </button>
    </div>
  </div>
</div>
