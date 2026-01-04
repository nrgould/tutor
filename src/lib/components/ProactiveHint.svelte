<script lang="ts">
  import { proactiveHintsStore, activeHints, type ProactiveHint } from '$lib/services/proactiveHints';

  interface Props {
    onaction?: (prompt: string) => void;
  }

  let { onaction }: Props = $props();

  const hints = $derived($activeHints);

  function handleAction(hint: ProactiveHint) {
    if (hint.action && onaction) {
      onaction(hint.action.prompt);
    }
    proactiveHintsStore.clearHint(hint.id);
  }

  function handleDismiss(hint: ProactiveHint) {
    proactiveHintsStore.dismissHint(hint.id);
  }

  function getHintIcon(type: ProactiveHint['type']) {
    switch (type) {
      case 'stuck':
        return 'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z';
      case 'long_session':
        return 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'suggestion':
      default:
        return 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z';
    }
  }

  function getHintColor(type: ProactiveHint['type']) {
    switch (type) {
      case 'stuck':
        return 'var(--warning)';
      case 'long_session':
        return 'var(--accent)';
      default:
        return 'var(--accent)';
    }
  }
</script>

{#if hints.length > 0}
  <div class="space-y-2 px-4 py-2">
    {#each hints as hint (hint.id)}
      <div
        class="relative bg-[var(--gray-2)] border border-[var(--gray-4)] rounded-xl p-3 animate-fade-in"
        style="border-left: 3px solid {getHintColor(hint.type)}"
      >
        <div class="flex items-start gap-3">
          <!-- Icon -->
          <div
            class="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
            style="background: {getHintColor(hint.type)}20"
          >
            <svg
              class="w-4 h-4"
              style="color: {getHintColor(hint.type)}"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d={getHintIcon(hint.type)} />
            </svg>
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <p class="text-sm text-[var(--gray-11)] leading-relaxed">{hint.message}</p>

            {#if hint.action}
              <div class="mt-2 flex items-center gap-2">
                <button
                  class="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
                  onclick={() => handleAction(hint)}
                >
                  {hint.action.label}
                </button>
                <button
                  class="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--gray-3)] text-[var(--gray-11)] hover:bg-[var(--gray-4)] transition-colors"
                  onclick={() => handleDismiss(hint)}
                >
                  Dismiss
                </button>
              </div>
            {/if}
          </div>

          <!-- Close button -->
          <button
            class="flex-shrink-0 p-1 rounded-md text-[var(--gray-8)] hover:text-[var(--gray-11)] hover:bg-[var(--gray-4)] transition-colors"
            onclick={() => handleDismiss(hint)}
            aria-label="Dismiss hint"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}
