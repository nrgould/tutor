<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';

  interface Props {
    disabled?: boolean;
    onsubmit: (message: string, screenshot?: string) => void;
  }

  let { disabled = false, onsubmit }: Props = $props();

  let inputValue = $state('');
  let pendingScreenshot = $state<string | null>(null);
  let isCapturing = $state(false);

  async function captureScreen() {
    if (isCapturing) return;

    isCapturing = true;
    try {
      const screenshot = await invoke<string>('capture_screen');
      pendingScreenshot = screenshot;
    } catch (error) {
      console.error('Failed to capture screen:', error);
    } finally {
      isCapturing = false;
    }
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
</script>

<div class="border-t border-[var(--gray-3)] bg-[var(--gray-1)]/80 backdrop-blur-xl px-4 py-4">
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
      <!-- Screenshot button -->
      <button
        class="flex-shrink-0 w-10 h-10 rounded-xl bg-[var(--gray-3)] border border-[var(--gray-4)] text-[var(--gray-10)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] hover:border-[var(--gray-5)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
        onclick={captureScreen}
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
