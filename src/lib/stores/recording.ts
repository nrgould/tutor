import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { RecordingSession, RecordingStatus, RecordingState, Screenshot } from '$lib/types';
import { generateSessionSummary } from '$lib/utils/api';

function createRecordingStore() {
  const { subscribe, set, update } = writable<RecordingState>({
    status: {
      is_recording: false,
      screenshot_count: 0,
    },
    currentSession: null,
    sessions: [],
    isLoading: false,
  });

  let unlistenStatus: (() => void) | null = null;
  let unlistenScreenshot: (() => void) | null = null;

  return {
    subscribe,

    async init() {
      // Get initial status
      try {
        const status = await invoke<RecordingStatus>('get_recording_status');
        update((state) => ({ ...state, status }));
      } catch (e) {
        console.error('Failed to get recording status:', e);
      }

      // Load sessions
      await this.loadSessions();

      // Listen for status updates
      unlistenStatus = await listen<RecordingStatus>('recording-status', (event) => {
        update((state) => ({ ...state, status: event.payload }));
      });

      // Listen for screenshot captures
      unlistenScreenshot = await listen<Screenshot>('screenshot-captured', (event) => {
        // Could trigger a notification or update UI
        console.log('Screenshot captured:', event.payload.captured_at);
      });
    },

    async loadSessions() {
      update((state) => ({ ...state, isLoading: true }));
      try {
        const sessions = await invoke<RecordingSession[]>('get_recording_sessions', { limit: 50 });
        update((state) => ({ ...state, sessions, isLoading: false }));
      } catch (e) {
        console.error('Failed to load sessions:', e);
        update((state) => ({ ...state, isLoading: false }));
      }
    },

    async startRecording(intervalSeconds: number = 30) {
      update((state) => ({ ...state, isLoading: true }));
      try {
        const session = await invoke<RecordingSession>('start_recording', {
          intervalSeconds,
        });
        update((state) => ({
          ...state,
          currentSession: session,
          status: {
            is_recording: true,
            session_id: session.id,
            screenshot_count: 0,
            started_at: session.started_at,
          },
          isLoading: false,
        }));
        return session;
      } catch (e) {
        console.error('Failed to start recording:', e);
        update((state) => ({ ...state, isLoading: false }));
        throw e;
      }
    },

    async stopRecording(autoGenerateSummary: boolean = true) {
      update((state) => ({ ...state, isLoading: true }));
      try {
        const session = await invoke<RecordingSession>('stop_recording');
        update((state) => ({
          ...state,
          currentSession: null,
          sessions: [session, ...state.sessions],
          status: {
            is_recording: false,
            screenshot_count: 0,
          },
          isLoading: false,
        }));

        // Generate AI summary in the background if enabled
        if (autoGenerateSummary && session.ended_at && session.screenshot_count > 0) {
          this.generateSummary(session).catch((e) => {
            console.error('Failed to generate session summary:', e);
          });
        }

        return session;
      } catch (e) {
        console.error('Failed to stop recording:', e);
        update((state) => ({ ...state, isLoading: false }));
        throw e;
      }
    },

    async generateSummary(session: RecordingSession) {
      if (!session.ended_at) return session;

      const startTime = new Date(session.started_at + 'Z').getTime();
      const endTime = new Date(session.ended_at + 'Z').getTime();
      const durationMinutes = Math.round((endTime - startTime) / 60000);

      try {
        const summary = await generateSessionSummary(
          session.screenshot_count,
          durationMinutes,
          session.notes ?? undefined
        );

        // Update session with summary
        return this.updateSession(session.id, undefined, undefined, summary);
      } catch (e) {
        console.error('Failed to generate summary:', e);
        return session;
      }
    },

    async getSessionScreenshots(sessionId: string, includeFullImage: boolean = false) {
      return invoke<Screenshot[]>('get_session_screenshots', {
        sessionId,
        includeFullImage,
      });
    },

    async getScreenshot(screenshotId: string) {
      return invoke<Screenshot>('get_screenshot', { screenshotId });
    },

    async updateSession(sessionId: string, name?: string, notes?: string, summary?: string) {
      const session = await invoke<RecordingSession>('update_session', {
        sessionId,
        name,
        notes,
        summary,
      });
      update((state) => ({
        ...state,
        sessions: state.sessions.map((s) => (s.id === sessionId ? session : s)),
      }));
      return session;
    },

    async deleteSession(sessionId: string) {
      await invoke('delete_session', { sessionId });
      update((state) => ({
        ...state,
        sessions: state.sessions.filter((s) => s.id !== sessionId),
      }));
    },

    cleanup() {
      if (unlistenStatus) {
        unlistenStatus();
        unlistenStatus = null;
      }
      if (unlistenScreenshot) {
        unlistenScreenshot();
        unlistenScreenshot = null;
      }
    },
  };
}

export const recordingStore = createRecordingStore();
