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
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] animate-fade-in"
    onclick={onclose}
    onkeydown={(e) => e.key === 'Escape' && onclose()}
    role="button"
    tabindex="-1"
    aria-label="Close history"
  ></div>

  <!-- Sidebar -->
  <aside
    class="fixed left-0 top-0 bottom-0 w-72 bg-tutor-surface border-r border-tutor-border z-[101] flex flex-col animate-slide-up"
  >
    <header class="flex items-center justify-between px-4 h-14 border-b border-tutor-border">
      <h2 class="font-semibold text-tutor-text">History</h2>
      <button
        class="p-1.5 rounded-lg text-tutor-text-tertiary hover:text-tutor-text hover:bg-tutor-surface-elevated"
        onclick={onclose}
        aria-label="Close history"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </header>

    <div
      bind:this={scrollContainer}
      class="flex-1 overflow-y-auto"
      onscroll={handleScroll}
    >
      {#if loading}
        <div class="flex items-center justify-center py-8">
          <div class="flex gap-1">
            <span class="w-1.5 h-1.5 bg-tutor-accent rounded-full animate-bounce"></span>
            <span class="w-1.5 h-1.5 bg-tutor-accent rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
            <span class="w-1.5 h-1.5 bg-tutor-accent rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
          </div>
        </div>
      {:else if conversations.length === 0}
        <div class="flex flex-col items-center justify-center py-12 text-center px-4">
          <div class="w-10 h-10 rounded-xl bg-tutor-surface-elevated flex items-center justify-center mb-3">
            <svg class="w-5 h-5 text-tutor-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </div>
          <p class="text-sm text-tutor-text-secondary">No conversations yet</p>
        </div>
      {:else}
        <nav class="p-2 space-y-0.5">
          {#each conversations as conversation}
            <button
              class="w-full text-left px-3 py-2.5 rounded-lg hover:bg-tutor-surface-elevated group"
              onclick={() => selectConversation(conversation)}
            >
              <p class="text-sm font-medium text-tutor-text truncate group-hover:text-tutor-accent">
                {getConversationPreview(conversation)}
              </p>
              <p class="text-xs text-tutor-text-tertiary mt-0.5">
                {formatDate(conversation.started_at)}
              </p>
            </button>
          {/each}

          {#if loadingMore}
            <div class="flex items-center justify-center py-4">
              <div class="flex gap-1">
                <span class="w-1.5 h-1.5 bg-tutor-accent rounded-full animate-bounce"></span>
                <span class="w-1.5 h-1.5 bg-tutor-accent rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
                <span class="w-1.5 h-1.5 bg-tutor-accent rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
              </div>
            </div>
          {:else if !hasMore && conversations.length > PAGE_SIZE}
            <p class="text-center text-xs text-tutor-text-tertiary py-3">
              End of history
            </p>
          {/if}
        </nav>
      {/if}
    </div>
  </aside>
{/if}
