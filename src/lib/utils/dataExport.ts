import { invoke } from '@tauri-apps/api/core';
import type { Conversation, Message, Topic, Memory, Fact } from '$lib/types';

export interface ExportData {
  version: string;
  exportedAt: string;
  conversations: Conversation[];
  messages: Message[];
  topics: StoredTopic[];
  memories: StoredMemory[];
  facts: StoredFact[];
}

interface StoredTopic {
  id: string;
  name: string;
  parent_id?: string;
  mastery_level: number;
  status: string;
  first_seen?: string;
  last_practiced?: string;
  next_review?: string;
}

interface StoredMemory {
  id: number;
  content: string;
  memory_type: string;
  topic_id?: string;
  source_conversation_id?: string;
  embedding?: string;
  created_at?: string;
  last_accessed?: string;
  access_count: number;
}

interface StoredFact {
  key: string;
  value: string;
  confidence: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Export all user data to a JSON object
 */
export async function exportAllData(): Promise<ExportData> {
  const [conversations, topics, memories, facts] = await Promise.all([
    invoke<Conversation[]>('get_conversations', { limit: 10000 }),
    invoke<StoredTopic[]>('get_topics'),
    invoke<StoredMemory[]>('get_memories', { limit: 10000 }),
    invoke<StoredFact[]>('get_facts'),
  ]);

  // Get all messages for each conversation
  const allMessages: Message[] = [];
  for (const conv of conversations) {
    try {
      const messages = await invoke<Message[]>('get_messages', { conversationId: conv.id });
      allMessages.push(...messages);
    } catch (e) {
      console.warn(`Failed to get messages for conversation ${conv.id}:`, e);
    }
  }

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    conversations,
    messages: allMessages,
    topics,
    memories,
    facts,
  };
}

/**
 * Download export data as a JSON file
 */
export function downloadExportFile(data: ExportData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `tutor-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validate import data structure
 */
export function validateImportData(data: unknown): data is ExportData {
  if (!data || typeof data !== 'object') return false;

  const d = data as Record<string, unknown>;

  if (typeof d.version !== 'string') return false;
  if (typeof d.exportedAt !== 'string') return false;
  if (!Array.isArray(d.conversations)) return false;
  if (!Array.isArray(d.messages)) return false;
  if (!Array.isArray(d.topics)) return false;
  if (!Array.isArray(d.memories)) return false;
  if (!Array.isArray(d.facts)) return false;

  return true;
}

/**
 * Import data from a JSON file
 */
export async function importData(data: ExportData): Promise<{ success: boolean; stats: ImportStats }> {
  const stats: ImportStats = {
    conversations: 0,
    messages: 0,
    topics: 0,
    memories: 0,
    facts: 0,
    errors: [],
  };

  // Import conversations
  for (const conv of data.conversations) {
    try {
      await invoke('import_conversation', { conversation: conv });
      stats.conversations++;
    } catch (e) {
      stats.errors.push(`Conversation ${conv.id}: ${e}`);
    }
  }

  // Import messages
  for (const msg of data.messages) {
    try {
      await invoke('import_message', { message: msg });
      stats.messages++;
    } catch (e) {
      stats.errors.push(`Message ${msg.id}: ${e}`);
    }
  }

  // Import topics
  for (const topic of data.topics) {
    try {
      await invoke('save_topic', { topic });
      stats.topics++;
    } catch (e) {
      stats.errors.push(`Topic ${topic.name}: ${e}`);
    }
  }

  // Import memories
  for (const memory of data.memories) {
    try {
      await invoke('save_memory', { memory });
      stats.memories++;
    } catch (e) {
      stats.errors.push(`Memory ${memory.id}: ${e}`);
    }
  }

  // Import facts
  for (const fact of data.facts) {
    try {
      await invoke('save_fact', { fact });
      stats.facts++;
    } catch (e) {
      stats.errors.push(`Fact ${fact.key}: ${e}`);
    }
  }

  return {
    success: stats.errors.length === 0,
    stats,
  };
}

export interface ImportStats {
  conversations: number;
  messages: number;
  topics: number;
  memories: number;
  facts: number;
  errors: string[];
}

/**
 * Read a file and parse as JSON
 */
export function readFileAsJson(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        resolve(data);
      } catch (e) {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
