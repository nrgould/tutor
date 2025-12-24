<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { chatStore } from '$lib/stores/chat';
  import { settingsStore } from '$lib/stores/settings';
  import { streamChat } from '$lib/utils/api';
  import { createConversation, saveMessage, getConversations, getMessages } from '$lib/utils/db';
  import { processConversationMemories, getTopics } from '$lib/services/memoryService';
  import { getTopicsDueForReview } from '$lib/utils/spacedRepetition';
  import ChatMessage from '$lib/components/overlay/ChatMessage.svelte';
  import ChatInput from '$lib/components/overlay/ChatInput.svelte';
  import ConversationHistory from '$lib/components/ConversationHistory.svelte';
  import type { Message, ScreenContext } from '$lib/types';

  interface TopicInfo {
    id: string;
    name: string;
    mastery_level: number;
    status: string;
    last_practiced?: string;
    next_review?: string;
  }

  let messagesContainer: HTMLDivElement;
  let showHistory = $state(false);
  let showReviewBanner = $state(true);
  let topicsDue = $state<TopicInfo[]>([]);

  // Subscribe to stores
  const chat = $derived($chatStore);
  const settings = $derived($settingsStore);

  onMount(async () => {
    // Load settings
    await settingsStore.load();

    // Load recent conversation or create new one
    try {
      const conversations = await getConversations(1);
      if (conversations.length > 0) {
        chatStore.setConversation(conversations[0]);
        const msgs = await getMessages(conversations[0].id);
        chatStore.setMessages(msgs);
      } else {
        await startNewConversation();
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
      await startNewConversation();
    }

    // Check for topics due for review
    try {
      const allTopics = await getTopics();
      topicsDue = getTopicsDueForReview(allTopics);
    } catch (error) {
      console.warn('Failed to load topics for review:', error);
    }
  });

  async function startNewConversation() {
    try {
      // Process memories from previous conversation before starting new one
      if (chat.currentConversation && chat.messages.length >= 4) {
        processConversationMemories(chat.messages, chat.currentConversation.id).catch((e) =>
          console.warn('Failed to process memories:', e)
        );
      }

      const conversation = await createConversation();
      chatStore.setConversation(conversation);
      chatStore.setMessages([]);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  }

  async function handleSendMessage(content: string, screenshot?: string) {
    if (!settings.anthropic_api_key) {
      goto('/settings');
      return;
    }

    // Ensure we have a conversation
    if (!chat.currentConversation) {
      await startNewConversation();
    }

    const screenContext: ScreenContext | undefined = screenshot
      ? {
          screenshot,
          captured_at: new Date().toISOString(),
        }
      : undefined;

    // Create and save user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      conversation_id: chat.currentConversation!.id,
      role: 'user',
      content,
      screen_context: screenContext,
      created_at: new Date().toISOString(),
    };

    // Get existing messages BEFORE adding the new one (for API call)
    const existingMessages = [...chat.messages];

    chatStore.addMessage(userMessage);

    try {
      await saveMessage(chat.currentConversation!.id, 'user', content, screenContext);
    } catch (error) {
      console.error('Failed to save user message:', error);
    }

    // Create placeholder for assistant response
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      conversation_id: chat.currentConversation!.id,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };

    chatStore.addMessage(assistantMessage);
    chatStore.setLoading(true);

    try {
      // Send existing messages + new user message (NOT the empty assistant placeholder)
      const messagesToSend = [...existingMessages, userMessage];

      // Stream the response
      for await (const chunk of streamChat(messagesToSend)) {
        chatStore.appendToLastMessage(chunk);
        scrollToBottom();
      }

      // Save the complete assistant message
      const currentMessages = $chatStore.messages;
      const finalAssistantMessage = currentMessages[currentMessages.length - 1];
      await saveMessage(
        chat.currentConversation!.id,
        'assistant',
        finalAssistantMessage.content,
        undefined
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      chatStore.setError(errorMessage);
      chatStore.updateLastMessage(`Error: ${errorMessage}`);
    } finally {
      chatStore.setLoading(false);
    }
  }

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  // Auto-scroll when new messages arrive
  $effect(() => {
    if (chat.messages.length > 0) {
      scrollToBottom();
    }
  });
</script>

<div class="h-screen flex flex-col bg-tutor-bg">
  <!-- Header -->
  <div
    class="flex items-center justify-between px-4 py-3 border-b border-tutor-border bg-tutor-surface"
  >
    <div class="flex items-center gap-2">
      <button
        class="flex items-center gap-2 hover:opacity-80 transition-opacity"
        onclick={() => (showHistory = true)}
        title="View conversation history"
      >
        <div class="w-8 h-8 rounded-lg bg-tutor-accent flex items-center justify-center">
          <span class="text-white font-bold text-sm">T</span>
        </div>
        <span class="font-semibold text-tutor-text">Tutor</span>
      </button>
    </div>

    <div class="flex items-center gap-2">
      <button
        class="p-2 rounded-lg text-tutor-text-secondary hover:text-tutor-text hover:bg-tutor-border/50 transition-colors"
        onclick={startNewConversation}
        title="New conversation"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 4v16m8-8H4"
          />
        </svg>
      </button>

      <a
        href="/dashboard"
        class="p-2 rounded-lg text-tutor-text-secondary hover:text-tutor-text hover:bg-tutor-border/50 transition-colors"
        title="Learning Dashboard"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      </a>

      <a
        href="/study"
        class="p-2 rounded-lg text-tutor-text-secondary hover:text-tutor-text hover:bg-tutor-border/50 transition-colors"
        title="Study Session"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </a>

      <a
        href="/settings"
        class="p-2 rounded-lg text-tutor-text-secondary hover:text-tutor-text hover:bg-tutor-border/50 transition-colors"
        title="Settings"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </a>
    </div>
  </div>

  <!-- Review Reminder Banner -->
  {#if showReviewBanner && topicsDue.length > 0 && chat.messages.length === 0}
    <div class="px-4 py-3 bg-orange-500/10 border-b border-orange-500/30">
      <div class="flex items-center justify-between max-w-2xl mx-auto">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
            <svg class="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="text-sm font-medium text-orange-400">
              {topicsDue.length} topic{topicsDue.length > 1 ? 's' : ''} due for review
            </p>
            <p class="text-xs text-tutor-text-secondary">
              {topicsDue.slice(0, 3).map(t => t.name).join(', ')}{topicsDue.length > 3 ? '...' : ''}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <a
            href="/dashboard"
            class="px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors"
          >
            Review Now
          </a>
          <button
            class="p-1 text-tutor-text-secondary hover:text-tutor-text transition-colors"
            onclick={() => (showReviewBanner = false)}
            aria-label="Dismiss"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Messages area -->
  <div bind:this={messagesContainer} class="flex-1 overflow-y-auto p-4 space-y-4">
    {#if chat.messages.length === 0}
      <div class="h-full flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 rounded-2xl bg-tutor-accent/10 flex items-center justify-center mb-4">
          <svg
            class="w-8 h-8 text-tutor-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-tutor-text mb-2">Ready to help you learn</h2>
        <p class="text-sm text-tutor-text-secondary max-w-xs">
          Capture your screen and ask questions about what you're studying. I'll help you
          understand and learn.
        </p>
        {#if !settings.anthropic_api_key}
          <a
            href="/settings"
            class="mt-4 inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg bg-tutor-accent text-white hover:bg-tutor-accent/90 transition-colors"
          >
            Set up API key
          </a>
        {/if}
      </div>
    {:else}
      {#each chat.messages as message (message.id)}
        <ChatMessage {message} />
      {/each}

      {#if chat.isLoading}
        <div class="flex items-center gap-2 text-tutor-text-secondary">
          <div class="flex gap-1">
            <span class="w-2 h-2 bg-tutor-accent rounded-full animate-bounce"></span>
            <span
              class="w-2 h-2 bg-tutor-accent rounded-full animate-bounce"
              style="animation-delay: 0.1s"
            ></span>
            <span
              class="w-2 h-2 bg-tutor-accent rounded-full animate-bounce"
              style="animation-delay: 0.2s"
            ></span>
          </div>
          <span class="text-sm">Thinking...</span>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Chat input -->
  <ChatInput disabled={chat.isLoading} onsubmit={handleSendMessage} />
</div>

<!-- Conversation History Sidebar -->
<ConversationHistory open={showHistory} onclose={() => (showHistory = false)} />
