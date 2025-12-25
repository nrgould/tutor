// Message types
export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  screen_context?: ScreenContext;
  created_at: string;
}

export interface ScreenContext {
  screenshot?: string; // base64 encoded image
  app_name?: string;
  window_title?: string;
  captured_at: string;
}

// Conversation types
export interface Conversation {
  id: string;
  title?: string;
  started_at: string;
  ended_at?: string;
  topic?: string;
  summary?: string;
}

// Topic types
export type TopicStatus = 'new' | 'struggling' | 'learning' | 'proficient' | 'mastered';

export interface Topic {
  id: string;
  name: string;
  parent_id?: string;
  mastery_level: number; // 0.0 to 1.0
  status: TopicStatus;
  first_seen: string;
  last_practiced?: string;
  next_review?: string;
}

// Memory types
export type MemoryType = 'preference' | 'struggle' | 'success' | 'context';

export interface Memory {
  id: number;
  content: string;
  type: MemoryType;
  topic_id?: string;
  source_conversation_id?: string;
  created_at: string;
  last_accessed?: string;
  access_count: number;
}

// Fact types
export interface Fact {
  key: string;
  value: string;
  confidence: number; // 0.0 to 1.0
  created_at: string;
  updated_at: string;
}

// Event types
export type EventType = 'struggle' | 'breakthrough' | 'practice' | 'question' | 'mastered';

export interface LearningEvent {
  id: number;
  type: EventType;
  topic_id?: string;
  description: string;
  conversation_id?: string;
  created_at: string;
}

// Settings
export interface Settings {
  anthropic_api_key: string;
  openai_api_key: string;
  hotkey_overlay: string;
  hotkey_screenshot: string;
  theme: 'light' | 'dark' | 'system';
  overlay_position: { x: number; y: number };
  overlay_size: { width: number; height: number };
}

// Claude API types
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContent[];
}

export type ClaudeContent =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface TutorContext {
  memories?: string[];
  currentTopic?: string;
  masteryLevel?: number;
}

// Chat state
export interface ChatState {
  messages: Message[];
  currentConversation: Conversation | null;
  isLoading: boolean;
  error: string | null;
}

// Recording types
export interface RecordingSession {
  id: string;
  name?: string;
  started_at: string;
  ended_at?: string;
  interval_seconds: number;
  screenshot_count: number;
  notes?: string;
  summary?: string;
}

export interface Screenshot {
  id: string;
  session_id: string;
  image_data: string;
  thumbnail_data?: string;
  captured_at: string;
  app_name?: string;
  window_title?: string;
  notes?: string;
}

export interface RecordingStatus {
  is_recording: boolean;
  session_id?: string;
  screenshot_count: number;
  started_at?: string;
}

export interface RecordingState {
  status: RecordingStatus;
  currentSession: RecordingSession | null;
  sessions: RecordingSession[];
  isLoading: boolean;
}
