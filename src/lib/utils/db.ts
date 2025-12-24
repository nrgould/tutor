import { invoke } from '@tauri-apps/api/core';
import type { Message, Conversation, ScreenContext } from '$lib/types';

// Generate a unique ID
export function generateId(): string {
  return crypto.randomUUID();
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
  return conversation;
}

export async function getConversations(limit: number = 50): Promise<Conversation[]> {
  return invoke('get_conversations', { limit });
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
