<script lang="ts">
  import { onMount } from 'svelte';
  import { chatStore } from '$lib/stores/chat';
  import { settingsStore } from '$lib/stores/settings';
  import { streamChat } from '$lib/utils/api';
  import { createConversation, saveMessage, getConversations, getMessages } from '$lib/utils/db';
  import ChatMessage from '$lib/components/overlay/ChatMessage.svelte';
  import ChatInput from '$lib/components/overlay/ChatInput.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import type { Message, ScreenContext } from '$lib/types';

  let messagesContainer: HTMLDivElement;
  let showSettings = $state(false);
  let apiKeyInput = $state('');
  let apiKeyError = $state('');

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
  });

  async function startNewConversation() {
    try {
      const conversation = await createConversation();
      chatStore.setConversation(conversation);
      chatStore.setMessages([]);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  }

  async function handleSendMessage(content: string, screenshot?: string) {
    if (!settings.anthropic_api_key) {
      showSettings = true;
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
      // Get all messages for context
      const allMessages = [...chat.messages, userMessage];

      // Stream the response
      for await (const chunk of streamChat(allMessages)) {
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

  async function handleSaveApiKey() {
    if (!apiKeyInput.trim()) {
      apiKeyError = 'Please enter an API key';
      return;
    }

    try {
      await settingsStore.setApiKey('anthropic_api_key', apiKeyInput.trim());
      showSettings = false;
      apiKeyInput = '';
      apiKeyError = '';
    } catch {
      apiKeyError = 'Failed to save API key';
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
      <div class="w-8 h-8 rounded-lg bg-tutor-accent flex items-center justify-center">
        <span class="text-white font-bold text-sm">T</span>
      </div>
      <span class="font-semibold text-tutor-text">Tutor</span>
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

      <button
        class="p-2 rounded-lg text-tutor-text-secondary hover:text-tutor-text hover:bg-tutor-border/50 transition-colors"
        onclick={() => (showSettings = true)}
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
      </button>
    </div>
  </div>

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
          <Button class="mt-4" onclick={() => (showSettings = true)}>Set up API key</Button>
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

<!-- Settings Modal -->
<Modal bind:open={showSettings} title="Settings">
  <div class="space-y-4">
    <div>
      <label for="api-key" class="block text-sm font-medium text-tutor-text mb-1">
        Anthropic API Key
      </label>
      <input
        id="api-key"
        type="password"
        bind:value={apiKeyInput}
        placeholder={settings.anthropic_api_key ? '••••••••••••••••' : 'sk-ant-...'}
        class="w-full px-3 py-2 text-sm rounded-lg border border-tutor-border bg-tutor-surface text-tutor-text
          placeholder:text-tutor-text-secondary
          focus:outline-none focus:ring-2 focus:ring-tutor-accent focus:border-transparent"
      />
      {#if apiKeyError}
        <p class="mt-1 text-sm text-red-500">{apiKeyError}</p>
      {/if}
      <p class="mt-1 text-xs text-tutor-text-secondary">
        Get your API key from <a
          href="https://console.anthropic.com"
          target="_blank"
          class="text-tutor-accent hover:underline">console.anthropic.com</a
        >
      </p>
    </div>

    <div class="flex gap-2 justify-end">
      <Button variant="secondary" onclick={() => (showSettings = false)}>Cancel</Button>
      <Button onclick={handleSaveApiKey}>Save</Button>
    </div>
  </div>
</Modal>
