import { writable, get } from 'svelte/store';
import { settingsStore } from './settings';

export interface Nudge {
  id: string;
  message: string;
  type: 'tip' | 'question' | 'resource' | 'funfact' | 'check-in';
  aiMessage: string; // The full message to show in chat when clicked
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

function createNudgeStore() {
  const { subscribe, set, update } = writable<NudgeState>({
    current: null,
    lastNudgeTime: 0,
    cooldownMs: NUDGE_COOLDOWN_MS,
  });

  let dismissTimeout: ReturnType<typeof setTimeout> | null = null;

  return {
    subscribe,

    show(message: string, aiMessage: string, type: Nudge['type'] = 'tip') {
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
        duration: NUDGE_DURATION_MS,
        createdAt: now,
      };

      update(s => ({
        ...s,
        current: nudge,
        lastNudgeTime: now,
      }));

      // Auto-dismiss after duration
      if (dismissTimeout) clearTimeout(dismissTimeout);
      dismissTimeout = setTimeout(() => {
        this.dismiss();
      }, NUDGE_DURATION_MS);

      console.log('[Nudge] Showing:', message);
      return id;
    },

    dismiss() {
      if (dismissTimeout) {
        clearTimeout(dismissTimeout);
        dismissTimeout = null;
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
