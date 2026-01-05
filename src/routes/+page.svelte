<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { settingsStore } from '$lib/stores/settings';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getSetting, setSetting } from '$lib/utils/db';
  import { streamChat, analyzeScreenBatch } from '$lib/utils/api';
  import { parseMarkdown } from '$lib/utils/markdown';
  import type { Message } from '$lib/types';
  import Onboarding from '$lib/components/Onboarding.svelte';

  const settings = $derived($settingsStore);

  // UI State
  let inputValue = $state('');
  let isRecording = $state(false);
  let recordingDuration = $state(0);
  let showOnboarding = $state(false);
  let checkingOnboarding = $state(true);

  // Chat state
  let showChat = $state(false);
  let messages = $state<Array<{id: string, role: 'user' | 'assistant', content: string, hasScreen?: boolean}>>([]);
  let isLoading = $state(false);
  let streamingContent = $state('');

  // Recording state
  let screenshotBuffer = $state<string[]>([]);
  let latestScreenshot = $state<string | null>(null);
  let screenContext = $state<string | null>(null); // What VLM sees on screen
  let watchInterval: ReturnType<typeof setInterval> | null = null;
  let durationInterval: ReturnType<typeof setInterval> | null = null;
  let isProcessingBatch = $state(false);

  // Refs
  let messagesContainer: HTMLDivElement;
  let inputRef: HTMLInputElement;

  const BAR_HEIGHT = 54;
  const CHAT_HEIGHT = 380;

  onMount(() => {
    const init = async () => {
      await settingsStore.load();
      await restoreBarPosition();

      try {
        const onboardingComplete = await getSetting('onboarding_complete');
        if (!onboardingComplete) {
          showOnboarding = true;
        }
      } catch {
        showOnboarding = true;
      }
      checkingOnboarding = false;
    };

    init();

    const window = getCurrentWindow();
    const unlistenMove = window.onMoved(async (event) => {
      await setSetting('bar_position_x', String(event.payload.x));
      await setSetting('bar_position_y', String(event.payload.y));
    });

    return () => {
      stopRecording();
      unlistenMove.then(fn => fn());
    };
  });

  async function restoreBarPosition() {
    try {
      const x = await getSetting('bar_position_x');
      const y = await getSetting('bar_position_y');
      if (x && y) {
        const window = getCurrentWindow();
        const { LogicalPosition } = await import('@tauri-apps/api/dpi');
        await window.setPosition(new LogicalPosition(parseInt(x), parseInt(y)));
      }
    } catch {
      // Use default position
    }
  }

  async function handleOnboardingComplete(profile: { name: string; courses: string[]; goals: string }) {
    await setSetting('onboarding_complete', 'true');
    if (profile.name) await setSetting('user_name', profile.name);
    if (profile.courses.length > 0) await setSetting('user_courses', JSON.stringify(profile.courses));
    if (profile.goals) await setSetting('user_goals', profile.goals);
    showOnboarding = false;
  }

  async function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  async function startRecording() {
    if (isRecording) return;
    isRecording = true;
    recordingDuration = 0;
    screenshotBuffer = [];

    durationInterval = setInterval(() => {
      recordingDuration++;
    }, 1000);

    watchInterval = setInterval(async () => {
      try {
        const screenshot = await invoke<string>('capture_screen_silent');
        latestScreenshot = screenshot;
        screenshotBuffer = [...screenshotBuffer, screenshot];

        if (screenshotBuffer.length >= 5 && !isProcessingBatch) {
          processBatch();
        }
      } catch (error) {
        console.error('Screenshot failed:', error);
      }
    }, 1000);
  }

  function stopRecording() {
    isRecording = false;
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
      // Analyze the batch with VLM to understand what user is working on
      const analysis = await analyzeScreenBatch(batch);
      if (analysis) {
        screenContext = analysis;
        console.log('[Screen context]', analysis);
      }
    } catch (error) {
      console.error('Batch analysis failed:', error);
    } finally {
      isProcessingBatch = false;
    }
  }

  async function resizeWindow(expanded: boolean) {
    try {
      const window = getCurrentWindow();
      const { LogicalSize } = await import('@tauri-apps/api/dpi');
      const newHeight = expanded ? BAR_HEIGHT + CHAT_HEIGHT : BAR_HEIGHT;
      await window.setSize(new LogicalSize(480, newHeight));
    } catch (error) {
      console.error('Failed to resize window:', error);
    }
  }

  async function scrollToBottom() {
    await tick();
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  async function focusInput() {
    await tick();
    inputRef?.focus();
  }

  async function handleSend() {
    const content = inputValue.trim();
    if (!content || isLoading) return;

    inputValue = '';

    // Add user message
    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content,
      hasScreen: !!latestScreenshot
    };
    messages = [...messages, userMessage];

    // Show chat panel if not visible
    if (!showChat) {
      showChat = true;
      await resizeWindow(true);
    }

    await scrollToBottom();
    await focusInput();

    // Start streaming response
    isLoading = true;
    streamingContent = '';

    try {
      // Convert to API format with full conversation history
      const apiMessages: Message[] = messages.map(m => ({
        id: m.id,
        conversation_id: '',
        role: m.role,
        content: m.content,
        created_at: new Date().toISOString(),
        screen_context: m.id === userMessage.id && latestScreenshot ? { screenshot: latestScreenshot } : undefined
      }));

      for await (const chunk of streamChat(apiMessages)) {
        streamingContent += chunk;
        await scrollToBottom();
      }

      messages = [...messages, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: streamingContent
      }];
      streamingContent = '';

    } catch (error) {
      messages = [...messages, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`
      }];
    } finally {
      isLoading = false;
      await scrollToBottom();
      await focusInput();
    }
  }

  async function closeChat() {
    showChat = false;
    await resizeWindow(false);
  }

  function startNewChat() {
    messages = [];
    streamingContent = '';
    focusInput();
  }

  async function openSettings() {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existing = await WebviewWindow.getByLabel('settings');
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }
    new WebviewWindow('settings', {
      url: '/settings',
      title: 'Settings',
      width: 480,
      height: 560,
      resizable: true,
      decorations: false,
      center: true,
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape' && showChat) {
      closeChat();
    }
  }

  async function startDrag(e: MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('.messages')) return;

    try {
      const window = getCurrentWindow();
      await window.startDragging();
    } catch (error) {
      console.error('Failed to start dragging:', error);
    }
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
</script>

<div class="container" onmousedown={startDrag} role="application" aria-label="Eigen" tabindex="0">
  <!-- Main bar -->
  <div class="bar">
    <!-- Recording toggle -->
    <button
      class="record-btn {isRecording ? 'recording' : ''}"
      onclick={toggleRecording}
      title={isRecording ? 'Stop recording' : 'Start recording'}
      aria-label={isRecording ? 'Stop recording' : 'Start recording'}
    >
      {#if isRecording}
        <span class="rec-indicator">
          <span class="rec-dot"></span>
          <span class="rec-time">{formatDuration(recordingDuration)}</span>
        </span>
      {:else}
        <svg viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="8" />
        </svg>
      {/if}
    </button>

    {#if !showChat}
      <!-- Input in bar when chat is closed -->
      <div class="input-wrapper">
        <input
          type="text"
          bind:value={inputValue}
          bind:this={inputRef}
          placeholder="Ask AI"
          onkeydown={handleKeydown}
        />
        <span class="shortcut">⌘ ↵</span>
      </div>

      <button class="icon-btn" onclick={openSettings} title="Settings" aria-label="Settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    {:else}
      <!-- Show chat info in bar when open -->
      <div class="bar-info">
        {#if latestScreenshot}
          <span class="screen-badge">
            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
              <path d="M12 9a3.75 3.75 0 100 7.5A3.75 3.75 0 0012 9z" />
              <path fill-rule="evenodd" d="M9.344 3.071a49.52 49.52 0 015.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 01-3 3H4.5a3 3 0 01-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 001.11-.71l.822-1.315a2.942 2.942 0 012.332-1.39zM12 17.25a5.25 5.25 0 100-10.5 5.25 5.25 0 000 10.5z" />
            </svg>
            Screen active
          </span>
        {/if}
      </div>

      <div class="bar-actions">
        {#if messages.length > 0}
          <button class="icon-btn small" onclick={startNewChat} title="New chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        {/if}
        <button class="icon-btn small" onclick={closeChat} title="Close chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    {/if}
  </div>

  <!-- Chat panel -->
  {#if showChat}
    <div class="chat-panel">
      <!-- Messages -->
      <div class="messages" bind:this={messagesContainer}>
        {#if messages.length === 0 && !isLoading}
          <div class="empty-state">
            <p>Ask a question to start</p>
          </div>
        {:else}
          {#each messages as message (message.id)}
            <div class="bubble-row {message.role}">
              <div class="bubble {message.role}">
                {#if message.role === 'user'}
                  {#if message.hasScreen}
                    <span class="screen-indicator">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 9a3.75 3.75 0 100 7.5A3.75 3.75 0 0012 9z" />
                        <path fill-rule="evenodd" d="M9.344 3.071a49.52 49.52 0 015.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 01-3 3H4.5a3 3 0 01-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 001.11-.71l.822-1.315a2.942 2.942 0 012.332-1.39zM12 17.25a5.25 5.25 0 100-10.5 5.25 5.25 0 000 10.5z" />
                      </svg>
                    </span>
                  {/if}
                  {message.content}
                {:else}
                  <div class="markdown-content">
                    {@html parseMarkdown(message.content)}
                  </div>
                {/if}
              </div>
            </div>
          {/each}

          {#if isLoading && streamingContent}
            <div class="bubble-row assistant">
              <div class="bubble assistant">
                <div class="markdown-content">
                  {@html parseMarkdown(streamingContent)}
                </div>
              </div>
            </div>
          {:else if isLoading}
            <div class="bubble-row assistant">
              <div class="bubble assistant typing">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
              </div>
            </div>
          {/if}
        {/if}
      </div>

      <!-- Input at bottom of chat -->
      <div class="chat-input-area">
        <input
          type="text"
          bind:value={inputValue}
          bind:this={inputRef}
          placeholder="Message..."
          onkeydown={handleKeydown}
          disabled={isLoading}
        />
        <button
          class="send-btn"
          onclick={handleSend}
          disabled={!inputValue.trim() || isLoading}
          aria-label="Send"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </div>
    </div>
  {/if}
</div>

<!-- Onboarding -->
{#if showOnboarding && !checkingOnboarding}
  <Onboarding oncomplete={handleOnboardingComplete} />
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
  }

  .container {
    display: flex;
    flex-direction: column;
    height: 100%;
    cursor: grab;
  }

  .container:active {
    cursor: grabbing;
  }

  /* Main bar */
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    height: 54px;
    min-height: 54px;
    box-sizing: border-box;

    background: rgba(30, 30, 32, 0.85);
    backdrop-filter: blur(40px);
    -webkit-backdrop-filter: blur(40px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  /* Record button */
  .record-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    min-width: 36px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .record-btn svg {
    width: 16px;
    height: 16px;
    color: #ff453a;
  }

  .record-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .record-btn.recording {
    background: rgba(255, 69, 58, 0.15);
    border-color: rgba(255, 69, 58, 0.3);
    padding: 8px 12px;
  }

  .rec-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .rec-dot {
    width: 8px;
    height: 8px;
    background: #ff453a;
    border-radius: 50%;
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .rec-time {
    font-variant-numeric: tabular-nums;
    font-size: 13px;
    font-weight: 500;
    color: #ff453a;
  }

  /* Input in bar */
  .input-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    position: relative;
  }

  .input-wrapper input {
    width: 100%;
    padding: 10px 60px 10px 14px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: white;
    font-size: 14px;
    outline: none;
    transition: all 0.2s ease;
  }

  .input-wrapper input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .input-wrapper input:focus {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(10, 132, 255, 0.5);
  }

  .shortcut {
    position: absolute;
    right: 12px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.3);
    pointer-events: none;
  }

  /* Bar info */
  .bar-info {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .screen-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(48, 209, 88, 0.15);
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    color: #30d158;
  }

  .screen-badge svg {
    width: 14px;
    height: 14px;
  }

  .bar-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* Icon button */
  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .icon-btn svg {
    width: 18px;
    height: 18px;
  }

  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
  }

  .icon-btn.small {
    width: 32px;
    height: 32px;
  }

  .icon-btn.small svg {
    width: 16px;
    height: 16px;
  }

  /* Chat panel - transparent! */
  .chat-panel {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    flex: 1;
    background: rgba(20, 20, 22, 0.75);
    backdrop-filter: blur(40px);
    -webkit-backdrop-filter: blur(40px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  /* Messages */
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .messages::-webkit-scrollbar {
    width: 6px;
  }

  .messages::-webkit-scrollbar-track {
    background: transparent;
  }

  .messages::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-state p {
    color: rgba(255, 255, 255, 0.3);
    font-size: 14px;
    margin: 0;
  }

  /* Message bubbles */
  .bubble-row {
    display: flex;
  }

  .bubble-row.user {
    justify-content: flex-end;
  }

  .bubble-row.assistant {
    justify-content: flex-start;
  }

  .bubble {
    max-width: 85%;
    padding: 10px 14px;
    border-radius: 18px;
    font-size: 13px;
    line-height: 1.5;
    word-wrap: break-word;
  }

  .bubble.user {
    background: linear-gradient(135deg, #0a84ff 0%, #0066cc 100%);
    color: white;
    border-bottom-right-radius: 4px;
  }

  .bubble.assistant {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.95);
    border-bottom-left-radius: 4px;
  }

  .screen-indicator {
    display: inline-flex;
    align-items: center;
    margin-right: 6px;
    opacity: 0.8;
  }

  .screen-indicator svg {
    width: 12px;
    height: 12px;
  }

  /* Typing indicator */
  .bubble.typing {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 14px 18px;
  }

  .typing-dot {
    width: 8px;
    height: 8px;
    background: rgba(255, 255, 255, 0.4);
    border-radius: 50%;
    animation: typing 1.4s ease-in-out infinite;
  }

  .typing-dot:nth-child(1) { animation-delay: 0s; }
  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes typing {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-4px); opacity: 1; }
  }

  /* Input area at bottom */
  .chat-input-area {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.2);
  }

  .chat-input-area input {
    flex: 1;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    color: white;
    font-size: 14px;
    outline: none;
    transition: all 0.2s ease;
  }

  .chat-input-area input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .chat-input-area input:focus {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(10, 132, 255, 0.5);
  }

  .chat-input-area input:disabled {
    opacity: 0.5;
  }

  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    background: #0a84ff;
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .send-btn svg {
    width: 16px;
    height: 16px;
    margin-left: 2px;
  }

  .send-btn:hover:not(:disabled) {
    background: #0077ed;
    transform: scale(1.05);
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Markdown */
  .markdown-content {
    color: rgba(255, 255, 255, 0.95);
  }

  .markdown-content :global(p) {
    margin: 0 0 8px;
  }

  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-content :global(strong) {
    font-weight: 600;
  }

  .markdown-content :global(code) {
    padding: 2px 5px;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 12px;
  }

  .markdown-content :global(pre) {
    margin: 8px 0;
    padding: 10px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    overflow-x: auto;
  }

  .markdown-content :global(pre code) {
    padding: 0;
    background: transparent;
  }

  .markdown-content :global(ul), .markdown-content :global(ol) {
    margin: 6px 0;
    padding-left: 18px;
  }

  .markdown-content :global(li) {
    margin: 3px 0;
  }

  .markdown-content :global(a) {
    color: #58a6ff;
    text-decoration: none;
  }
</style>
