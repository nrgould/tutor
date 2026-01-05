<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { chatStore } from '$lib/stores/chat';
  import { settingsStore } from '$lib/stores/settings';
  import { parseMarkdown } from '$lib/utils/markdown';
  import type { Message, Conversation, ClaudeMessage, ClaudeContent } from '$lib/types';

  const chat = $derived($chatStore);
  const settings = $derived($settingsStore);

  let inputValue = $state('');
  let messagesContainer: HTMLDivElement;
  let screenContext = $state<string | null>(null);
  let isCapturing = $state(false);

  onMount(() => {
    const init = async () => {
      await settingsStore.load();

      // Get initial message from URL params
      const initialMessage = $page.url.searchParams.get('message');
      if (initialMessage) {
        await startNewConversation();
        await sendMessage(initialMessage);
      } else {
        await startNewConversation();
      }
    };

    init();

    // Listen for new messages from the bar
    const unlisten = listen<string>('new-message', async (event) => {
      await sendMessage(event.payload);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  });

  $effect(() => {
    if (messagesContainer && chat.messages.length > 0) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });

  async function startNewConversation() {
    try {
      const id = crypto.randomUUID();
      const conversation: Conversation = {
        id,
        started_at: new Date().toISOString(),
      };

      await invoke('create_conversation', {
        id: conversation.id,
        title: 'Chat Session',
        topic: null,
      });

      chatStore.setConversation(conversation);
    } catch (error) {
      console.error('Failed to start conversation:', error);
    }
  }

  async function captureScreen() {
    if (isCapturing) return;
    isCapturing = true;

    try {
      // Hide chat window briefly to capture behind it
      const window = getCurrentWindow();
      await window.hide();

      // Small delay to ensure window is hidden
      await new Promise(resolve => setTimeout(resolve, 100));

      const screenshot = await invoke<string>('capture_screen');
      screenContext = screenshot;

      await window.show();
      await window.setFocus();
    } catch (error) {
      console.error('Failed to capture screen:', error);
    } finally {
      isCapturing = false;
    }
  }

  function clearScreenContext() {
    screenContext = null;
  }

  async function sendMessage(content: string) {
    if (!content.trim() || chat.isLoading) return;
    if (!settings.anthropic_api_key) {
      chatStore.setError('Please add your Anthropic API key in settings');
      return;
    }

    const conversation = chat.currentConversation;
    if (!conversation) return;

    // Create user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      conversation_id: conversation.id,
      role: 'user',
      content: content.trim(),
      screen_context: screenContext ? {
        screenshot: screenContext,
        captured_at: new Date().toISOString(),
      } : undefined,
      created_at: new Date().toISOString(),
    };

    chatStore.addMessage(userMessage);
    chatStore.setLoading(true);
    inputValue = '';
    const capturedScreenContext = screenContext;
    screenContext = null;

    try {
      // Save user message
      await invoke('save_message', {
        id: userMessage.id,
        conversationId: userMessage.conversation_id,
        role: userMessage.role,
        content: userMessage.content,
        screenContext: userMessage.screen_context ? JSON.stringify(userMessage.screen_context) : null,
      });

      // Prepare API messages
      const apiMessages = prepareApiMessages(capturedScreenContext);

      // Create placeholder for assistant response
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        conversation_id: conversation.id,
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString(),
      };
      chatStore.addMessage(assistantMessage);

      // Stream response
      await streamResponse(apiMessages, assistantMessage);
    } catch (error) {
      console.error('Failed to send message:', error);
      chatStore.setError(error instanceof Error ? error.message : 'Failed to send message');
    }
  }

  function prepareApiMessages(capturedContext: string | null): ClaudeMessage[] {
    const messages: ClaudeMessage[] = [];

    for (const msg of chat.messages) {
      if (msg.role === 'user') {
        const content: ClaudeContent[] = [];

        // Add screen context if this is the last user message with one
        if (msg.screen_context?.screenshot || (msg === chat.messages[chat.messages.length - 2] && capturedContext)) {
          const screenshot = msg.screen_context?.screenshot || capturedContext;
          if (screenshot) {
            content.push({
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: screenshot }
            });
          }
        }

        content.push({ type: 'text', text: msg.content });
        messages.push({ role: 'user', content });
      } else if (msg.content) {
        messages.push({ role: 'assistant', content: msg.content });
      }
    }

    return messages;
  }

  async function streamResponse(messages: ClaudeMessage[], assistantMessage: Message) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.anthropic_api_key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        stream: true,
        system: `You are Eigen, a friendly and knowledgeable AI study companion. You help students learn and understand concepts by:
- Explaining things clearly and concisely
- Using examples and analogies when helpful
- Asking clarifying questions when needed
- Encouraging deeper understanding over memorization
- Being supportive but honest about areas for improvement

When the user shares their screen:
- Identify what they're working on
- Provide relevant help and explanations
- Notice if they might be stuck and offer hints

Keep responses focused and helpful. Be conversational but efficient.`,
        messages,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullContent += parsed.delta.text;
              chatStore.updateLastMessage(fullContent);
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    // Save assistant message
    await invoke('save_message', {
      id: assistantMessage.id,
      conversationId: assistantMessage.conversation_id,
      role: 'assistant',
      content: fullContent,
      screenContext: null,
    });

    chatStore.setLoading(false);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  }
</script>

<div class="chat-window">
  <!-- Header -->
  <div class="header">
    <h1>Chat</h1>
    <span class="message-count">{chat.messages.length} messages</span>
  </div>

  <!-- Messages -->
  <div class="messages" bind:this={messagesContainer}>
    {#if chat.messages.length === 0}
      <div class="empty-state">
        <div class="empty-icon">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
        </div>
        <p>Start a conversation</p>
        <span>Ask a question or share your screen for help</span>
      </div>
    {:else}
      {#each chat.messages as message (message.id)}
        <div class="message {message.role}">
          <div class="message-bubble">
            {#if message.screen_context?.screenshot}
              <div class="screenshot-preview">
                <img src="data:image/png;base64,{message.screen_context.screenshot}" alt="Screen capture" />
              </div>
            {/if}
            <div class="message-content markdown-content">
              {@html parseMarkdown(message.content || (chat.isLoading && message.role === 'assistant' ? '...' : ''))}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Error -->
  {#if chat.error}
    <div class="error">
      <span>{chat.error}</span>
      <button onclick={() => chatStore.setError(null)}>Dismiss</button>
    </div>
  {/if}

  <!-- Input -->
  <div class="input-area">
    {#if screenContext}
      <div class="screen-context-preview">
        <img src="data:image/png;base64,{screenContext}" alt="Screen context" />
        <button class="remove-context" onclick={clearScreenContext} title="Remove screen context" aria-label="Remove screen context">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    {/if}
    <div class="input-row">
      <button
        class="capture-btn {screenContext ? 'has-context' : ''}"
        onclick={captureScreen}
        disabled={isCapturing}
        title="Capture screen"
      >
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
        </svg>
      </button>
      <input
        type="text"
        bind:value={inputValue}
        placeholder="Ask anything..."
        onkeydown={handleKeydown}
        disabled={chat.isLoading}
      />
      <button
        class="send-btn"
        onclick={() => sendMessage(inputValue)}
        disabled={!inputValue.trim() || chat.isLoading}
        title="Send message"
        aria-label="Send message"
      >
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
        </svg>
      </button>
    </div>
  </div>
</div>

<style>
  .chat-window {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--gray-1);
    color: var(--gray-12);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--gray-4);
    background: var(--gray-2);
  }

  .header h1 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }

  .message-count {
    font-size: 12px;
    color: var(--gray-9);
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--gray-9);
    gap: 8px;
  }

  .empty-icon {
    width: 48px;
    height: 48px;
    color: var(--gray-6);
  }

  .empty-icon svg {
    width: 100%;
    height: 100%;
  }

  .empty-state p {
    font-size: 14px;
    color: var(--gray-11);
    margin: 0;
  }

  .empty-state span {
    font-size: 12px;
  }

  .message {
    display: flex;
    width: 100%;
  }

  .message.user {
    justify-content: flex-end;
  }

  .message.assistant {
    justify-content: flex-start;
  }

  .message-bubble {
    max-width: 85%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.5;
  }

  .message.user .message-bubble {
    background: var(--accent);
    color: white;
    border-bottom-right-radius: 4px;
  }

  .message.assistant .message-bubble {
    background: var(--gray-3);
    border-bottom-left-radius: 4px;
  }

  .screenshot-preview {
    margin-bottom: 8px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--gray-5);
  }

  .screenshot-preview img {
    width: 100%;
    max-height: 200px;
    object-fit: cover;
    display: block;
  }

  .message-content {
    word-break: break-word;
  }

  .error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: rgba(239, 68, 68, 0.1);
    border-top: 1px solid rgba(239, 68, 68, 0.2);
    color: var(--error);
    font-size: 12px;
  }

  .error button {
    padding: 4px 10px;
    background: transparent;
    border: 1px solid currentColor;
    border-radius: 4px;
    color: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  .input-area {
    padding: 12px 16px;
    border-top: 1px solid var(--gray-4);
    background: var(--gray-2);
  }

  .screen-context-preview {
    position: relative;
    margin-bottom: 8px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--accent);
  }

  .screen-context-preview img {
    width: 100%;
    max-height: 80px;
    object-fit: cover;
    display: block;
  }

  .remove-context {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
    padding: 0;
    background: rgba(0, 0, 0, 0.7);
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .remove-context svg {
    width: 12px;
    height: 12px;
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .capture-btn {
    width: 36px;
    height: 36px;
    padding: 0;
    background: var(--gray-4);
    border: none;
    border-radius: 8px;
    color: var(--gray-11);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .capture-btn:hover {
    background: var(--gray-5);
    color: white;
  }

  .capture-btn.has-context {
    background: var(--accent-muted);
    color: var(--accent);
  }

  .capture-btn svg {
    width: 18px;
    height: 18px;
  }

  .input-row input {
    flex: 1;
    padding: 10px 14px;
    background: var(--gray-3);
    border: 1px solid var(--gray-4);
    border-radius: 8px;
    color: var(--gray-12);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }

  .input-row input:focus {
    border-color: var(--accent);
  }

  .input-row input::placeholder {
    color: var(--gray-8);
  }

  .send-btn {
    width: 36px;
    height: 36px;
    padding: 0;
    background: var(--accent);
    border: none;
    border-radius: 8px;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .send-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .send-btn svg {
    width: 18px;
    height: 18px;
  }
</style>
