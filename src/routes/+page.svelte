<script lang="ts">
  import { onMount } from 'svelte';
  import { settingsStore } from '$lib/stores/settings';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getSetting, setSetting } from '$lib/utils/db';
  import Onboarding from '$lib/components/Onboarding.svelte';

  const settings = $derived($settingsStore);

  // UI State
  let inputValue = $state('');
  let isWatching = $state(false);
  let watchDuration = $state(0);
  let showOnboarding = $state(false);
  let checkingOnboarding = $state(true);

  // Watching state
  let screenshotBuffer = $state<string[]>([]);
  let watchInterval: ReturnType<typeof setInterval> | null = null;
  let durationInterval: ReturnType<typeof setInterval> | null = null;
  let isProcessingBatch = $state(false);

  // Proactive notifications
  let proactiveMessage = $state<string | null>(null);
  let showProactiveToast = $state(false);

  onMount(() => {
    const init = async () => {
      await settingsStore.load();

      // Restore bar position
      await restoreBarPosition();

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
    };

    init();

    // Save position when window moves
    const window = getCurrentWindow();
    const unlistenMove = window.onMoved(async (event) => {
      await setSetting('bar_position_x', String(event.payload.x));
      await setSetting('bar_position_y', String(event.payload.y));
    });

    return () => {
      stopWatching();
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

  // Watching functions
  async function startWatching() {
    if (isWatching) return;
    isWatching = true;
    watchDuration = 0;
    screenshotBuffer = [];

    durationInterval = setInterval(() => {
      watchDuration++;
    }, 1000);

    watchInterval = setInterval(async () => {
      try {
        const screenshot = await invoke<string>('capture_screen');
        screenshotBuffer = [...screenshotBuffer, screenshot];

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
      if (context && context.includes('[SUGGESTION]')) {
        const suggestion = context.split('[SUGGESTION]')[1]?.trim();
        if (suggestion) {
          proactiveMessage = suggestion;
          showProactiveToast = true;
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
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: recentScreenshot } },
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
    if (!message) return;

    // Open chat window with the message
    await openChatWindow(message);
    inputValue = '';
  }

  async function openChatWindow(initialMessage?: string) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

    // Check if chat window already exists
    const existing = await WebviewWindow.getByLabel('chat');
    if (existing) {
      await existing.show();
      await existing.setFocus();
      if (initialMessage) {
        await existing.emit('new-message', initialMessage);
      }
      return;
    }

    // Create new chat window
    const chatWindow = new WebviewWindow('chat', {
      url: initialMessage ? `/chat?message=${encodeURIComponent(initialMessage)}` : '/chat',
      title: 'Eigen Chat',
      width: 450,
      height: 600,
      resizable: true,
      decorations: true,
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
      width: 500,
      height: 600,
      resizable: true,
      decorations: true,
      center: true,
    });
  }

  async function openHistory() {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existing = await WebviewWindow.getByLabel('history');
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }
    new WebviewWindow('history', {
      url: '/history',
      title: 'Session History',
      width: 700,
      height: 600,
      resizable: true,
      decorations: true,
      center: true,
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  async function handleProactiveClick() {
    if (proactiveMessage) {
      await openChatWindow(proactiveMessage);
      showProactiveToast = false;
      proactiveMessage = null;
    }
  }

  function dismissProactive() {
    showProactiveToast = false;
    proactiveMessage = null;
  }
</script>

<!-- The Bar -->
<div class="bar" onmousedown={startDrag} role="toolbar" aria-label="Eigen toolbar" tabindex="0">
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
    class="input"
    onkeydown={handleKeydown}
  />

  <!-- Send -->
  <button
    class="icon-btn accent"
    onclick={handleSend}
    disabled={!inputValue.trim()}
    title="Send"
  >
    <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
    </svg>
  </button>

  <!-- Chat (opens existing chat window) -->
  <button class="icon-btn" onclick={() => openChatWindow()} title="Open Chat">
    <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  </button>

  <!-- Settings -->
  <button class="icon-btn" onclick={openSettings} title="Settings">
    <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  </button>

  <!-- History -->
  <button class="icon-btn" onclick={openHistory} title="History">
    <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  </button>
</div>

<!-- Proactive Toast - Top Right -->
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
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #1e1e20;
    border-radius: 12px;
    cursor: grab;
    height: 100%;
    box-sizing: border-box;
  }

  .bar:active {
    cursor: grabbing;
  }

  .watch-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.06);
    border: none;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .watch-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
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
    height: 18px;
    background: rgba(255, 255, 255, 0.1);
  }

  .input {
    flex: 1;
    min-width: 150px;
    padding: 6px 10px;
    background: transparent;
    border: none;
    color: white;
    font-size: 13px;
    outline: none;
  }

  .input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: all 0.15s;
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
  }

  /* Toast - Top Right */
  .toast {
    position: fixed;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 10px;
    padding: 12px;
    background: #1e1e20;
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 12px;
    max-width: 280px;
    animation: slideIn 0.2s ease-out;
    z-index: 1000;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .toast-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(59, 130, 246, 0.15);
    border-radius: 50%;
    color: #3b82f6;
    flex-shrink: 0;
  }

  .toast-content p {
    margin: 0 0 10px 0;
    color: white;
    font-size: 12px;
    line-height: 1.4;
  }

  .toast-actions {
    display: flex;
    gap: 6px;
  }

  .toast-btn {
    padding: 5px 10px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
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
