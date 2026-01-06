<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { emit } from '@tauri-apps/api/event';
  import { fly, fade } from 'svelte/transition';
  import { page } from '$app/stores';

  let nudge = $state<{
    message: string;
    type: string;
    aiMessage: string;
  } | null>(null);

  let visible = $state(false);
  let closing = $state(false);

  const typeLabels: Record<string, string> = {
    'tip': 'Tip',
    'question': 'Question',
    'resource': 'Resource',
    'funfact': 'Fun Fact',
    'check-in': 'Check-in',
  };

  onMount(() => {
    // Read nudge data from URL params
    const params = $page.url.searchParams;
    const message = params.get('message');
    const type = params.get('type');
    const aiMessage = params.get('aiMessage');

    if (message && aiMessage) {
      nudge = {
        message,
        type: type || 'tip',
        aiMessage,
      };
      // Show with animation after a brief delay
      setTimeout(() => {
        visible = true;
      }, 50);
    }

    // Auto-dismiss after 25 seconds
    const timer = setTimeout(() => {
      closeWindow();
    }, 25000);

    return () => clearTimeout(timer);
  });

  async function handleClick() {
    if (closing) return;
    closing = true;

    if (nudge) {
      // Emit event to main window to open chat with this message
      await emit('nudge-clicked', { aiMessage: nudge.aiMessage });
    }

    // Close window directly
    const window = getCurrentWindow();
    await window.close();
  }

  async function handleDismiss(e: MouseEvent) {
    e.stopPropagation();
    await closeWindow();
  }

  async function closeWindow() {
    if (closing) return;
    closing = true;
    visible = false;

    // Close window after brief delay for fade
    setTimeout(async () => {
      const window = getCurrentWindow();
      await window.close();
    }, 150);
  }
</script>

<div class="nudge-container">
  {#if visible && nudge}
    <div
      class="nudge-toast"
      role="button"
      tabindex="0"
      in:fly={{ y: -20, duration: 200 }}
      out:fade={{ duration: 150 }}
      onclick={handleClick}
      onkeydown={(e) => e.key === 'Enter' && handleClick()}
    >
      <div class="nudge-header">
        <span class="nudge-label">{typeLabels[nudge.type] || 'Eigen'}</span>
        <button class="nudge-close" onclick={handleDismiss} aria-label="Dismiss">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <p class="nudge-message">{nudge.message}</p>
      <span class="nudge-hint">Click to chat</span>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: transparent;
    overflow: hidden;
  }

  .nudge-container {
    padding: 8px;
  }

  .nudge-toast {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    background: rgba(9, 9, 11, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    cursor: pointer;
    font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  }

  .nudge-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .nudge-label {
    flex: 1;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: rgba(250, 250, 250, 0.5);
  }

  .nudge-close {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    background: transparent;
    border: none;
    color: rgba(250, 250, 250, 0.3);
    cursor: pointer;
    border-radius: 4px;
  }

  .nudge-close:hover {
    color: rgba(250, 250, 250, 0.6);
  }

  .nudge-message {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: #fafafa;
  }

  .nudge-hint {
    font-size: 11px;
    color: rgba(250, 250, 250, 0.4);
  }
</style>
