import { writable } from 'svelte/store';
import { getSetting, setSetting } from '$lib/utils/db';
import { getCurrentWindow } from '@tauri-apps/api/window';

function createOverlayModeStore() {
  const { subscribe, set, update } = writable(false);

  async function applyWindowStyle(enabled: boolean) {
    try {
      const window = getCurrentWindow();
      // On Windows, we need to toggle decorations for transparency to work
      await window.setDecorations(!enabled);
    } catch (e) {
      console.warn('Failed to update window decorations:', e);
    }
  }

  return {
    subscribe,

    async load() {
      try {
        const value = await getSetting('overlay_mode');
        const enabled = value === 'true';
        set(enabled);
        if (enabled) {
          await applyWindowStyle(enabled);
        }
      } catch {
        set(false);
      }
    },

    async toggle() {
      let newValue = false;
      update((current) => {
        newValue = !current;
        setSetting('overlay_mode', newValue.toString()).catch(console.error);
        return newValue;
      });
      await applyWindowStyle(newValue);
    },

    async enable() {
      set(true);
      await setSetting('overlay_mode', 'true');
      await applyWindowStyle(true);
    },

    async disable() {
      set(false);
      await setSetting('overlay_mode', 'false');
      await applyWindowStyle(false);
    },
  };
}

export const overlayModeStore = createOverlayModeStore();
