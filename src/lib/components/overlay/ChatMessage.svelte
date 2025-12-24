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

<div class="flex gap-4 {isUser ? 'flex-row-reverse' : ''} animate-slide-up">
  <!-- Avatar -->
  <div class="flex-shrink-0">
    {#if isUser}
      <div class="w-8 h-8 rounded-xl bg-[var(--accent)] flex items-center justify-center text-xs font-semibold text-white">
        Y
      </div>
    {:else}
      <div class="w-8 h-8 rounded-xl bg-[var(--gray-3)] border border-[var(--gray-4)] flex items-center justify-center">
        <span class="text-[var(--accent)] font-bold text-xs">E</span>
      </div>
    {/if}
  </div>

  <!-- Message content -->
  <div class="flex-1 min-w-0 {isUser ? 'flex flex-col items-end' : ''}">
    <!-- Screenshot thumbnail if present -->
    {#if message.screen_context?.screenshot}
      <div class="mb-3 group">
        <div class="relative rounded-xl overflow-hidden border border-[var(--gray-4)] bg-[var(--gray-3)] max-w-sm">
          <img
            src="data:image/png;base64,{message.screen_context.screenshot}"
            alt="Screen capture"
            class="w-full max-h-40 object-contain"
          />
        </div>
        {#if message.screen_context.window_title}
          <p class="mt-2 text-xs text-[var(--gray-9)] truncate flex items-center gap-1.5">
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
            </svg>
            {message.screen_context.window_title}
          </p>
        {/if}
      </div>
    {/if}

    <!-- Message bubble -->
    <div
      class="px-4 py-3 rounded-2xl text-sm max-w-[85%] {isUser ? 'rounded-br-md' : 'rounded-bl-md'}
        {isUser
        ? 'bg-[var(--accent)] text-white'
        : 'bg-[var(--gray-2)] border border-[var(--gray-4)] text-[var(--gray-12)]'}"
    >
      <div class="markdown-content leading-relaxed {isUser ? 'text-white [&_strong]:text-white [&_code]:bg-white/15 [&_code]:text-white/90' : ''}">
        {@html parsedContent}
      </div>
    </div>

    <!-- Timestamp -->
    <p class="mt-2 text-[11px] text-[var(--gray-8)] font-medium tracking-wide {isUser ? 'text-right' : ''}">
      {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </p>
  </div>
</div>
