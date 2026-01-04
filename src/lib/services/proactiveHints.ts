import { writable, derived, get } from 'svelte/store';
import { recordingStore } from '$lib/stores/recording';

export interface ProactiveHint {
  id: string;
  type: 'stuck' | 'long_session' | 'suggestion';
  message: string;
  action?: {
    label: string;
    prompt: string;
  };
  dismissedAt?: number;
}

interface ProactiveHintsState {
  hints: ProactiveHint[];
  lastScreenshotTime: number | null;
  stuckDetectionStart: number | null;
  sessionStartTime: number | null;
}

const STUCK_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes on same content
const LONG_SESSION_THRESHOLD_MS = 30 * 60 * 1000; // 30 minute session
const HINT_COOLDOWN_MS = 5 * 60 * 1000; // Don't show same hint for 5 minutes

function createProactiveHintsStore() {
  const { subscribe, set, update } = writable<ProactiveHintsState>({
    hints: [],
    lastScreenshotTime: null,
    stuckDetectionStart: null,
    sessionStartTime: null,
  });

  let checkInterval: ReturnType<typeof setInterval> | null = null;

  function startMonitoring() {
    // Monitor the recording store
    const unsubscribe = recordingStore.subscribe((state) => {
      if (state.status.is_recording) {
        if (!get({ subscribe }).sessionStartTime) {
          update((s) => ({ ...s, sessionStartTime: Date.now() }));
        }
        startPeriodicCheck();
      } else {
        stopPeriodicCheck();
        update((s) => ({
          ...s,
          sessionStartTime: null,
          stuckDetectionStart: null,
          lastScreenshotTime: null,
        }));
      }
    });

    return unsubscribe;
  }

  function startPeriodicCheck() {
    if (checkInterval) return;

    checkInterval = setInterval(() => {
      checkForHints();
    }, 30000); // Check every 30 seconds
  }

  function stopPeriodicCheck() {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  }

  function checkForHints() {
    update((state) => {
      const now = Date.now();
      const newHints = [...state.hints];

      // Check for long session
      if (state.sessionStartTime) {
        const sessionDuration = now - state.sessionStartTime;
        if (sessionDuration > LONG_SESSION_THRESHOLD_MS) {
          const existingHint = newHints.find((h) => h.type === 'long_session');
          if (!existingHint || (existingHint.dismissedAt && now - existingHint.dismissedAt > HINT_COOLDOWN_MS)) {
            // Remove old hint if exists and add new one
            const filtered = newHints.filter((h) => h.type !== 'long_session');
            filtered.push({
              id: crypto.randomUUID(),
              type: 'long_session',
              message: "You've been studying for a while! Consider taking a short break.",
              action: {
                label: 'Get a summary',
                prompt: "Can you summarize what I've been working on and suggest what to focus on next?",
              },
            });
            return { ...state, hints: filtered };
          }
        }
      }

      // Check for "stuck" pattern
      // This would be enhanced with actual image comparison in a full implementation
      if (state.stuckDetectionStart) {
        const stuckDuration = now - state.stuckDetectionStart;
        if (stuckDuration > STUCK_THRESHOLD_MS) {
          const existingHint = newHints.find((h) => h.type === 'stuck');
          if (!existingHint || (existingHint.dismissedAt && now - existingHint.dismissedAt > HINT_COOLDOWN_MS)) {
            const filtered = newHints.filter((h) => h.type !== 'stuck');
            filtered.push({
              id: crypto.randomUUID(),
              type: 'stuck',
              message: 'Need some help? I noticed you might be working through something challenging.',
              action: {
                label: 'Get help',
                prompt: "I'm stuck on what I'm looking at. Can you help me understand this better?",
              },
            });
            return { ...state, hints: filtered };
          }
        }
      }

      return state;
    });
  }

  function onScreenshotCaptured() {
    update((state) => {
      const now = Date.now();

      // If this is the first screenshot or we haven't seen one in a while,
      // start tracking for potential stuck detection
      if (!state.lastScreenshotTime || now - state.lastScreenshotTime > 60000) {
        return {
          ...state,
          lastScreenshotTime: now,
          stuckDetectionStart: now,
        };
      }

      // For now, we just update the timestamp
      // A more sophisticated version would compare screenshots
      return {
        ...state,
        lastScreenshotTime: now,
      };
    });
  }

  function dismissHint(hintId: string) {
    update((state) => ({
      ...state,
      hints: state.hints.map((h) => (h.id === hintId ? { ...h, dismissedAt: Date.now() } : h)),
    }));
  }

  function clearHint(hintId: string) {
    update((state) => ({
      ...state,
      hints: state.hints.filter((h) => h.id !== hintId),
    }));
  }

  function addCustomHint(hint: Omit<ProactiveHint, 'id'>) {
    update((state) => ({
      ...state,
      hints: [...state.hints, { ...hint, id: crypto.randomUUID() }],
    }));
  }

  return {
    subscribe,
    startMonitoring,
    onScreenshotCaptured,
    dismissHint,
    clearHint,
    addCustomHint,
    checkForHints,
  };
}

export const proactiveHintsStore = createProactiveHintsStore();

// Derived store for active (non-dismissed) hints
export const activeHints = derived(proactiveHintsStore, ($state) =>
  $state.hints.filter((h) => !h.dismissedAt)
);
