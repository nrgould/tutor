import { writable, derived } from 'svelte/store';
import { getSetting, setSetting } from '$lib/utils/db';

function createOverlayModeStore() {
  const { subscribe, set, update } = writable(false);

  return {
    subscribe,

    async load() {
      try {
        const value = await getSetting('overlay_mode');
        set(value === 'true');
      } catch {
        set(false);
      }
    },

    async toggle() {
      update((current) => {
        const newValue = !current;
        setSetting('overlay_mode', newValue.toString()).catch(console.error);
        return newValue;
      });
    },

    async enable() {
      set(true);
      await setSetting('overlay_mode', 'true');
    },

    async disable() {
      set(false);
      await setSetting('overlay_mode', 'false');
    },
  };
}

export const overlayModeStore = createOverlayModeStore();
