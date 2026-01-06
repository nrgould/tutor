<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { emit } from '@tauri-apps/api/event';
  import { page } from '$app/stores';

  let message = $state('');
  let type = $state('tip');
  let aiMessage = $state('');
  let mounted = $state(false);

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
    message = params.get('message') || '';
    type = params.get('type') || 'tip';
    aiMessage = params.get('aiMessage') || '';
    mounted = true;

    // Auto-dismiss after 25 seconds
    setTimeout(() => {
      closeWindow();
    }, 25000);
  });

  async function handleClick() {
    if (aiMessage) {
      await emit('nudge-clicked', { aiMessage });
    }
    closeWindow();
  }

  async function handleDismiss(e: MouseEvent) {
    e.stopPropagation();
    closeWindow();
  }

  function closeWindow() {
    const window = getCurrentWindow();
    window.close();
  }
</script>

{#if mounted && message}
  <div
    class="nudge-toast"
    role="button"
    tabindex="0"
    onclick={handleClick}
    onkeydown={(e) => e.key === 'Enter' && handleClick()}
  >
    <div class="nudge-header">
      <span class="nudge-label">{typeLabels[type] || 'Eigen'}</span>
      <button class="nudge-close" onclick={handleDismiss} aria-label="Dismiss">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <p class="nudge-message">{message}</p>
    <span class="nudge-hint">Click to chat</span>
  </div>
{/if}

<style>
  :global(html), :global(body) {
    margin: 0;
    padding: 0;
    background: #09090b;
    overflow: hidden;
  }

  .nudge-toast {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    height: 100vh;
    box-sizing: border-box;
    background: #09090b;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
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
