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

<div class="border-t border-tutor-border bg-tutor-bg p-3">
  <!-- Screenshot preview -->
  {#if pendingScreenshot}
    <div class="mb-2 relative inline-block">
      <img
        src="data:image/png;base64,{pendingScreenshot}"
        alt="Screenshot preview"
        class="h-16 rounded border border-tutor-border"
      />
      <button
        class="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
        onclick={clearScreenshot}
        aria-label="Remove screenshot"
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  {/if}

  <!-- Input area -->
  <div class="flex items-end gap-2">
    <!-- Screenshot button -->
    <button
      class="flex-shrink-0 p-2 rounded-lg text-tutor-text-secondary hover:text-tutor-text hover:bg-tutor-surface transition-colors disabled:opacity-50"
      onclick={captureScreen}
      disabled={disabled || isCapturing}
      title="Capture screen (Ctrl+Shift+S)"
    >
      {#if isCapturing}
        <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      {:else}
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      {/if}
    </button>

    <!-- Text input -->
    <div class="flex-1">
      <textarea
        bind:value={inputValue}
        placeholder="Ask about your screen..."
        {disabled}
        rows="1"
        class="w-full px-3 py-2 text-sm rounded-lg border border-tutor-border bg-tutor-surface text-tutor-text
          placeholder:text-tutor-text-secondary resize-none
          focus:outline-none focus:ring-2 focus:ring-tutor-accent focus:border-transparent
          disabled:opacity-50 disabled:cursor-not-allowed"
        onkeydown={handleKeydown}
      ></textarea>
    </div>

    <!-- Send button -->
    <button
      class="flex-shrink-0 p-2 rounded-lg bg-tutor-accent text-white hover:bg-tutor-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      onclick={handleSubmit}
      disabled={disabled || (!inputValue.trim() && !pendingScreenshot)}
      title="Send message"
    >
      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
        />
      </svg>
    </button>
  </div>
</div>
