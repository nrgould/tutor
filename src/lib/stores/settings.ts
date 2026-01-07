import { writable, get } from 'svelte/store';
import type { Settings, ModelId } from '$lib/types';
import { invoke } from '@tauri-apps/api/core';

const defaultSettings: Settings = {
  anthropic_api_key: '',
  openai_api_key: '',
  hotkey_overlay: 'Ctrl+Shift+Space',
  hotkey_screenshot: 'Ctrl+Shift+S',
  theme: 'system',
  overlay_position: { x: 100, y: 100 },
  overlay_size: { width: 400, height: 500 },
  proactive_nudges: true,
  socratic_mode: false,
  model: 'claude-sonnet-4-5-20241022',
  extended_thinking: false,
  thinking_budget: 10000,
};

function createSettingsStore() {
  const { subscribe, set, update } = writable<Settings>(defaultSettings);

  return {
    subscribe,

    async load() {
      try {
        const keys = Object.keys(defaultSettings) as (keyof Settings)[];
        const loadedSettings = { ...defaultSettings };

        for (const key of keys) {
          try {
            const value = await invoke<string | null>('get_setting', { key });
            if (value !== null) {
              if (key === 'overlay_position' || key === 'overlay_size') {
                loadedSettings[key] = JSON.parse(value);
              } else if (key === 'theme') {
                loadedSettings[key] = value as 'light' | 'dark' | 'system';
              } else if (key === 'proactive_nudges' || key === 'socratic_mode' || key === 'extended_thinking') {
                loadedSettings[key] = value === 'true';
              } else if (key === 'thinking_budget') {
                loadedSettings[key] = parseInt(value, 10) || defaultSettings.thinking_budget;
              } else if (key === 'model') {
                loadedSettings[key] = value as ModelId;
              } else if (
                key === 'anthropic_api_key' ||
                key === 'openai_api_key' ||
                key === 'hotkey_overlay' ||
                key === 'hotkey_screenshot'
              ) {
                loadedSettings[key] = value;
              }
            }
          } catch {
            // Use default value if setting not found
          }
        }

        set(loadedSettings);
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    },

    async save(key: keyof Settings, value: string | object) {
      try {
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
        await invoke('set_setting', { key, value: stringValue });
        update((settings) => ({
          ...settings,
          [key]: value,
        }));
      } catch (error) {
        console.error('Failed to save setting:', error);
        throw error;
      }
    },

    async setApiKey(key: 'anthropic_api_key' | 'openai_api_key', value: string) {
      await this.save(key, value);
    },

    hasApiKey(): boolean {
      const settings = get({ subscribe });
      return settings.anthropic_api_key.length > 0;
    },

    reset() {
      set(defaultSettings);
    },
  };
}

export const settingsStore = createSettingsStore();
