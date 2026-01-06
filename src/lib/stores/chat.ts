import { writable, derived } from 'svelte/store';
import type { Message, Conversation, ChatState } from '$lib/types';

interface ExtendedChatState extends ChatState {
  suggestions: string[];
}

function createChatStore() {
  const { subscribe, set, update } = writable<ExtendedChatState>({
    messages: [],
    currentConversation: null,
    isLoading: false,
    error: null,
    suggestions: [],
  });

  return {
    subscribe,

    setConversation(conversation: Conversation) {
      update((state) => ({
        ...state,
        currentConversation: conversation,
        messages: [],
      }));
    },

    setMessages(messages: Message[]) {
      update((state) => ({
        ...state,
        messages,
      }));
    },

    addMessage(message: Message) {
      update((state) => ({
        ...state,
        messages: [...state.messages, message],
      }));
    },

    updateLastMessage(content: string) {
      update((state) => {
        const messages = [...state.messages];
        if (messages.length > 0) {
          messages[messages.length - 1] = {
            ...messages[messages.length - 1],
            content,
          };
        }
        return { ...state, messages };
      });
    },

    appendToLastMessage(chunk: string) {
      update((state) => {
        const messages = [...state.messages];
        if (messages.length > 0) {
          messages[messages.length - 1] = {
            ...messages[messages.length - 1],
            content: messages[messages.length - 1].content + chunk,
          };
        }
        return { ...state, messages };
      });
    },

    setLoading(loading: boolean) {
      update((state) => ({
        ...state,
        isLoading: loading,
      }));
    },

    setError(error: string | null) {
      update((state) => ({
        ...state,
        error,
        isLoading: false,
      }));
    },

    clear() {
      set({
        messages: [],
        currentConversation: null,
        isLoading: false,
        error: null,
        suggestions: [],
      });
    },

    setSuggestions(suggestions: string[]) {
      update((state) => ({
        ...state,
        suggestions,
      }));
    },

    clearSuggestions() {
      update((state) => ({
        ...state,
        suggestions: [],
      }));
    },
  };
}

export const chatStore = createChatStore();

// Derived store for message count
export const messageCount = derived(chatStore, ($chat) => $chat.messages.length);
