<script lang="ts">
  import type { Message } from '$lib/types';
  import { parseMarkdown } from '$lib/utils/markdown';

  interface Props {
    message: Message;
  }

  let { message }: Props = $props();

  const isUser = $derived(message.role === 'user');
  const parsedContent = $derived(parseMarkdown(message.content));
</script>

<div class="flex gap-3 {isUser ? 'flex-row-reverse' : ''} animate-fade-in">
  <!-- Avatar -->
  <div
    class="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold
      {isUser ? 'bg-tutor-accent text-white' : 'bg-tutor-surface-elevated text-tutor-text-secondary'}"
  >
    {isUser ? 'Y' : 'T'}
  </div>

  <!-- Message content -->
  <div class="flex-1 min-w-0 {isUser ? 'flex flex-col items-end' : ''}">
    <!-- Screenshot thumbnail if present -->
    {#if message.screen_context?.screenshot}
      <div class="mb-2 p-2 bg-tutor-surface-elevated rounded-lg max-w-sm">
        <img
          src="data:image/png;base64,{message.screen_context.screenshot}"
          alt="Screen capture"
          class="w-full max-h-32 object-contain rounded"
        />
        {#if message.screen_context.window_title}
          <p class="mt-1.5 text-xs text-tutor-text-tertiary truncate">
            {message.screen_context.window_title}
          </p>
        {/if}
      </div>
    {/if}

    <!-- Message bubble -->
    <div
      class="px-3.5 py-2.5 rounded-xl text-sm max-w-[90%]
        {isUser
        ? 'bg-tutor-accent text-white'
        : 'bg-tutor-surface text-tutor-text'}"
    >
      <div class="markdown-content {isUser ? 'text-white [&_strong]:text-white [&_code]:bg-white/20 [&_code]:text-white' : ''}">
        {@html parsedContent}
      </div>
    </div>

    <!-- Timestamp -->
    <p class="mt-1.5 text-[11px] text-tutor-text-tertiary {isUser ? 'text-right' : ''}">
      {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </p>
  </div>
</div>
