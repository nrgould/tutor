import type { Message, Memory, MemoryType, Topic } from '$lib/types';
import { settingsStore } from '$lib/stores/settings';
import { get } from 'svelte/store';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

interface ExtractedMemories {
  facts: { key: string; value: string; confidence: number }[];
  preferences: string[];
  struggles: string[];
  successes: string[];
  topics: {
    name: string;
    parent?: string;
    mastery_indicators: {
      understood: string[];
      struggled: string[];
      estimated_level: number;
    };
  }[];
}

const MEMORY_EXTRACTION_PROMPT = `Analyze this tutoring conversation and extract key information about the learner. Return ONLY valid JSON with this exact structure (no markdown, no explanation):

{
  "facts": [
    { "key": "learning_style", "value": "description", "confidence": 0.8 }
  ],
  "preferences": ["prefers examples over theory", "likes step-by-step explanations"],
  "struggles": ["has difficulty with recursion base cases"],
  "successes": ["understood list comprehensions quickly"],
  "topics": [
    {
      "name": "Python",
      "parent": null,
      "mastery_indicators": {
        "understood": ["basic syntax", "variables"],
        "struggled": ["recursion"],
        "estimated_level": 0.4
      }
    }
  ]
}

Rules:
- Only include information clearly demonstrated in the conversation
- Set confidence based on how certain you are (0.0-1.0)
- estimated_level: 0.0 = complete beginner, 1.0 = expert
- Keep descriptions concise
- If nothing to extract for a category, use empty array []`;

const TOPIC_DETECTION_PROMPT = `Identify the main topic being discussed in this message. Return ONLY valid JSON:

{
  "topic": "topic name or null if unclear",
  "subtopic": "more specific subtopic or null",
  "is_question": true/false,
  "difficulty_indicator": "beginner/intermediate/advanced/unclear"
}`;

export async function extractMemoriesFromConversation(
  messages: Message[]
): Promise<ExtractedMemories | null> {
  const settings = get(settingsStore);

  if (!settings.anthropic_api_key || messages.length < 2) {
    return null;
  }

  // Format conversation for analysis
  const conversationText = messages
    .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
    .join('\n\n');

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.anthropic_api_key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: MEMORY_EXTRACTION_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Analyze this conversation:\n\n${conversationText}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('Memory extraction failed:', response.statusText);
      return null;
    }

    const data = await response.json();
    const content = data.content[0]?.text;

    if (!content) {
      return null;
    }

    // Parse JSON response
    const extracted = JSON.parse(content) as ExtractedMemories;
    return extracted;
  } catch (error) {
    console.error('Failed to extract memories:', error);
    return null;
  }
}

export async function detectTopicFromMessage(content: string): Promise<{
  topic: string | null;
  subtopic: string | null;
  is_question: boolean;
  difficulty_indicator: string;
} | null> {
  const settings = get(settingsStore);

  if (!settings.anthropic_api_key) {
    return null;
  }

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.anthropic_api_key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        system: TOPIC_DETECTION_PROMPT,
        messages: [
          {
            role: 'user',
            content: content,
          },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const text = data.content[0]?.text;

    if (!text) {
      return null;
    }

    return JSON.parse(text);
  } catch (error) {
    console.error('Failed to detect topic:', error);
    return null;
  }
}

// Convert extracted memories to Memory objects for storage
export function convertToMemoryObjects(
  extracted: ExtractedMemories,
  conversationId: string
): Omit<Memory, 'id' | 'created_at' | 'last_accessed' | 'access_count'>[] {
  const memories: Omit<Memory, 'id' | 'created_at' | 'last_accessed' | 'access_count'>[] = [];

  // Add preferences as memories
  for (const pref of extracted.preferences) {
    memories.push({
      content: pref,
      type: 'preference' as MemoryType,
      source_conversation_id: conversationId,
    });
  }

  // Add struggles as memories
  for (const struggle of extracted.struggles) {
    memories.push({
      content: struggle,
      type: 'struggle' as MemoryType,
      source_conversation_id: conversationId,
    });
  }

  // Add successes as memories
  for (const success of extracted.successes) {
    memories.push({
      content: success,
      type: 'success' as MemoryType,
      source_conversation_id: conversationId,
    });
  }

  return memories;
}

// Convert extracted topics to Topic objects
export function convertToTopicObjects(
  extracted: ExtractedMemories
): Omit<Topic, 'id' | 'first_seen' | 'last_practiced' | 'next_review'>[] {
  return extracted.topics.map((t) => ({
    name: t.name,
    parent_id: undefined,
    mastery_level: t.mastery_indicators.estimated_level,
    status: getMasteryStatus(t.mastery_indicators.estimated_level),
  }));
}

function getMasteryStatus(
  level: number
): 'new' | 'struggling' | 'learning' | 'proficient' | 'mastered' {
  if (level < 0.2) return 'new';
  if (level < 0.4) return 'struggling';
  if (level < 0.6) return 'learning';
  if (level < 0.8) return 'proficient';
  return 'mastered';
}
