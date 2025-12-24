<script lang="ts">
  interface Props {
    screenshot?: string;
    appName?: string;
    windowTitle?: string;
    expanded?: boolean;
    ontoggle?: () => void;
  }

  let {
    screenshot,
    appName,
    windowTitle,
    expanded = $bindable(false),
    ontoggle,
  }: Props = $props();
</script>

{#if screenshot}
  <div class="border border-tutor-border rounded-lg overflow-hidden bg-tutor-surface">
    <!-- Header -->
    <button
      class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-tutor-border/30 transition-colors"
      onclick={() => {
        expanded = !expanded;
        ontoggle?.();
      }}
    >
      <svg
        class="w-4 h-4 text-tutor-text-secondary transition-transform {expanded
          ? 'rotate-90'
          : ''}"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
      <svg class="w-4 h-4 text-tutor-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
        />
      </svg>
      <span class="text-sm text-tutor-text-secondary truncate">
        {windowTitle || appName || 'Screen capture'}
      </span>
    </button>

    <!-- Screenshot preview -->
    {#if expanded}
      <div class="p-2 border-t border-tutor-border">
        <img
          src="data:image/png;base64,{screenshot}"
          alt="Screen capture"
          class="w-full rounded object-contain max-h-48"
        />
        {#if appName}
          <p class="mt-2 text-xs text-tutor-text-secondary">
            App: {appName}
          </p>
        {/if}
      </div>
    {/if}
  </div>
{/if}
