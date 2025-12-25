<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { chatStore } from '$lib/stores/chat';
  import { settingsStore } from '$lib/stores/settings';
  import { recordingStore } from '$lib/stores/recording';
  import { streamChat } from '$lib/utils/api';
  import { createConversation, saveMessage, getConversations, getMessages } from '$lib/utils/db';
  import { processConversationMemories, getTopics } from '$lib/services/memoryService';
  import { getTopicsDueForReview } from '$lib/utils/spacedRepetition';
  import { notifyReviewDue, ensureNotificationPermission } from '$lib/services/notificationService';
  import ChatMessage from '$lib/components/overlay/ChatMessage.svelte';
  import ChatInput from '$lib/components/overlay/ChatInput.svelte';
  import ConversationHistory from '$lib/components/ConversationHistory.svelte';
  import RecordingIndicator from '$lib/components/recording/RecordingIndicator.svelte';
  import SessionsPanel from '$lib/components/recording/SessionsPanel.svelte';
  import type { Message, ScreenContext } from '$lib/types';

  const appWindow = getCurrentWindow();

  function minimizeWindow() {
    appWindow.minimize();
  }

  function closeWindow() {
    appWindow.hide();
  }

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
  let showSessions = $state(false);
  let showReviewBanner = $state(true);
  let topicsDue = $state<TopicInfo[]>([]);

  const chat = $derived($chatStore);
  const settings = $derived($settingsStore);

  onMount(() => {
    const init = async () => {
      await settingsStore.load();
      await recordingStore.init();

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
    };

    init();

    return () => {
      recordingStore.cleanup();
    };
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

<div class="h-full flex flex-col bg-[var(--gray-1)] rounded-xl overflow-hidden">
  <!-- Titlebar with drag region -->
  <div
    class="flex items-center justify-between h-8 bg-[var(--gray-2)] border-b border-[var(--gray-4)] select-none"
    data-tauri-drag-region
  >
    <div class="flex items-center gap-2 pl-3" data-tauri-drag-region>
      <div class="w-3 h-3 rounded-full bg-[var(--accent)]"></div>
      <span class="text-xs font-medium text-[var(--gray-10)]" data-tauri-drag-region>Eigen</span>
    </div>
    <div class="flex items-center">
      <button
        class="w-8 h-8 flex items-center justify-center text-[var(--gray-9)] hover:bg-[var(--gray-4)] transition-colors"
        onclick={minimizeWindow}
        aria-label="Minimize"
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
        </svg>
      </button>
      <button
        class="w-8 h-8 flex items-center justify-center text-[var(--gray-9)] hover:bg-[var(--error)] hover:text-white transition-colors"
        onclick={closeWindow}
        aria-label="Close"
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Toolbar -->
  <div class="flex items-center justify-between px-3 py-2 border-b border-[var(--gray-4)] bg-[var(--gray-2)]">
    <div class="flex items-center gap-1">
      <button
        class="p-2 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
        onclick={() => (showHistory = true)}
        title="History"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      <button
        class="p-2 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
        onclick={startNewConversation}
        title="New chat"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
      <div class="w-px h-4 bg-[var(--gray-5)] mx-1"></div>
      <RecordingIndicator />
      <button
        class="p-2 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
        onclick={() => (showSessions = true)}
        title="Recording sessions"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>
    </div>

    <div class="flex items-center gap-1">
      <a
        href="/dashboard"
        class="p-2 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
        title="Dashboard"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      </a>
      <a
        href="/study"
        class="p-2 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
        title="Study"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
        </svg>
      </a>
      <a
        href="/notes"
        class="p-2 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
        title="Notes"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      </a>
      <a
        href="/courses"
        class="p-2 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
        title="Courses"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      </a>
      <a
        href="/settings"
        class="p-2 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
        title="Settings"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </a>
    </div>
  </div>

  <!-- Review Reminder Banner -->
  {#if showReviewBanner && topicsDue.length > 0 && chat.messages.length === 0}
    <div class="px-3 py-2 bg-[var(--warning)]/10 border-b border-[var(--warning)]/20">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-[var(--warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-xs font-medium text-[var(--warning)]">
            {topicsDue.length} topic{topicsDue.length > 1 ? 's' : ''} due
          </span>
        </div>
        <div class="flex items-center gap-2">
          <a
            href="/dashboard"
            class="px-3 py-1 text-xs font-medium rounded-lg bg-[var(--warning)] text-[var(--gray-1)] hover:opacity-90 transition-opacity"
          >
            Review
          </a>
          <button
            class="text-[var(--gray-9)] hover:text-[var(--gray-11)]"
            onclick={() => (showReviewBanner = false)}
            aria-label="Dismiss reminder"
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
      <div class="h-full flex flex-col items-center justify-center text-center px-4 py-8">
        <div class="w-12 h-12 rounded-xl bg-[var(--accent)] flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
          </svg>
        </div>

        <h1 class="text-lg font-semibold text-[var(--gray-12)] mb-1">
          AI Study Companion
        </h1>
        <p class="text-sm text-[var(--gray-10)] max-w-xs mb-6">
          Capture your screen, ask questions, and master any subject.
        </p>

        {#if !settings.anthropic_api_key}
          <a
            href="/settings"
            class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
            Add API Key
          </a>
        {:else}
          <div class="flex flex-wrap justify-center gap-2">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--gray-3)] border border-[var(--gray-4)] text-xs text-[var(--gray-10)]">
              <svg class="w-3 h-3 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              </svg>
              Screenshot
            </span>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--gray-3)] border border-[var(--gray-4)] text-xs text-[var(--gray-10)]">
              <svg class="w-3 h-3 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Memory
            </span>
          </div>
        {/if}
      </div>
    {:else}
      <div class="px-4 py-4 space-y-4">
        {#each chat.messages as message (message.id)}
          <ChatMessage {message} />
        {/each}

        {#if chat.isLoading}
          <div class="flex items-center gap-2 pl-10">
            <div class="flex gap-1">
              <span class="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce"></span>
              <span class="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce" style="animation-delay: 0.15s"></span>
              <span class="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce" style="animation-delay: 0.3s"></span>
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

<!-- Recording Sessions Panel -->
<SessionsPanel open={showSessions} onclose={() => (showSessions = false)} />
