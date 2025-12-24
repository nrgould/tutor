<script lang="ts">
  import { onMount } from 'svelte';
  import { getConversations, getMessages } from '$lib/utils/db';
  import { chatStore } from '$lib/stores/chat';
  import type { Conversation } from '$lib/types';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  const PAGE_SIZE = 20;
  let conversations = $state<Conversation[]>([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let hasMore = $state(true);
  let scrollContainer: HTMLDivElement;

  onMount(async () => {
    await loadConversations();
  });

  async function loadConversations() {
    loading = true;
    try {
      const result = await getConversations(PAGE_SIZE);
      conversations = result;
      hasMore = result.length === PAGE_SIZE;
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;

    loadingMore = true;
    try {
      const moreConversations = await getConversations(PAGE_SIZE, conversations.length);
      if (moreConversations.length > 0) {
        conversations = [...conversations, ...moreConversations];
        hasMore = moreConversations.length === PAGE_SIZE;
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error('Failed to load more conversations:', error);
    } finally {
      loadingMore = false;
    }
  }

  function handleScroll() {
    if (!scrollContainer || loadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      loadMore();
    }
  }

  async function selectConversation(conversation: Conversation) {
    try {
      const messages = await getMessages(conversation.id);
      chatStore.setConversation(conversation);
      chatStore.setMessages(messages);
      onclose();
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  function getConversationPreview(conversation: Conversation): string {
    return conversation.title || conversation.topic || 'New conversation';
  }
</script>

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] animate-fade-in"
    onclick={onclose}
    onkeydown={(e) => e.key === 'Escape' && onclose()}
    role="button"
    tabindex="-1"
    aria-label="Close history"
  ></div>

  <!-- Sidebar -->
  <aside
    class="fixed left-0 top-0 bottom-0 w-80 bg-[var(--gray-1)] border-r border-[var(--gray-3)] z-[101] flex flex-col animate-slide-in-left"
  >
    <!-- Header -->
    <header class="flex items-center justify-between px-5 h-16 border-b border-[var(--gray-3)]">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-xl bg-[var(--gray-3)] border border-[var(--gray-4)] flex items-center justify-center">
          <svg class="w-4 h-4 text-[var(--gray-11)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h2 class="font-semibold text-[var(--gray-12)]">History</h2>
      </div>
      <button
        class="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-3)] transition-colors"
        onclick={onclose}
        aria-label="Close history"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </header>

    <!-- Content -->
    <div
      bind:this={scrollContainer}
      class="flex-1 overflow-y-auto"
      onscroll={handleScroll}
    >
      {#if loading}
        <div class="flex flex-col items-center justify-center py-12">
          <div class="flex gap-1.5">
            <span class="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce"></span>
            <span class="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
            <span class="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
          </div>
          <p class="mt-3 text-sm text-[var(--gray-9)]">Loading history...</p>
        </div>
      {:else if conversations.length === 0}
        <div class="flex flex-col items-center justify-center py-16 text-center px-6">
          <div class="w-14 h-14 rounded-2xl bg-[var(--gray-3)] border border-[var(--gray-4)] flex items-center justify-center mb-4">
            <svg class="w-7 h-7 text-[var(--gray-8)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </div>
          <p class="text-sm font-medium text-[var(--gray-11)]">No conversations yet</p>
          <p class="mt-1 text-xs text-[var(--gray-9)]">Start a new chat to begin learning</p>
        </div>
      {:else}
        <nav class="p-3">
          <div class="space-y-1">
            {#each conversations as conversation}
              <button
                class="w-full text-left px-4 py-3 rounded-xl hover:bg-[var(--gray-3)] group transition-colors"
                onclick={() => selectConversation(conversation)}
              >
                <div class="flex items-start gap-3">
                  <div class="w-6 h-6 rounded-lg bg-[var(--gray-4)] group-hover:bg-[var(--accent-muted)] flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors">
                    <svg class="w-3.5 h-3.5 text-[var(--gray-9)] group-hover:text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-[var(--gray-12)] truncate group-hover:text-[var(--accent)] transition-colors">
                      {getConversationPreview(conversation)}
                    </p>
                    <p class="text-xs text-[var(--gray-8)] mt-0.5">
                      {formatDate(conversation.started_at)}
                    </p>
                  </div>
                </div>
              </button>
            {/each}
          </div>

          {#if loadingMore}
            <div class="flex items-center justify-center py-6">
              <div class="flex gap-1.5">
                <span class="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce"></span>
                <span class="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
                <span class="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
              </div>
            </div>
          {:else if !hasMore && conversations.length > PAGE_SIZE}
            <div class="flex items-center justify-center py-4">
              <p class="text-xs text-[var(--gray-8)]">You've reached the end</p>
            </div>
          {/if}
        </nav>
      {/if}
    </div>

    <!-- Footer -->
    <footer class="px-5 py-4 border-t border-[var(--gray-3)]">
      <p class="text-xs text-[var(--gray-8)] text-center">
        {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
      </p>
    </footer>
  </aside>
{/if}
