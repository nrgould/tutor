<script lang="ts">
  import { nudgeStore } from '$lib/stores/nudge';
  import { fly, fade } from 'svelte/transition';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ click: string }>();
  const nudge = $derived($nudgeStore.current);

  function handleClick() {
    const aiMessage = nudgeStore.consumeForChat();
    if (aiMessage) {
      dispatch('click', aiMessage);
    }
  }

  function handleDismiss(e: MouseEvent) {
    e.stopPropagation();
    nudgeStore.dismiss();
  }

  const typeIcons: Record<string, string> = {
    'tip': '💡',
    'question': '🤔',
    'resource': '📚',
    'funfact': '✨',
    'check-in': '👋',
  };

  const typeLabels: Record<string, string> = {
    'tip': 'Tip',
    'question': 'Question',
    'resource': 'Resource',
    'funfact': 'Fun Fact',
    'check-in': 'Check-in',
  };
</script>

{#if nudge}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="nudge-toast"
    role="button"
    tabindex="0"
    in:fly={{ x: 100, duration: 300 }}
    out:fade={{ duration: 200 }}
    onclick={handleClick}
    onkeydown={(e) => e.key === 'Enter' && handleClick()}
    aria-label="Open chat with tutor suggestion"
  >
    <div class="nudge-header">
      <span class="nudge-icon">{typeIcons[nudge.type] || '💬'}</span>
      <span class="nudge-label">{typeLabels[nudge.type] || 'Tutor'}</span>
      <button class="nudge-close" onclick={handleDismiss} aria-label="Dismiss">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <p class="nudge-message">{nudge.message}</p>
    <span class="nudge-hint">Click to chat →</span>
  </div>
{/if}

<style>
  .nudge-toast {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9998;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 300px;
    padding: 14px 16px;
    background: rgba(9, 9, 11, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    cursor: pointer;
    text-align: left;
    transition: transform 0.15s ease, border-color 0.15s ease;
  }

  .nudge-toast:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .nudge-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .nudge-icon {
    font-size: 14px;
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
    transition: color 0.15s, background 0.15s;
  }

  .nudge-close:hover {
    color: rgba(250, 250, 250, 0.8);
    background: rgba(255, 255, 255, 0.1);
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
    transition: color 0.15s;
  }

  .nudge-toast:hover .nudge-hint {
    color: rgba(250, 250, 250, 0.6);
  }
</style>
