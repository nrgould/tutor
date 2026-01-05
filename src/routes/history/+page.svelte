<script lang="ts">
  import { onMount } from 'svelte';
  import { getConversations, getMessages } from '$lib/utils/db';
  import { chatStore } from '$lib/stores/chat';
  import { goto } from '$app/navigation';
  import type { Conversation, Message } from '$lib/types';

  let conversations = $state<Conversation[]>([]);
  let isLoading = $state(true);
  let selectedConversation = $state<Conversation | null>(null);
  let selectedMessages = $state<Message[]>([]);

  onMount(async () => {
    try {
      conversations = await getConversations(50);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      isLoading = false;
    }
  });

  async function selectConversation(conv: Conversation) {
    selectedConversation = conv;
    try {
      selectedMessages = await getMessages(conv.id);
    } catch (error) {
      console.error('Failed to load messages:', error);
      selectedMessages = [];
    }
  }

  async function continueConversation(conv: Conversation) {
    chatStore.setConversation(conv);
    const msgs = await getMessages(conv.id);
    chatStore.setMessages(msgs);
    goto('/');
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'Z');
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function getPreview(conv: Conversation): string {
    return conv.summary || conv.title || 'New conversation';
  }
</script>

<div class="h-screen bg-[var(--gray-1)] flex flex-col">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--gray-4)]">
    <div class="flex items-center gap-3">
      <a
        href="/"
        class="p-2 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-3)] transition-colors"
        aria-label="Go back"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
      </a>
      <h1 class="text-lg font-semibold text-[var(--gray-12)]">Session History</h1>
    </div>
  </div>

  <!-- Content -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Conversation list -->
    <div class="w-80 border-r border-[var(--gray-4)] overflow-y-auto">
      {#if isLoading}
        <div class="p-4 text-center text-[var(--gray-9)]">Loading...</div>
      {:else if conversations.length === 0}
        <div class="p-4 text-center text-[var(--gray-9)]">No sessions yet</div>
      {:else}
        {#each conversations as conv (conv.id)}
          <button
            class="w-full p-4 text-left border-b border-[var(--gray-3)] hover:bg-[var(--gray-2)] transition-colors {selectedConversation?.id === conv.id ? 'bg-[var(--gray-2)]' : ''}"
            onclick={() => selectConversation(conv)}
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-[var(--gray-12)] truncate">
                  {getPreview(conv)}
                </p>
                <p class="text-xs text-[var(--gray-9)] mt-1">
                  {formatDate(conv.started_at)}
                </p>
              </div>
              {#if conv.topic}
                <span class="px-2 py-0.5 text-xs rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                  {conv.topic}
                </span>
              {/if}
            </div>
          </button>
        {/each}
      {/if}
    </div>

    <!-- Selected conversation detail -->
    <div class="flex-1 flex flex-col overflow-hidden">
      {#if selectedConversation}
        <!-- Conversation header -->
        <div class="px-4 py-3 border-b border-[var(--gray-4)] flex items-center justify-between">
          <div>
            <h2 class="font-medium text-[var(--gray-12)]">{getPreview(selectedConversation)}</h2>
            <p class="text-xs text-[var(--gray-9)]">{formatDate(selectedConversation.started_at)}</p>
          </div>
          <button
            class="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
            onclick={() => continueConversation(selectedConversation!)}
          >
            Continue
          </button>
        </div>

        <!-- Messages -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          {#each selectedMessages as message (message.id)}
            <div class="flex gap-3 {message.role === 'user' ? 'flex-row-reverse' : ''}">
              <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 {message.role === 'user' ? 'bg-[var(--accent)]' : 'bg-[var(--gray-3)]'}">
                {#if message.role === 'user'}
                  <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                {:else}
                  <svg class="w-4 h-4 text-[var(--gray-11)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                {/if}
              </div>
              <div class="max-w-[80%] px-4 py-3 rounded-2xl {message.role === 'user' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--gray-2)] text-[var(--gray-12)]'}">
                <p class="text-sm whitespace-pre-wrap">{message.content}</p>
                {#if message.screen_context?.screenshot}
                  <div class="mt-2 rounded-lg overflow-hidden">
                    <img
                      src="data:image/png;base64,{message.screen_context.screenshot}"
                      alt="Screenshot"
                      class="max-h-32 object-cover"
                    />
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="flex-1 flex items-center justify-center text-[var(--gray-9)]">
          <div class="text-center">
            <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
            </svg>
            <p>Select a session to view details</p>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
