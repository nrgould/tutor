<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { chatStore } from '$lib/stores/chat';
  import { settingsStore } from '$lib/stores/settings';
  import { recordingStore } from '$lib/stores/recording';
  import { parseMarkdown } from '$lib/utils/markdown';
  import type { Message, Conversation, ClaudeMessage, ClaudeContent } from '$lib/types';

  const chat = $derived($chatStore);
  const settings = $derived($settingsStore);
  const recording = $derived($recordingStore);

  let inputValue = $state('');
  let messagesContainer: HTMLDivElement;
  let screenContext = $state<string | null>(null);
  let isCapturing = $state(false);
  let useScreen = $state(false);
  let activeTab = $state<'chat' | 'transcript'>('chat');

  // Quick actions
  const quickActions = [
    { label: 'Explain this', icon: 'lightbulb', prompt: 'Can you explain what I\'m looking at on my screen?' },
    { label: 'Help me understand', icon: 'question', prompt: 'I\'m stuck. Can you help me understand this concept?' },
    { label: 'Quiz me', icon: 'academic', prompt: 'Quiz me on what I\'ve been studying.' },
    { label: 'Summarize', icon: 'document', prompt: 'Summarize what I\'ve been working on.' },
  ];

  onMount(() => {
    const init = async () => {
      await settingsStore.load();
      await recordingStore.init();

      const initialMessage = $page.url.searchParams.get('message');
      if (initialMessage) {
        await startNewConversation();
        await sendMessage(initialMessage);
      } else {
        await startNewConversation();
      }
    };

    init();

    const unlisten = listen<string>('new-message', async (event) => {
      await sendMessage(event.payload);
    });

    return () => {
      unlisten.then(fn => fn());
      // Ensure recording stops if component unmounts unexpectedly
      if (recording.status.is_recording) {
        recordingStore.stopRecording().catch(console.error);
      }
      chatStore.clear();
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
      const window = getCurrentWindow();
      await window.hide();
      await new Promise(resolve => setTimeout(resolve, 100));

      const screenshot = await invoke<string>('capture_screen');
      screenContext = screenshot;
      useScreen = true;

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
    useScreen = false;
  }

  async function handleQuickAction(prompt: string) {
    if (useScreen && !screenContext) {
      await captureScreen();
    }
    await sendMessage(prompt);
  }

  async function sendMessage(content: string) {
    if (!content.trim() || chat.isLoading) return;
    if (!settings.anthropic_api_key) {
      chatStore.setError('Please add your Anthropic API key in settings');
      return;
    }

    const conversation = chat.currentConversation;
    if (!conversation) return;

    // Capture screen if useScreen is enabled
    if (useScreen && !screenContext) {
      await captureScreen();
    }

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
      await invoke('save_message', {
        id: userMessage.id,
        conversationId: userMessage.conversation_id,
        role: userMessage.role,
        content: userMessage.content,
        screenContext: userMessage.screen_context ? JSON.stringify(userMessage.screen_context) : null,
      });

      const apiMessages = prepareApiMessages(capturedScreenContext);

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        conversation_id: conversation.id,
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString(),
      };
      chatStore.addMessage(assistantMessage);

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
        system: `You are Eigen, a friendly AI study companion. Help students learn by:
- Explaining concepts clearly with examples
- Asking clarifying questions when needed
- Encouraging understanding over memorization
- Being supportive but honest

When the user shares their screen, identify what they're working on and provide relevant help.

Keep responses focused and conversational.`,
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

  async function startDrag(e: MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;

    try {
      const window = getCurrentWindow();
      await window.startDragging();
    } catch (error) {
      console.error('Failed to start dragging:', error);
    }
  }

  async function closeWindow() {
    // Stop recording if active
    if (recording.status.is_recording) {
      try {
        await recordingStore.stopRecording();
      } catch (e) {
        console.error('Failed to stop recording on close:', e);
      }
    }

    // Clear chat state so next window starts fresh
    chatStore.clear();

    const window = getCurrentWindow();
    await window.close();
  }

  async function minimizeWindow() {
    const window = getCurrentWindow();
    await window.minimize();
  }
</script>

<div class="chat-window">
  <!-- Custom titlebar -->
  <div class="titlebar" onmousedown={startDrag} role="toolbar" aria-label="Window controls" tabindex="0">
    <div class="titlebar-left">
      <div class="window-controls">
        <button class="window-btn close" onclick={closeWindow} title="Close" aria-label="Close"></button>
        <button class="window-btn minimize" onclick={minimizeWindow} title="Minimize" aria-label="Minimize"></button>
        <button class="window-btn maximize" title="Maximize" aria-label="Maximize" disabled></button>
      </div>
    </div>

    <div class="titlebar-center">
      <div class="tabs">
        <button class="tab {activeTab === 'chat' ? 'active' : ''}" onclick={() => activeTab = 'chat'}>Chat</button>
        <button class="tab {activeTab === 'transcript' ? 'active' : ''}" onclick={() => activeTab = 'transcript'}>Transcript</button>
      </div>
    </div>

    <div class="titlebar-right">
      {#if screenContext}
        <span class="screen-badge">Screen attached</span>
      {/if}
    </div>
  </div>

  <!-- Messages area -->
  <div class="messages" bind:this={messagesContainer}>
    {#if chat.messages.length === 0}
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
        </div>
        <h2>Ready to help</h2>
        <p>Ask a question or use a quick action below</p>
      </div>
    {:else}
      {#each chat.messages as message (message.id)}
        <div class="message {message.role}">
          {#if message.role === 'user'}
            <div class="message-pill">
              {#if message.screen_context?.screenshot}
                <span class="has-screen">📷</span>
              {/if}
              {message.content}
            </div>
          {:else}
            <div class="message-content">
              {@html parseMarkdown(message.content || (chat.isLoading ? '...' : ''))}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <!-- Quick actions -->
  {#if chat.messages.length === 0 || !chat.isLoading}
    <div class="quick-actions">
      {#each quickActions as action}
        <button class="quick-action" onclick={() => handleQuickAction(action.prompt)}>
          {#if action.icon === 'lightbulb'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
          {:else if action.icon === 'question'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          {:else if action.icon === 'academic'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          {/if}
          {action.label}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Error -->
  {#if chat.error}
    <div class="error">
      <span>{chat.error}</span>
      <button onclick={() => chatStore.setError(null)}>×</button>
    </div>
  {/if}

  <!-- Input area -->
  <div class="input-area">
    {#if screenContext}
      <div class="screen-preview">
        <img src="data:image/png;base64,{screenContext}" alt="Screen" />
        <button class="remove-screen" onclick={clearScreenContext} title="Remove" aria-label="Remove screenshot">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    {/if}

    <div class="input-row">
      <input
        type="text"
        bind:value={inputValue}
        placeholder="Ask about your screen or type a question..."
        onkeydown={handleKeydown}
        disabled={chat.isLoading}
      />

      <div class="input-actions">
        <button
          class="use-screen-btn {useScreen ? 'active' : ''}"
          onclick={() => useScreen = !useScreen}
          title={useScreen ? 'Disable screen capture' : 'Enable screen capture'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
          </svg>
          Use Screen
        </button>

        <button
          class="send-btn"
          onclick={() => sendMessage(inputValue)}
          disabled={!inputValue.trim() || chat.isLoading}
          title="Send"
          aria-label="Send message"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
  }

  .chat-window {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: rgba(28, 28, 30, 0.98);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    overflow: hidden;
  }

  /* Titlebar */
  .titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    cursor: grab;
    -webkit-app-region: drag;
  }

  .titlebar:active {
    cursor: grabbing;
  }

  .titlebar-left,
  .titlebar-right {
    flex: 1;
    display: flex;
    align-items: center;
  }

  .titlebar-right {
    justify-content: flex-end;
  }

  .window-controls {
    display: flex;
    gap: 8px;
    -webkit-app-region: no-drag;
  }

  .window-btn {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .window-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .window-btn.close {
    background: #ff5f57;
  }

  .window-btn.minimize {
    background: #febc2e;
  }

  .window-btn.maximize {
    background: #28c840;
  }

  .tabs {
    display: flex;
    gap: 4px;
    background: rgba(255, 255, 255, 0.06);
    padding: 3px;
    border-radius: 8px;
  }

  .tab {
    padding: 6px 14px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    -webkit-app-region: no-drag;
  }

  .tab:hover {
    color: rgba(255, 255, 255, 0.8);
  }

  .tab.active {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .screen-badge {
    font-size: 11px;
    color: #30d158;
    background: rgba(48, 209, 88, 0.15);
    padding: 4px 8px;
    border-radius: 4px;
  }

  /* Messages */
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 32px;
  }

  .empty-icon {
    width: 48px;
    height: 48px;
    color: rgba(255, 255, 255, 0.2);
    margin-bottom: 16px;
  }

  .empty-icon svg {
    width: 100%;
    height: 100%;
  }

  .empty-state h2 {
    font-size: 18px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    margin: 0 0 8px 0;
  }

  .empty-state p {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.5);
    margin: 0;
  }

  .message {
    display: flex;
    width: 100%;
  }

  .message.user {
    justify-content: flex-end;
  }

  .message-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 80%;
    padding: 10px 14px;
    background: #0a84ff;
    border-radius: 18px;
    border-bottom-right-radius: 4px;
    color: white;
    font-size: 14px;
    line-height: 1.4;
  }

  .has-screen {
    font-size: 12px;
  }

  .message-content {
    max-width: 85%;
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
    line-height: 1.5;
  }

  .message-content :global(p) {
    margin: 0 0 12px 0;
  }

  .message-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .message-content :global(code) {
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
  }

  .message-content :global(pre) {
    background: rgba(0, 0, 0, 0.3);
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
  }

  .message-content :global(pre code) {
    background: none;
    padding: 0;
  }

  /* Quick actions */
  .quick-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 16px 12px;
  }

  .quick-action {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .quick-action:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border-color: rgba(255, 255, 255, 0.15);
  }

  .quick-action svg {
    width: 16px;
    height: 16px;
  }

  /* Error */
  .error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: rgba(255, 69, 58, 0.15);
    color: #ff453a;
    font-size: 13px;
  }

  .error button {
    background: none;
    border: none;
    color: #ff453a;
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
  }

  /* Input area */
  .input-area {
    padding: 12px 16px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .screen-preview {
    position: relative;
    margin-bottom: 10px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(48, 209, 88, 0.3);
  }

  .screen-preview img {
    width: 100%;
    max-height: 100px;
    object-fit: cover;
    display: block;
  }

  .remove-screen {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
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

  .remove-screen svg {
    width: 14px;
    height: 14px;
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 6px 8px 6px 14px;
  }

  .input-row input {
    flex: 1;
    background: none;
    border: none;
    color: white;
    font-size: 14px;
    outline: none;
  }

  .input-row input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .input-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .use-screen-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.08);
    border: none;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .use-screen-btn svg {
    width: 14px;
    height: 14px;
  }

  .use-screen-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.9);
  }

  .use-screen-btn.active {
    background: rgba(48, 209, 88, 0.2);
    color: #30d158;
  }

  .send-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    background: #0a84ff;
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
    background: #409cff;
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .send-btn svg {
    width: 16px;
    height: 16px;
  }
</style>
