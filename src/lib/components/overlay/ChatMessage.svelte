<script lang="ts">
  import type { Message } from '$lib/types';

  interface Props {
    message: Message;
  }

  let { message }: Props = $props();

  const isUser = $derived(message.role === 'user');
</script>

<div class="flex gap-3 {isUser ? 'flex-row-reverse' : ''} animate-slide-up">
  <!-- Avatar -->
  <div
    class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
      {isUser ? 'bg-tutor-accent text-white' : 'bg-tutor-border text-tutor-text'}"
  >
    {isUser ? 'U' : 'T'}
  </div>

  <!-- Message content -->
  <div class="flex-1 max-w-[85%]">
    <!-- Screenshot thumbnail if present -->
    {#if message.screen_context?.screenshot}
      <div class="mb-2 p-2 bg-tutor-surface border border-tutor-border rounded-lg">
        <img
          src="data:image/png;base64,{message.screen_context.screenshot}"
          alt="Screen capture"
          class="w-full max-h-32 object-contain rounded cursor-pointer hover:opacity-90 transition-opacity"
        />
        {#if message.screen_context.window_title}
          <p class="mt-1 text-xs text-tutor-text-secondary truncate">
            {message.screen_context.window_title}
          </p>
        {/if}
      </div>
    {/if}

    <!-- Message bubble -->
    <div
      class="px-3 py-2 rounded-lg text-sm leading-relaxed
        {isUser
        ? 'bg-tutor-accent text-white rounded-br-sm'
        : 'bg-tutor-surface border border-tutor-border text-tutor-text rounded-bl-sm'}"
    >
      <div class="prose prose-sm max-w-none {isUser ? 'prose-invert' : ''}">
        {message.content}
      </div>
    </div>

    <!-- Timestamp -->
    <p class="mt-1 text-xs text-tutor-text-secondary {isUser ? 'text-right' : ''}">
      {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </p>
  </div>
</div>
