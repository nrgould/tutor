<script lang="ts">
  import { onMount } from 'svelte';
  import { settingsStore } from '$lib/stores/settings';
  import { chatStore } from '$lib/stores/chat';
  import { streamChat } from '$lib/utils/api';
  import { createConversation, saveMessage, getMessages, getConversations, getSetting, setSetting } from '$lib/utils/db';
  import { processConversationMemories } from '$lib/services/memoryService';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import type { Message, ScreenContext } from '$lib/types';
  import ChatMessage from '$lib/components/overlay/ChatMessage.svelte';
  import Onboarding from '$lib/components/Onboarding.svelte';

  const settings = $derived($settingsStore);
  const chat = $derived($chatStore);

  // UI State
  let isExpanded = $state(false);
  let inputValue = $state('');
  let isWatching = $state(false);
  let watchDuration = $state(0);
  let messagesContainer: HTMLDivElement;
  let showOnboarding = $state(false);
  let checkingOnboarding = $state(true);

  // Watching state
  let screenshotBuffer = $state<string[]>([]);
  let watchInterval: ReturnType<typeof setInterval> | null = null;
  let durationInterval: ReturnType<typeof setInterval> | null = null;
  let lastVLMContext = $state<string>('');
  let isProcessingBatch = $state(false);

  // Proactive notifications
  let proactiveMessage = $state<string | null>(null);
  let showProactiveToast = $state(false);

  onMount(() => {
    const init = async () => {
      await settingsStore.load();

      // Check onboarding
      try {
        const onboardingComplete = await getSetting('onboarding_complete');
        if (!onboardingComplete) {
          showOnboarding = true;
        }
      } catch {
        showOnboarding = true;
      }
      checkingOnboarding = false;

      // Load most recent conversation
      try {
        const conversations = await getConversations(1);
        if (conversations.length > 0) {
          chatStore.setConversation(conversations[0]);
          const msgs = await getMessages(conversations[0].id);
          chatStore.setMessages(msgs);
        } else {
          await startNewConversation();
        }
      } catch {
        await startNewConversation();
      }
    };

    init();

    return () => {
      stopWatching();
    };
  });

  async function startNewConversation() {
    try {
      if (chat.currentConversation && chat.messages.length >= 4) {
        processConversationMemories(chat.messages, chat.currentConversation.id).catch(console.warn);
      }
      const conversation = await createConversation();
      chatStore.setConversation(conversation);
      chatStore.setMessages([]);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  }

  async function handleOnboardingComplete(profile: { name: string; courses: string[]; goals: string }) {
    await setSetting('onboarding_complete', 'true');
    if (profile.name) await setSetting('user_name', profile.name);
    if (profile.courses.length > 0) await setSetting('user_courses', JSON.stringify(profile.courses));
    if (profile.goals) await setSetting('user_goals', profile.goals);
    showOnboarding = false;
  }

  // Watching functions
  async function startWatching() {
    if (isWatching) return;
    isWatching = true;
    watchDuration = 0;
    screenshotBuffer = [];

    // Duration timer
    durationInterval = setInterval(() => {
      watchDuration++;
    }, 1000);

    // Screenshot every second
    watchInterval = setInterval(async () => {
      try {
        const screenshot = await invoke<string>('capture_screen');
        screenshotBuffer = [...screenshotBuffer, screenshot];

        // Process batch when we have 5 screenshots
        if (screenshotBuffer.length >= 5 && !isProcessingBatch) {
          processBatch();
        }
      } catch (error) {
        console.error('Screenshot failed:', error);
      }
    }, 1000);
  }

  function stopWatching() {
    isWatching = false;
    if (watchInterval) {
      clearInterval(watchInterval);
      watchInterval = null;
    }
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }
    if (screenshotBuffer.length > 0 && !isProcessingBatch) {
      processBatch();
    }
  }

  async function processBatch() {
    if (screenshotBuffer.length === 0 || isProcessingBatch) return;

    isProcessingBatch = true;
    const batch = [...screenshotBuffer];
    screenshotBuffer = [];

    try {
      const context = await analyzeScreenshots(batch);
      if (context) {
        lastVLMContext = context;

        if (context.includes('[SUGGESTION]')) {
          const suggestion = context.split('[SUGGESTION]')[1]?.trim();
          if (suggestion) {
            proactiveMessage = suggestion;
            showProactiveToast = true;
          }
        }
      }
    } catch (error) {
      console.error('Batch processing failed:', error);
    } finally {
      isProcessingBatch = false;
    }
  }

  async function analyzeScreenshots(screenshots: string[]): Promise<string> {
    if (!settings.anthropic_api_key) return '';

    const recentScreenshot = screenshots[screenshots.length - 1];

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.anthropic_api_key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: `You are a study assistant watching a student's screen. Briefly describe what they're working on (1-2 sentences). If you notice they might be stuck or could benefit from a tip, add [SUGGESTION] followed by a helpful hint. Be concise.`,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: recentScreenshot }
              },
              { type: 'text', text: 'What is the student working on? Any suggestions?' }
            ]
          }]
        })
      });

      const data = await response.json();
      return data.content?.[0]?.text || '';
    } catch {
      return '';
    }
  }

  async function handleSend() {
    const message = inputValue.trim();
    if (!message || !settings.anthropic_api_key) return;

    inputValue = '';
    isExpanded = true;

    // Resize window for chat
    const window = getCurrentWindow();
    await window.setSize(new (await import('@tauri-apps/api/dpi')).LogicalSize(600, 500));

    if (!chat.currentConversation) {
      await startNewConversation();
    }

    let screenContext: ScreenContext | undefined;
    if (isWatching) {
      try {
        const screenshot = await invoke<string>('capture_screen');
        screenContext = { screenshot, captured_at: new Date().toISOString() };
      } catch {}
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      conversation_id: chat.currentConversation!.id,
      role: 'user',
      content: message,
      screen_context: screenContext,
      created_at: new Date().toISOString()
    };

    chatStore.addMessage(userMessage);
    await saveMessage(chat.currentConversation!.id, 'user', message, screenContext);

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      conversation_id: chat.currentConversation!.id,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString()
    };

    chatStore.addMessage(assistantMessage);
    chatStore.setLoading(true);

    try {
      const messagesToSend = [...chat.messages.slice(0, -1)];
      for await (const chunk of streamChat(messagesToSend)) {
        chatStore.appendToLastMessage(chunk);
        scrollToBottom();
      }
      const finalMessage = $chatStore.messages[$chatStore.messages.length - 1];
      await saveMessage(chat.currentConversation!.id, 'assistant', finalMessage.content, undefined);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      chatStore.updateLastMessage(`Error: ${errorMessage}`);
    } finally {
      chatStore.setLoading(false);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      collapseChat();
    }
  }

  async function collapseChat() {
    isExpanded = false;
    // Resize window back to bar only
    const window = getCurrentWindow();
    await window.setSize(new (await import('@tauri-apps/api/dpi')).LogicalSize(600, 60));
  }

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function handleProactiveClick() {
    if (proactiveMessage) {
      inputValue = proactiveMessage;
      showProactiveToast = false;
      proactiveMessage = null;
      isExpanded = true;
    }
  }

  function dismissProactive() {
    showProactiveToast = false;
    proactiveMessage = null;
  }

  $effect(() => {
    if (chat.messages.length > 0) {
      scrollToBottom();
    }
  });

  // Set initial window size on mount
  onMount(async () => {
    const window = getCurrentWindow();
    await window.setSize(new (await import('@tauri-apps/api/dpi')).LogicalSize(600, 60));
  });
</script>

<!-- Floating Bar - the entire visible UI -->
<div class="floating-container">
  <!-- Main floating bar - draggable -->
  <div class="floating-bar" data-tauri-drag-region>
    <!-- Watch toggle -->
    <button
      class="watch-btn {isWatching ? 'active' : ''}"
      onclick={() => isWatching ? stopWatching() : startWatching()}
      title={isWatching ? 'Stop session' : 'Start session'}
    >
      {#if isWatching}
        <span class="pulse-dot">
          <span class="pulse-ring"></span>
          <span class="pulse-core"></span>
        </span>
        <span class="watch-time">{formatDuration(watchDuration)}</span>
      {:else}
        <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
        <span>Start</span>
      {/if}
    </button>

    <!-- Divider -->
    <div class="divider"></div>

    <!-- Input -->
    <input
      type="text"
      bind:value={inputValue}
      placeholder="Ask anything..."
      class="chat-input"
      onkeydown={handleKeydown}
    />

    <!-- Send button -->
    <button
      class="icon-btn accent"
      onclick={handleSend}
      disabled={!inputValue.trim() || chat.isLoading}
      title="Send"
    >
      <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
      </svg>
    </button>

    <!-- Expand/collapse -->
    {#if chat.messages.length > 0}
      <button
        class="icon-btn"
        onclick={() => isExpanded ? collapseChat() : (isExpanded = true)}
        title={isExpanded ? 'Collapse' : 'Expand'}
      >
        <svg class="icon {isExpanded ? 'rotate' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    {/if}

    <!-- Settings -->
    <a href="/settings" class="icon-btn" title="Settings">
      <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </a>

    <!-- History -->
    <a href="/history" class="icon-btn" title="History">
      <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </a>
  </div>

  <!-- Expanded chat panel -->
  {#if isExpanded && chat.messages.length > 0}
    <div class="chat-panel">
      <div bind:this={messagesContainer} class="messages">
        {#each chat.messages as message (message.id)}
          <ChatMessage {message} />
        {/each}

        {#if chat.isLoading}
          <div class="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- Proactive toast notification -->
{#if showProactiveToast && proactiveMessage}
  <div class="toast">
    <div class="toast-icon">
      <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    </div>
    <div class="toast-content">
      <p>{proactiveMessage}</p>
      <div class="toast-actions">
        <button class="toast-btn primary" onclick={handleProactiveClick}>Ask about this</button>
        <button class="toast-btn" onclick={dismissProactive}>Dismiss</button>
      </div>
    </div>
  </div>
{/if}

<!-- Onboarding -->
{#if showOnboarding && !checkingOnboarding}
  <Onboarding oncomplete={handleOnboardingComplete} />
{/if}

<style>
  .floating-container {
    display: flex;
    flex-direction: column;
    padding: 8px;
    height: 100%;
  }

  .floating-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(25, 25, 27, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    cursor: grab;
  }

  .floating-bar:active {
    cursor: grabbing;
  }

  .watch-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: none;
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .watch-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
  }

  .watch-btn.active {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  .pulse-dot {
    position: relative;
    width: 8px;
    height: 8px;
  }

  .pulse-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: #ef4444;
    animation: pulse 1.5s ease-out infinite;
  }

  .pulse-core {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: #ef4444;
  }

  @keyframes pulse {
    0% { transform: scale(1); opacity: 0.8; }
    100% { transform: scale(2.5); opacity: 0; }
  }

  .watch-time {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .divider {
    width: 1px;
    height: 20px;
    background: rgba(255, 255, 255, 0.1);
  }

  .chat-input {
    flex: 1;
    min-width: 200px;
    padding: 6px 12px;
    background: transparent;
    border: none;
    color: white;
    font-size: 13px;
    outline: none;
  }

  .chat-input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
  }

  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .icon-btn.accent {
    background: #3b82f6;
    color: white;
  }

  .icon-btn.accent:hover {
    background: #2563eb;
  }

  .icon-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .icon {
    width: 16px;
    height: 16px;
    transition: transform 0.2s;
  }

  .icon.rotate {
    transform: rotate(180deg);
  }

  .chat-panel {
    flex: 1;
    margin-top: 8px;
    background: rgba(25, 25, 27, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    overflow: hidden;
  }

  .messages {
    height: 100%;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .loading-dots {
    display: flex;
    gap: 4px;
    padding-left: 40px;
  }

  .loading-dots span {
    width: 6px;
    height: 6px;
    background: #3b82f6;
    border-radius: 50%;
    animation: bounce 1s infinite;
  }

  .loading-dots span:nth-child(2) { animation-delay: 0.15s; }
  .loading-dots span:nth-child(3) { animation-delay: 0.3s; }

  @keyframes bounce {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-6px); }
  }

  .toast {
    position: fixed;
    bottom: 16px;
    right: 16px;
    display: flex;
    gap: 12px;
    padding: 16px;
    background: rgba(25, 25, 27, 0.98);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    max-width: 320px;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .toast-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(59, 130, 246, 0.15);
    border-radius: 50%;
    color: #3b82f6;
    flex-shrink: 0;
  }

  .toast-content p {
    margin: 0 0 12px 0;
    color: white;
    font-size: 13px;
    line-height: 1.5;
  }

  .toast-actions {
    display: flex;
    gap: 8px;
  }

  .toast-btn {
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .toast-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    color: white;
  }

  .toast-btn.primary {
    background: #3b82f6;
    color: white;
  }

  .toast-btn.primary:hover {
    background: #2563eb;
  }
</style>
