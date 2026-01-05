<script lang="ts">
  import { onMount } from 'svelte';
  import { settingsStore } from '$lib/stores/settings';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getSetting, setSetting } from '$lib/utils/db';
  import { streamChat } from '$lib/utils/api';
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

  // Response panel state
  let showResponse = $state(false);
  let responseText = $state('');
  let isLoading = $state(false);
  let responseError = $state('');
  let lastQuestion = $state('');

  // Recording state
  let screenshotBuffer = $state<string[]>([]);
  let latestScreenshot = $state<string | null>(null);
  let watchInterval: ReturnType<typeof setInterval> | null = null;
  let durationInterval: ReturnType<typeof setInterval> | null = null;
  let isProcessingBatch = $state(false);

  const BAR_HEIGHT = 54;
  const RESPONSE_HEIGHT = 280;

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
        // Use silent capture - doesn't hide/show window
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
      // Process screenshots for context
      // This runs in background - could trigger proactive hints
    } catch (error) {
      console.error('Batch processing failed:', error);
    } finally {
      isProcessingBatch = false;
    }
  }

  async function resizeWindow(expanded: boolean) {
    try {
      const window = getCurrentWindow();
      const { LogicalSize } = await import('@tauri-apps/api/dpi');
      const newHeight = expanded ? BAR_HEIGHT + RESPONSE_HEIGHT : BAR_HEIGHT;
      await window.setSize(new LogicalSize(480, newHeight));
    } catch (error) {
      console.error('Failed to resize window:', error);
    }
  }

  async function handleSend() {
    const message = inputValue.trim();
    if (!message) return;

    lastQuestion = message;
    inputValue = '';
    responseText = '';
    responseError = '';
    isLoading = true;
    showResponse = true;

    // Expand window to show response
    await resizeWindow(true);

    try {
      // Build messages array
      const messages: Message[] = [{
        id: crypto.randomUUID(),
        conversation_id: '',
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
        screen_context: latestScreenshot ? { screenshot: latestScreenshot } : undefined
      }];

      // Stream the response
      for await (const chunk of streamChat(messages)) {
        responseText += chunk;
      }
    } catch (error) {
      responseError = error instanceof Error ? error.message : 'Failed to get response';
    } finally {
      isLoading = false;
    }
  }

  async function closeResponse() {
    showResponse = false;
    responseText = '';
    responseError = '';
    await resizeWindow(false);
  }

  async function copyResponse() {
    try {
      await navigator.clipboard.writeText(responseText);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }

  async function openFullChat() {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

    const existing = await WebviewWindow.getByLabel('chat');
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }

    new WebviewWindow('chat', {
      url: '/chat',
      title: 'Eigen',
      width: 420,
      height: 580,
      resizable: true,
      decorations: false,
      center: true,
      alwaysOnTop: true,
    });
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
    if (e.key === 'Escape' && showResponse) {
      closeResponse();
    }
  }

  async function startDrag(e: MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('.response-panel')) return;

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

    <!-- Input field -->
    <div class="input-wrapper">
      <input
        type="text"
        bind:value={inputValue}
        placeholder="Ask AI"
        onkeydown={handleKeydown}
      />
      <span class="shortcut">⌘ ↵</span>
    </div>

    <!-- Show/Hide toggle when response is visible -->
    {#if showResponse}
      <button class="action-btn" onclick={closeResponse} title="Hide response">
        <span class="action-label">Hide</span>
        <span class="shortcut-inline">⌘ \</span>
      </button>
    {:else}
      <!-- Settings -->
      <button
        class="icon-btn"
        onclick={openSettings}
        title="Settings"
        aria-label="Settings"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Response panel (inline, like Cluely) -->
  {#if showResponse}
    <div class="response-panel">
      <!-- Header -->
      <div class="response-header">
        <div class="response-title">
          <span class="response-label">AI response</span>
          {#if latestScreenshot}
            <span class="context-badge">
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                <path d="M12 9a3.75 3.75 0 100 7.5A3.75 3.75 0 0012 9z" />
                <path fill-rule="evenodd" d="M9.344 3.071a49.52 49.52 0 015.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 01-3 3H4.5a3 3 0 01-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 001.11-.71l.822-1.315a2.942 2.942 0 012.332-1.39zM12 17.25a5.25 5.25 0 100-10.5 5.25 5.25 0 000 10.5z" />
              </svg>
              Screen
            </span>
          {/if}
        </div>
        <div class="response-actions">
          <button class="response-action" onclick={copyResponse} title="Copy" disabled={!responseText}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
          </button>
          <button class="response-action" onclick={openFullChat} title="Open full chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </button>
          <button class="response-action close" onclick={closeResponse} title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="response-content">
        {#if isLoading && !responseText}
          <div class="loading">
            <div class="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span class="loading-text">Thinking...</span>
          </div>
        {:else if responseError}
          <div class="error">{responseError}</div>
        {:else}
          <div class="markdown-content">
            {@html parseMarkdown(responseText)}
          </div>
        {/if}
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

    /* Liquid glass effect */
    background: linear-gradient(
      135deg,
      rgba(50, 50, 55, 0.92) 0%,
      rgba(35, 35, 40, 0.96) 100%
    );
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 2px 8px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
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
    border-color: rgba(255, 255, 255, 0.15);
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

  /* Input */
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
    font-weight: 400;
    outline: none;
    transition: all 0.2s ease;
  }

  .input-wrapper input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .input-wrapper input:focus {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(10, 132, 255, 0.5);
    box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.15);
  }

  .shortcut {
    position: absolute;
    right: 12px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.3);
    font-weight: 500;
    pointer-events: none;
  }

  /* Action button (Show/Hide) */
  .action-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .action-label {
    font-weight: 500;
  }

  .shortcut-inline {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
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

  /* Response panel */
  .response-panel {
    margin-top: 8px;
    background: linear-gradient(
      180deg,
      rgba(45, 45, 50, 0.95) 0%,
      rgba(35, 35, 40, 0.98) 100%
    );
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    overflow: hidden;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .response-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .response-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .response-label {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .context-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: rgba(48, 209, 88, 0.15);
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    color: #30d158;
  }

  .context-badge svg {
    width: 12px;
    height: 12px;
  }

  .response-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .response-action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .response-action svg {
    width: 16px;
    height: 16px;
  }

  .response-action:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
  }

  .response-action:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .response-action.close:hover {
    background: rgba(255, 69, 58, 0.2);
    color: #ff453a;
  }

  .response-content {
    padding: 14px;
    max-height: 200px;
    overflow-y: auto;
  }

  .response-content::-webkit-scrollbar {
    width: 6px;
  }

  .response-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .response-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;
  }

  .loading {
    display: flex;
    align-items: center;
    gap: 10px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 13px;
  }

  .loading-dots {
    display: flex;
    gap: 4px;
  }

  .loading-dots span {
    width: 6px;
    height: 6px;
    background: rgba(255, 255, 255, 0.4);
    border-radius: 50%;
    animation: bounce 1.4s ease-in-out infinite both;
  }

  .loading-dots span:nth-child(1) { animation-delay: 0s; }
  .loading-dots span:nth-child(2) { animation-delay: 0.16s; }
  .loading-dots span:nth-child(3) { animation-delay: 0.32s; }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }

  .loading-text {
    font-weight: 500;
  }

  .error {
    color: #ff453a;
    font-size: 13px;
    padding: 8px 12px;
    background: rgba(255, 69, 58, 0.1);
    border-radius: 8px;
  }

  /* Markdown content styles */
  .markdown-content {
    color: rgba(255, 255, 255, 0.9);
    font-size: 13px;
    line-height: 1.6;
  }

  .markdown-content :global(p) {
    margin: 0 0 12px;
  }

  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-content :global(strong) {
    font-weight: 600;
    color: white;
  }

  .markdown-content :global(em) {
    font-style: italic;
  }

  .markdown-content :global(code) {
    padding: 2px 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 12px;
  }

  .markdown-content :global(pre) {
    margin: 12px 0;
    padding: 12px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    overflow-x: auto;
  }

  .markdown-content :global(pre code) {
    padding: 0;
    background: transparent;
  }

  .markdown-content :global(ul), .markdown-content :global(ol) {
    margin: 8px 0;
    padding-left: 20px;
  }

  .markdown-content :global(li) {
    margin: 4px 0;
  }

  .markdown-content :global(h1), .markdown-content :global(h2), .markdown-content :global(h3) {
    margin: 16px 0 8px;
    font-weight: 600;
    color: white;
  }

  .markdown-content :global(h1) { font-size: 18px; }
  .markdown-content :global(h2) { font-size: 16px; }
  .markdown-content :global(h3) { font-size: 14px; }

  .markdown-content :global(a) {
    color: #0a84ff;
    text-decoration: none;
  }

  .markdown-content :global(a:hover) {
    text-decoration: underline;
  }

  .markdown-content :global(blockquote) {
    margin: 12px 0;
    padding: 8px 12px;
    border-left: 3px solid rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.7);
  }
</style>
