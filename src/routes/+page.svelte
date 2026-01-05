<script lang="ts">
  import { onMount } from 'svelte';
  import { settingsStore } from '$lib/stores/settings';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getSetting, setSetting } from '$lib/utils/db';
  import Onboarding from '$lib/components/Onboarding.svelte';

  const settings = $derived($settingsStore);

  // UI State
  let isWatching = $state(false);
  let watchDuration = $state(0);
  let showOnboarding = $state(false);
  let checkingOnboarding = $state(true);
  let showMenu = $state(false);

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

    // Close menu on click outside
    const handleClickOutside = () => {
      showMenu = false;
    };

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

  async function startWatching() {
    if (isWatching) return;
    isWatching = true;
    watchDuration = 0;
    screenshotBuffer = [];

    // Open chat window when session starts
    await openChatWindow();

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

  async function openChatWindow(initialMessage?: string) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

    const existing = await WebviewWindow.getByLabel('chat');
    if (existing) {
      await existing.show();
      await existing.setFocus();
      if (initialMessage) {
        await existing.emit('new-message', initialMessage);
      }
      return;
    }

    new WebviewWindow('chat', {
      url: initialMessage ? `/chat?message=${encodeURIComponent(initialMessage)}` : '/chat',
      title: 'Eigen',
      width: 420,
      height: 580,
      resizable: true,
      decorations: false,
      center: true,
      alwaysOnTop: true,
      transparent: true,
    });
  }

  async function openSettings() {
    showMenu = false;
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
      transparent: true,
    });
  }

  async function openHistory() {
    showMenu = false;
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existing = await WebviewWindow.getByLabel('history');
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }
    new WebviewWindow('history', {
      url: '/history',
      title: 'Sessions',
      width: 640,
      height: 560,
      resizable: true,
      decorations: false,
      center: true,
      transparent: true,
    });
  }

  async function closeApp() {
    const window = getCurrentWindow();
    await window.close();
  }

  async function startDrag(e: MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

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

<!-- Ultra-minimal floating bar -->
<div class="bar" onmousedown={startDrag} role="toolbar" aria-label="Eigen" tabindex="0">
  <!-- Left controls -->
  <div class="control-group">
    <!-- Eye/Watch indicator -->
    <button
      class="icon-btn {isWatching ? 'active' : ''}"
      onclick={() => isWatching ? stopWatching() : startWatching()}
      title={isWatching ? 'Stop watching' : 'Start watching'}
      aria-label={isWatching ? 'Stop watching' : 'Start watching'}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </button>

    <!-- Screen share indicator -->
    <button class="icon-btn" onclick={() => openChatWindow()} title="Open chat" aria-label="Open chat">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
      </svg>
    </button>
  </div>

  <!-- Divider -->
  <div class="divider"></div>

  <!-- Playback controls -->
  <div class="control-group">
    {#if isWatching}
      <!-- Recording indicator with time -->
      <div class="recording-indicator">
        <span class="rec-dot"></span>
        <span class="rec-time">{formatDuration(watchDuration)}</span>
      </div>

      <!-- Stop button -->
      <button class="icon-btn stop" onclick={stopWatching} title="Stop session" aria-label="Stop session">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      </button>
    {:else}
      <!-- Play button -->
      <button class="icon-btn play" onclick={startWatching} title="Start session" aria-label="Start session">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5.14v14l11-7-11-7z" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Divider -->
  <div class="divider"></div>

  <!-- Right controls -->
  <div class="control-group">
    <!-- Menu -->
    <div class="menu-container">
      <button class="icon-btn" onclick={() => showMenu = !showMenu} title="Menu" aria-label="Menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {#if showMenu}
        <div class="menu-dropdown">
          <button onclick={openHistory}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Sessions
          </button>
          <button onclick={openSettings}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
          <div class="menu-divider"></div>
          <button onclick={closeApp} class="danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
            Quit
          </button>
        </div>
      {/if}
    </div>

    <!-- Close -->
    <button class="icon-btn close" onclick={closeApp} title="Close" aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</div>

<!-- Proactive Toast -->
{#if showProactiveToast && proactiveMessage}
  <div class="toast">
    <div class="toast-content">
      <div class="toast-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
      </div>
      <p>{proactiveMessage}</p>
    </div>
    <div class="toast-actions">
      <button class="toast-btn" onclick={dismissProactive}>Dismiss</button>
      <button class="toast-btn primary" onclick={handleProactiveClick}>Ask</button>
    </div>
  </div>
{/if}

<!-- Onboarding -->
{#if showOnboarding && !checkingOnboarding}
  <Onboarding oncomplete={handleOnboardingComplete} />
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: transparent;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px 8px;
    background: rgba(28, 28, 30, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    cursor: grab;
    height: 100%;
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
  }

  .bar:active {
    cursor: grabbing;
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .divider {
    width: 1px;
    height: 16px;
    background: rgba(255, 255, 255, 0.1);
    margin: 0 4px;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .icon-btn svg {
    width: 16px;
    height: 16px;
  }

  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
  }

  .icon-btn.active {
    color: #30d158;
  }

  .icon-btn.play {
    color: rgba(255, 255, 255, 0.8);
  }

  .icon-btn.play:hover {
    color: #30d158;
  }

  .icon-btn.stop {
    color: #ff453a;
  }

  .icon-btn.close:hover {
    background: rgba(255, 69, 58, 0.2);
    color: #ff453a;
  }

  .recording-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    height: 28px;
    background: rgba(255, 69, 58, 0.15);
    border-radius: 6px;
  }

  .rec-dot {
    width: 6px;
    height: 6px;
    background: #ff453a;
    border-radius: 50%;
    animation: blink 1s ease-in-out infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .rec-time {
    font-size: 12px;
    font-weight: 500;
    color: #ff453a;
    font-variant-numeric: tabular-nums;
  }

  /* Menu */
  .menu-container {
    position: relative;
  }

  .menu-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 160px;
    padding: 6px;
    background: rgba(28, 28, 30, 0.98);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
    z-index: 100;
  }

  .menu-dropdown button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .menu-dropdown button svg {
    width: 16px;
    height: 16px;
    color: rgba(255, 255, 255, 0.5);
  }

  .menu-dropdown button:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .menu-dropdown button.danger {
    color: #ff453a;
  }

  .menu-dropdown button.danger svg {
    color: #ff453a;
  }

  .menu-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 6px 0;
  }

  /* Toast */
  .toast {
    position: fixed;
    top: 60px;
    right: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    background: rgba(28, 28, 30, 0.98);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    max-width: 280px;
    animation: slideIn 0.25s ease-out;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    z-index: 1000;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .toast-content {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .toast-icon {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffd60a;
  }

  .toast-icon svg {
    width: 20px;
    height: 20px;
  }

  .toast-content p {
    margin: 0;
    color: rgba(255, 255, 255, 0.9);
    font-size: 13px;
    line-height: 1.4;
  }

  .toast-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .toast-btn {
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toast-btn:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .toast-btn.primary {
    background: #0a84ff;
    color: white;
  }

  .toast-btn.primary:hover {
    background: #409cff;
  }
</style>
