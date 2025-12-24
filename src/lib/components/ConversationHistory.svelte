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

  let conversations = $state<Conversation[]>([]);
  let loading = $state(true);

  onMount(async () => {
    await loadConversations();
  });

  async function loadConversations() {
    loading = true;
    try {
      conversations = await getConversations(50);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      loading = false;
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
  <button
    class="fixed inset-0 bg-black/50 z-40"
    onclick={onclose}
    aria-label="Close history"
  ></button>

  <!-- Sidebar -->
  <div
    class="fixed left-0 top-0 bottom-0 w-80 bg-tutor-surface border-r border-tutor-border z-50 flex flex-col"
  >
    <div class="flex items-center justify-between p-4 border-b border-tutor-border">
      <h2 class="font-semibold text-tutor-text">Conversation History</h2>
      <button
        class="p-1.5 rounded-lg text-tutor-text-secondary hover:text-tutor-text hover:bg-tutor-border/50 transition-colors"
        onclick={onclose}
        aria-label="Close history"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto">
      {#if loading}
        <div class="flex items-center justify-center py-8">
          <div class="flex gap-1">
            <span class="w-2 h-2 bg-tutor-accent rounded-full animate-bounce"></span>
            <span class="w-2 h-2 bg-tutor-accent rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
            <span class="w-2 h-2 bg-tutor-accent rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
          </div>
        </div>
      {:else if conversations.length === 0}
        <div class="flex flex-col items-center justify-center py-8 text-center px-4">
          <svg class="w-12 h-12 text-tutor-text-secondary mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p class="text-sm text-tutor-text-secondary">No conversations yet</p>
        </div>
      {:else}
        <div class="p-2">
          {#each conversations as conversation}
            <button
              class="w-full text-left p-3 rounded-lg hover:bg-tutor-border/50 transition-colors mb-1"
              onclick={() => selectConversation(conversation)}
            >
              <p class="text-sm font-medium text-tutor-text truncate">
                {getConversationPreview(conversation)}
              </p>
              <p class="text-xs text-tutor-text-secondary mt-0.5">
                {formatDate(conversation.started_at)}
              </p>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
