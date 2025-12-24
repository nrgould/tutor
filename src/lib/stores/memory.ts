import { writable } from 'svelte/store';
import type { Memory, Topic, Fact } from '$lib/types';

interface MemoryState {
  memories: Memory[];
  topics: Topic[];
  facts: Fact[];
  isLoading: boolean;
}

function createMemoryStore() {
  const { subscribe, set, update } = writable<MemoryState>({
    memories: [],
    topics: [],
    facts: [],
    isLoading: false,
  });

  return {
    subscribe,

    setMemories(memories: Memory[]) {
      update((state) => ({ ...state, memories }));
    },

    setTopics(topics: Topic[]) {
      update((state) => ({ ...state, topics }));
    },

    setFacts(facts: Fact[]) {
      update((state) => ({ ...state, facts }));
    },

    addMemory(memory: Memory) {
      update((state) => ({
        ...state,
        memories: [...state.memories, memory],
      }));
    },

    addTopic(topic: Topic) {
      update((state) => ({
        ...state,
        topics: [...state.topics, topic],
      }));
    },

    updateTopicMastery(topicId: string, masteryLevel: number) {
      update((state) => ({
        ...state,
        topics: state.topics.map((t) =>
          t.id === topicId ? { ...t, mastery_level: masteryLevel } : t
        ),
      }));
    },

    setLoading(loading: boolean) {
      update((state) => ({ ...state, isLoading: loading }));
    },

    clear() {
      set({
        memories: [],
        topics: [],
        facts: [],
        isLoading: false,
      });
    },
  };
}

export const memoryStore = createMemoryStore();
