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
  let isRecording = $state(false);
  let recordingDuration = $state(0);
  let showOnboarding = $state(false);
  let checkingOnboarding = $state(true);

  // Recording state
  let screenshotBuffer = $state<string[]>([]);
  let watchInterval: ReturnType<typeof setInterval> | null = null;
  let durationInterval: ReturnType<typeof setInterval> | null = null;
  let isProcessingBatch = $state(false);

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

  async function handleSend() {
    const message = inputValue.trim();
    if (!message) return;

    await openChatWindow(message);
    inputValue = '';
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
</script>

<div class="bar" onmousedown={startDrag} role="toolbar" aria-label="Eigen" tabindex="0">
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
        <span class="rec-label">REC</span>
        <span class="rec-time">{formatDuration(recordingDuration)}</span>
      </span>
    {:else}
      <svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="8" />
      </svg>
      <span>Record</span>
    {/if}
  </button>

  <!-- Divider -->
  <div class="divider"></div>

  <!-- Input field -->
  <div class="input-wrapper">
    <input
      type="text"
      bind:value={inputValue}
      placeholder="Ask anything..."
      onkeydown={handleKeydown}
    />
  </div>

  <!-- Send button -->
  <button
    class="send-btn"
    onclick={handleSend}
    disabled={!inputValue.trim()}
    title="Send"
    aria-label="Send message"
  >
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
  </button>

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

  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    height: 100%;
    box-sizing: border-box;
    cursor: grab;

    /* Modern glass effect */
    background: linear-gradient(
      135deg,
      rgba(40, 40, 45, 0.95) 0%,
      rgba(30, 30, 35, 0.98) 100%
    );
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    box-shadow:
      0 4px 24px rgba(0, 0, 0, 0.4),
      0 1px 2px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .bar:active {
    cursor: grabbing;
  }

  /* Record button */
  .record-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.9);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .record-btn svg {
    width: 14px;
    height: 14px;
    color: #ff3b30;
  }

  .record-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .record-btn.recording {
    background: rgba(255, 59, 48, 0.15);
    border-color: rgba(255, 59, 48, 0.3);
    color: #ff3b30;
  }

  .rec-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .rec-dot {
    width: 8px;
    height: 8px;
    background: #ff3b30;
    border-radius: 50%;
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .rec-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .rec-time {
    font-variant-numeric: tabular-nums;
    font-size: 13px;
  }

  /* Divider */
  .divider {
    width: 1px;
    height: 20px;
    background: rgba(255, 255, 255, 0.1);
  }

  /* Input */
  .input-wrapper {
    flex: 1;
    min-width: 120px;
  }

  .input-wrapper input {
    width: 100%;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    color: white;
    font-size: 13px;
    outline: none;
    transition: all 0.2s ease;
  }

  .input-wrapper input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .input-wrapper input:focus {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(10, 132, 255, 0.5);
    box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.15);
  }

  /* Send button */
  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    background: linear-gradient(135deg, #0a84ff 0%, #0066cc 100%);
    border: none;
    border-radius: 8px;
    color: white;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(10, 132, 255, 0.3);
  }

  .send-btn svg {
    width: 16px;
    height: 16px;
  }

  .send-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(10, 132, 255, 0.4);
  }

  .send-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    box-shadow: none;
  }

  /* Icon button */
  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
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
    border-color: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.9);
  }
</style>
