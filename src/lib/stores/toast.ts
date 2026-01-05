import { writable } from 'svelte/store';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  duration?: number;
}

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  return {
    subscribe,
    show(message: string, type: Toast['type'] = 'info', duration = 3000) {
      const id = crypto.randomUUID();
      const toast: Toast = { id, message, type, duration };

      update(toasts => [...toasts, toast]);

      if (duration > 0) {
        setTimeout(() => {
          this.dismiss(id);
        }, duration);
      }

      return id;
    },
    dismiss(id: string) {
      update(toasts => toasts.filter(t => t.id !== id));
    },
    clear() {
      update(() => []);
    }
  };
}

export const toastStore = createToastStore();

// Convenience functions
export const toast = {
  info: (message: string, duration?: number) => toastStore.show(message, 'info', duration),
  success: (message: string, duration?: number) => toastStore.show(message, 'success', duration),
  error: (message: string, duration?: number) => toastStore.show(message, 'error', duration),
};
