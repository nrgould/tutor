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

  const chat = $derived($chatStore);
  const settings = $derived($settingsStore);

  onMount(async () => {
    await settingsStore.load();

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

    try {
      const allTopics = await getTopics();
      topicsDue = getTopicsDueForReview(allTopics);
      await ensureNotificationPermission();

      if (topicsDue.length > 0) {
        const lastNotified = localStorage.getItem('lastReviewNotification');
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        if (!lastNotified || now - parseInt(lastNotified) > oneHour) {
          await notifyReviewDue(topicsDue.length, topicsDue.map((t) => t.name));
          localStorage.setItem('lastReviewNotification', now.toString());
        }
      }
    } catch (error) {
      console.warn('Failed to load topics for review:', error);
    }
  });

  async function startNewConversation() {
    try {
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

    if (!chat.currentConversation) {
      await startNewConversation();
    }

    const screenContext: ScreenContext | undefined = screenshot
      ? { screenshot, captured_at: new Date().toISOString() }
      : undefined;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      conversation_id: chat.currentConversation!.id,
      role: 'user',
      content,
      screen_context: screenContext,
      created_at: new Date().toISOString(),
    };

    const existingMessages = [...chat.messages];
    chatStore.addMessage(userMessage);

    try {
      await saveMessage(chat.currentConversation!.id, 'user', content, screenContext);
    } catch (error) {
      console.error('Failed to save user message:', error);
    }

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
      const messagesToSend = [...existingMessages, userMessage];

      for await (const chunk of streamChat(messagesToSend)) {
        chatStore.appendToLastMessage(chunk);
        scrollToBottom();
      }

      const currentMessages = $chatStore.messages;
      const finalAssistantMessage = currentMessages[currentMessages.length - 1];
      await saveMessage(chat.currentConversation!.id, 'assistant', finalAssistantMessage.content, undefined);
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

  $effect(() => {
    if (chat.messages.length > 0) {
      scrollToBottom();
    }
  });
</script>

<div class="h-screen flex flex-col bg-[var(--gray-1)]">
  <!-- Header -->
  <header class="flex items-center justify-between px-4 h-14 border-b border-[var(--gray-4)] bg-[var(--gray-2)]">
    <div class="flex items-center gap-4">
      <button
        class="flex items-center gap-3 group"
        onclick={() => (showHistory = true)}
        title="View conversation history"
      >
        <div class="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center">
          <span class="text-white font-bold text-sm">E</span>
        </div>
        <div class="flex flex-col">
          <span class="font-semibold text-[var(--gray-12)] text-sm group-hover:text-[var(--accent)] transition-colors">Eigen</span>
          <span class="text-[10px] text-[var(--gray-9)] -mt-0.5">AI Learning Assistant</span>
        </div>
      </button>
    </div>

    <nav class="flex items-center gap-1">
      <button
        class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[var(--gray-11)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-all text-sm"
        onclick={startNewConversation}
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        <span class="hidden sm:inline">New</span>
      </button>

      <div class="w-px h-5 bg-[var(--gray-4)] mx-1"></div>

      <a
        href="/dashboard"
        class="p-2 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-all"
        title="Dashboard"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      </a>

      <a
        href="/study"
        class="p-2 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-all"
        title="Study Session"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </a>

      <a
        href="/settings"
        class="p-2 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-all"
        title="Settings"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </a>
    </nav>
  </header>

  <!-- Review Reminder Banner -->
  {#if showReviewBanner && topicsDue.length > 0 && chat.messages.length === 0}
    <div class="px-4 py-3 bg-[var(--warning)]/10 border-b border-[var(--warning)]/20">
      <div class="flex items-center justify-between max-w-3xl mx-auto">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-[var(--warning)]/15 flex items-center justify-center">
            <svg class="w-5 h-5 text-[var(--warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="text-sm font-semibold text-[var(--warning)]">
              {topicsDue.length} topic{topicsDue.length > 1 ? 's' : ''} ready for review
            </p>
            <p class="text-xs text-[var(--gray-10)]">
              {topicsDue.slice(0, 2).map(t => t.name).join(', ')}{topicsDue.length > 2 ? ` +${topicsDue.length - 2} more` : ''}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <a
            href="/dashboard"
            class="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--warning)] text-[var(--gray-1)] hover:opacity-90 transition-opacity"
          >
            Start Review
          </a>
          <button
            class="p-2 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-11)] hover:bg-[var(--gray-4)] transition-all"
            onclick={() => (showReviewBanner = false)}
            aria-label="Dismiss"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
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
      <div class="h-full flex flex-col items-center justify-center text-center px-4 py-12">
        <!-- Logo -->
        <div class="w-16 h-16 rounded-xl bg-[var(--accent)] flex items-center justify-center mb-6">
          <svg class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
          </svg>
        </div>

        <h1 class="text-2xl font-bold text-[var(--gray-12)] mb-2 tracking-tight">
          Your Personal AI Tutor
        </h1>
        <p class="text-[var(--gray-10)] max-w-md mb-8 leading-relaxed">
          Capture your screen, ask questions, and learn anything. I'll remember what you're studying and help you master it.
        </p>

        <!-- Quick Actions -->
        <div class="flex flex-col sm:flex-row gap-3 mb-10">
          {#if !settings.anthropic_api_key}
            <a
              href="/settings"
              class="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              Configure API Key
            </a>
          {:else}
            <button
              class="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[var(--gray-3)] text-[var(--gray-11)] border border-[var(--gray-5)] hover:bg-[var(--gray-4)] transition-colors"
              onclick={() => document.querySelector('textarea')?.focus()}
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
              Start a Conversation
            </button>
          {/if}

          <a
            href="/study"
            class="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[var(--gray-3)] text-[var(--gray-11)] border border-[var(--gray-5)] hover:bg-[var(--gray-4)] transition-colors"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Study Session
          </a>
        </div>

        <!-- Feature Pills -->
        <div class="flex flex-wrap justify-center gap-2">
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--gray-3)] border border-[var(--gray-4)] text-xs text-[var(--gray-10)]">
            <svg class="w-3.5 h-3.5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            </svg>
            Screen Capture
          </span>
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--gray-3)] border border-[var(--gray-4)] text-xs text-[var(--gray-10)]">
            <svg class="w-3.5 h-3.5 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Memory System
          </span>
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--gray-3)] border border-[var(--gray-4)] text-xs text-[var(--gray-10)]">
            <svg class="w-3.5 h-3.5 text-[var(--warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Spaced Repetition
          </span>
        </div>
      </div>
    {:else}
      <div class="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {#each chat.messages as message (message.id)}
          <ChatMessage {message} />
        {/each}

        {#if chat.isLoading}
          <div class="flex items-center gap-3 pl-10">
            <div class="flex gap-1.5">
              <span class="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce"></span>
              <span class="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce" style="animation-delay: 0.15s"></span>
              <span class="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce" style="animation-delay: 0.3s"></span>
            </div>
            <span class="text-xs text-[var(--gray-9)]">Thinking...</span>
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
