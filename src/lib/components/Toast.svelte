<script lang="ts">
  import { toastStore } from '$lib/stores/toast';
  import { fly, fade } from 'svelte/transition';

  const toasts = $derived($toastStore);
</script>

{#if toasts.length > 0}
  <div class="toast-container">
    {#each toasts as toast (toast.id)}
      <div
        class="toast {toast.type}"
        in:fly={{ y: -20, duration: 200 }}
        out:fade={{ duration: 150 }}
      >
        <span class="toast-message">{toast.message}</span>
        <button class="toast-close" onclick={() => toastStore.dismiss(toast.id)} aria-label="Dismiss">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: rgba(9, 9, 11, 0.95);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    font-size: 13px;
    color: #fafafa;
    pointer-events: auto;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .toast.success {
    border-color: rgba(34, 197, 94, 0.3);
  }

  .toast.success .toast-message {
    color: #22c55e;
  }

  .toast.error {
    border-color: rgba(239, 68, 68, 0.3);
  }

  .toast.error .toast-message {
    color: #ef4444;
  }

  .toast-message {
    flex: 1;
  }

  .toast-close {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    background: transparent;
    border: none;
    color: rgba(250, 250, 250, 0.4);
    cursor: pointer;
    border-radius: 4px;
    transition: color 0.15s;
  }

  .toast-close:hover {
    color: #fafafa;
  }
</style>
