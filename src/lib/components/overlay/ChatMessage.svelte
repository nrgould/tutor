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
      <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--accent-8)] to-[var(--accent-9)] flex items-center justify-center text-xs font-semibold text-white shadow-lg shadow-[var(--accent-9)]/20">
        Y
      </div>
    {:else}
      <div class="w-8 h-8 rounded-xl bg-[var(--gray-3)] border border-[var(--gray-4)] flex items-center justify-center">
        <svg class="w-4 h-4 text-[var(--accent-11)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
        </svg>
      </div>
    {/if}
  </div>

  <!-- Message content -->
  <div class="flex-1 min-w-0 {isUser ? 'flex flex-col items-end' : ''}">
    <!-- Screenshot thumbnail if present -->
    {#if message.screen_context?.screenshot}
      <div class="mb-3 group">
        <div class="relative rounded-xl overflow-hidden border border-[var(--gray-4)] bg-[var(--gray-3)] shadow-lg max-w-sm">
          <img
            src="data:image/png;base64,{message.screen_context.screenshot}"
            alt="Screen capture"
            class="w-full max-h-40 object-contain"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
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
        ? 'bg-gradient-to-br from-[var(--accent-8)] to-[var(--accent-9)] text-white shadow-lg shadow-[var(--accent-9)]/15'
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
