import { writable, get } from 'svelte/store';
import { settingsStore } from './settings';

export interface Nudge {
  id: string;
  message: string;
  type: 'tip' | 'question' | 'resource' | 'funfact' | 'check-in';
  aiMessage: string; // The full message to show in chat when clicked
  suggestions: string[]; // Quick reply suggestions
  duration: number;
  createdAt: number;
}

interface NudgeState {
  current: Nudge | null;
  lastNudgeTime: number;
  cooldownMs: number; // Time between nudges
}

const NUDGE_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
const NUDGE_DURATION_MS = 25 * 1000; // 25 seconds
const NUDGE_WINDOW_WIDTH = 300;
const NUDGE_WINDOW_HEIGHT = 120;

function createNudgeStore() {
  const { subscribe, set, update } = writable<NudgeState>({
    current: null,
    lastNudgeTime: 0,
    cooldownMs: NUDGE_COOLDOWN_MS,
  });

  let currentWindowLabel: string | null = null;

  return {
    subscribe,

    async show(message: string, aiMessage: string, type: Nudge['type'] = 'tip', suggestions: string[] = []) {
      // Check if nudges are enabled in settings
      const settings = get(settingsStore);
      if (settings.proactive_nudges === false) {
        return null;
      }

      // Check cooldown
      const state = get({ subscribe });
      const now = Date.now();
      if (now - state.lastNudgeTime < state.cooldownMs) {
        console.log('[Nudge] Skipping - cooldown active');
        return null;
      }

      // Don't show if there's already one displayed
      if (state.current) {
        console.log('[Nudge] Skipping - nudge already active');
        return null;
      }

      const id = crypto.randomUUID();
      const nudge: Nudge = {
        id,
        message,
        type,
        aiMessage,
        suggestions,
        duration: NUDGE_DURATION_MS,
        createdAt: now,
      };

      update(s => ({
        ...s,
        current: nudge,
        lastNudgeTime: now,
      }));

      // Create a separate window for the nudge notification
      try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const { primaryMonitor } = await import('@tauri-apps/api/window');

        // Get screen dimensions to position in top-right
        const monitor = await primaryMonitor();
        const screenWidth = monitor?.size.width || 1920;
        const x = screenWidth - NUDGE_WINDOW_WIDTH - 20;
        const y = 20;

        currentWindowLabel = 'nudge';

        // Encode nudge data in URL params to avoid race condition with events
        const params = new URLSearchParams({
          message,
          type,
          aiMessage,
          suggestions: JSON.stringify(suggestions),
        });

        const nudgeWindow = new WebviewWindow(currentWindowLabel, {
          url: `/nudge?${params.toString()}`,
          title: 'Tutor',
          width: NUDGE_WINDOW_WIDTH,
          height: NUDGE_WINDOW_HEIGHT,
          x,
          y,
          resizable: false,
          alwaysOnTop: true,
          decorations: false,
          transparent: false,
          skipTaskbar: true,
        });

        nudgeWindow.once('tauri://destroyed', () => {
          currentWindowLabel = null;
          update(s => ({ ...s, current: null }));
        });

        console.log('[Nudge] Showing window:', message);
        return id;
      } catch (error) {
        console.error('[Nudge] Failed to create window:', error);
        update(s => ({ ...s, current: null }));
        return null;
      }
    },

    async dismiss() {
      if (currentWindowLabel) {
        try {
          const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
          const window = await WebviewWindow.getByLabel(currentWindowLabel);
          if (window) {
            await window.close();
          }
        } catch {
          // Window might already be closed
        }
        currentWindowLabel = null;
      }
      update(s => ({ ...s, current: null }));
    },

    // Get the current nudge's AI message and dismiss
    consumeForChat(): string | null {
      const state = get({ subscribe });
      if (!state.current) return null;

      const aiMessage = state.current.aiMessage;
      this.dismiss();
      return aiMessage;
    },

    setCooldown(ms: number) {
      update(s => ({ ...s, cooldownMs: ms }));
    },

    // Check if enough time has passed since last nudge
    canNudge(): boolean {
      const settings = get(settingsStore);
      if (settings.proactive_nudges === false) return false;

      const state = get({ subscribe });
      return Date.now() - state.lastNudgeTime >= state.cooldownMs;
    },
  };
}

export const nudgeStore = createNudgeStore();
