import { invoke } from '@tauri-apps/api/core';
import type { Message, Conversation, ScreenContext } from '$lib/types';

// Generate a unique ID
export function generateId(): string {
  return crypto.randomUUID();
}

// Cache for conversations to support client-side pagination
let conversationsCache: Conversation[] | null = null;
let conversationsCacheTime = 0;
const CACHE_DURATION = 30000; // 30 seconds

// Invalidate the conversations cache
export function invalidateConversationsCache(): void {
  conversationsCache = null;
}

// Conversation operations
export async function createConversation(title?: string): Promise<Conversation> {
  const id = generateId();
  const conversation: Conversation = {
    id,
    title,
    started_at: new Date().toISOString(),
  };

  await invoke('create_conversation', { conversation });

  // Invalidate cache since we have new data
  invalidateConversationsCache();

  return conversation;
}

export async function getConversations(limit: number = 50, offset: number = 0): Promise<Conversation[]> {
  const now = Date.now();

  // Refresh cache if expired or if we need more data than cached
  if (!conversationsCache || now - conversationsCacheTime > CACHE_DURATION) {
    // Fetch a larger batch for caching
    conversationsCache = await invoke('get_conversations', { limit: Math.max(100, limit + offset) });
    conversationsCacheTime = now;
  }

  // Return sliced portion based on offset and limit
  return conversationsCache.slice(offset, offset + limit);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  return invoke('get_conversation', { id });
}

export async function updateConversation(
  id: string,
  updates: Partial<Conversation>
): Promise<void> {
  await invoke('update_conversation', { id, updates });
}

// Message operations
export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  screenContext?: ScreenContext
): Promise<Message> {
  const message: Message = {
    id: generateId(),
    conversation_id: conversationId,
    role,
    content,
    screen_context: screenContext,
    created_at: new Date().toISOString(),
  };

  await invoke('save_message', { message });
  return message;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  return invoke('get_messages', { conversationId });
}

// Settings operations
export async function getSetting(key: string): Promise<string | null> {
  return invoke('get_setting', { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  await invoke('set_setting', { key, value });
}

// Screen capture
export async function captureScreen(): Promise<string> {
  return invoke('capture_screen');
}

// Get screen context (app name, window title, etc.)
export async function getScreenContext(): Promise<{ app_name?: string; window_title?: string }> {
  try {
    return await invoke('get_screen_context');
  } catch {
    return {};
  }
}
