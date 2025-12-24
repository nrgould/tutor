<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { chatStore } from '$lib/stores/chat';
  import { settingsStore } from '$lib/stores/settings';
  import { streamChat } from '$lib/utils/api';
  import { createConversation, saveMessage, getConversations, getMessages } from '$lib/utils/db';
  import { processConversationMemories, getTopics } from '$lib/services/memoryService';
  import { getTopicsDueForReview } from '$lib/utils/spacedRepetition';
  import { notifyReviewDue, ensureNotificationPermission } from '$lib/services/notificationService';
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

      // Request notification permission early
      await ensureNotificationPermission();

      // Send a reminder notification if there are topics due and user hasn't been notified recently
      if (topicsDue.length > 0) {
        const lastNotified = localStorage.getItem('lastReviewNotification');
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        if (!lastNotified || now - parseInt(lastNotified) > oneHour) {
          await notifyReviewDue(
            topicsDue.length,
            topicsDue.map((t) => t.name)
          );
          localStorage.setItem('lastReviewNotification', now.toString());
        }
      }
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
  <header class="flex items-center justify-between px-4 h-14 border-b border-tutor-border bg-tutor-surface/80 backdrop-blur-sm">
    <div class="flex items-center gap-3">
      <button
        class="flex items-center gap-2.5 group"
        onclick={() => (showHistory = true)}
        title="View conversation history"
      >
        <div class="w-8 h-8 rounded-lg bg-tutor-accent flex items-center justify-center">
          <span class="text-white font-semibold text-sm">T</span>
        </div>
        <span class="font-semibold text-tutor-text group-hover:text-tutor-accent">Tutor</span>
      </button>
    </div>

    <nav class="flex items-center gap-1">
      <button
        class="p-2 rounded-lg text-tutor-text-tertiary hover:text-tutor-text hover:bg-tutor-surface-elevated"
        onclick={startNewConversation}
        title="New conversation"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      <a
        href="/dashboard"
        class="p-2 rounded-lg text-tutor-text-tertiary hover:text-tutor-text hover:bg-tutor-surface-elevated"
        title="Learning Dashboard"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      </a>

      <a
        href="/study"
        class="p-2 rounded-lg text-tutor-text-tertiary hover:text-tutor-text hover:bg-tutor-surface-elevated"
        title="Study Session"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </a>

      <a
        href="/settings"
        class="p-2 rounded-lg text-tutor-text-tertiary hover:text-tutor-text hover:bg-tutor-surface-elevated"
        title="Settings"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </a>
    </nav>
  </header>

  <!-- Review Reminder Banner -->
  {#if showReviewBanner && topicsDue.length > 0 && chat.messages.length === 0}
    <div class="px-4 py-2.5 bg-tutor-warning/5 border-b border-tutor-warning/20">
      <div class="flex items-center justify-between max-w-2xl mx-auto">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-tutor-warning/10 flex items-center justify-center">
            <svg class="w-4 h-4 text-tutor-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="text-sm font-medium text-tutor-warning">
              {topicsDue.length} topic{topicsDue.length > 1 ? 's' : ''} due for review
            </p>
            <p class="text-xs text-tutor-text-tertiary">
              {topicsDue.slice(0, 3).map(t => t.name).join(', ')}{topicsDue.length > 3 ? '...' : ''}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <a
            href="/dashboard"
            class="px-3 py-1.5 text-xs font-medium rounded-lg bg-tutor-warning text-tutor-bg hover:opacity-90"
          >
            Review Now
          </a>
          <button
            class="p-1.5 rounded text-tutor-text-tertiary hover:text-tutor-text hover:bg-tutor-surface-elevated"
            onclick={() => (showReviewBanner = false)}
            aria-label="Dismiss"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Messages area -->
  <div bind:this={messagesContainer} class="flex-1 overflow-y-auto">
    {#if chat.messages.length === 0}
      <div class="h-full flex flex-col items-center justify-center text-center px-4">
        <div class="w-12 h-12 rounded-xl bg-tutor-accent/10 flex items-center justify-center mb-4">
          <svg
            class="w-6 h-6 text-tutor-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
            />
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-tutor-text mb-1">Ready to help you learn</h2>
        <p class="text-sm text-tutor-text-secondary max-w-sm">
          Capture your screen and ask questions about what you're studying.
        </p>
        {#if !settings.anthropic_api_key}
          <a
            href="/settings"
            class="mt-5 inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg bg-tutor-accent text-white hover:bg-tutor-accent-hover"
          >
            Configure API Key
          </a>
        {/if}
      </div>
    {:else}
      <div class="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {#each chat.messages as message (message.id)}
          <ChatMessage {message} />
        {/each}

        {#if chat.isLoading}
          <div class="flex items-center gap-2 text-tutor-text-tertiary pl-10">
            <div class="flex gap-1">
              <span class="w-1.5 h-1.5 bg-tutor-accent rounded-full animate-bounce"></span>
              <span class="w-1.5 h-1.5 bg-tutor-accent rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
              <span class="w-1.5 h-1.5 bg-tutor-accent rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Chat input -->
  <ChatInput disabled={chat.isLoading} onsubmit={handleSendMessage} />
</div>

<!-- Conversation History Sidebar -->
<ConversationHistory open={showHistory} onclose={() => (showHistory = false)} />
