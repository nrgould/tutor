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

  console.log('extractMemoriesFromConversation called:', {
    messageCount: messages.length,
    hasApiKey: !!settings.anthropic_api_key,
  });

  if (!settings.anthropic_api_key) {
    console.log('No API key configured - skipping memory extraction');
    return null;
  }

  if (messages.length < 2) {
    console.log('Not enough messages for memory extraction');
    return null;
  }

  // Format conversation for analysis
  const conversationText = messages
    .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
    .join('\n\n');

  console.log('Sending conversation to Claude for memory extraction...');

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
      const errorText = await response.text();
      console.error('Memory extraction API failed:', response.status, response.statusText, errorText);
      return null;
    }

    const data = await response.json();
    const content = data.content[0]?.text;

    if (!content) {
      console.log('No content in API response');
      return null;
    }

    console.log('Raw API response for memory extraction:', content.substring(0, 200));

    // Parse JSON response
    const extracted = JSON.parse(content) as ExtractedMemories;
    console.log('Successfully extracted memories:', {
      topics: extracted.topics?.length || 0,
      facts: extracted.facts?.length || 0,
    });
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

// Extended topic object that includes parent name for later resolution
export interface ExtractedTopicWithParent {
  name: string;
  parentName?: string; // Parent name from extraction (to be resolved to ID)
  mastery_level: number;
  status: 'new' | 'struggling' | 'learning' | 'proficient' | 'mastered';
}

// Convert extracted topics to Topic objects (with parent name for resolution)
export function convertToTopicObjects(
  extracted: ExtractedMemories
): ExtractedTopicWithParent[] {
  return extracted.topics.map((t) => ({
    name: t.name,
    parentName: t.parent || undefined,
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

// Prompt for generating suggested topics
const TOPIC_SUGGESTIONS_PROMPT = `Based on the learner's current knowledge, suggest 2-3 topics they should learn next.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "suggestions": [
    {
      "name": "Topic Name",
      "parent": "Parent topic name or null",
      "reason": "Brief reason why this would be a good next step"
    }
  ]
}

Rules:
- Suggest topics that logically follow from what they already know
- Consider prerequisites and natural learning progressions
- Keep topic names concise (1-4 words)
- Only suggest 2-3 topics maximum`;

export interface SuggestedTopic {
  name: string;
  parentName?: string;
  reason: string;
}

// Generate suggested topics based on current knowledge
export async function generateTopicSuggestions(
  currentTopics: { name: string; mastery_level: number; status: string }[]
): Promise<SuggestedTopic[]> {
  const settings = get(settingsStore);

  if (!settings.anthropic_api_key || currentTopics.length === 0) {
    return [];
  }

  const topicsSummary = currentTopics
    .map((t) => `- ${t.name}: ${Math.round(t.mastery_level * 100)}% mastery (${t.status})`)
    .join('\n');

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
        max_tokens: 512,
        system: TOPIC_SUGGESTIONS_PROMPT,
        messages: [
          {
            role: 'user',
            content: `The learner currently knows:\n${topicsSummary}\n\nSuggest what they should learn next.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('Topic suggestion failed:', response.statusText);
      return [];
    }

    const data = await response.json();
    const content = data.content[0]?.text;

    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content) as { suggestions: { name: string; parent?: string; reason: string }[] };
    return parsed.suggestions.map((s) => ({
      name: s.name,
      parentName: s.parent || undefined,
      reason: s.reason,
    }));
  } catch (error) {
    console.error('Failed to generate topic suggestions:', error);
    return [];
  }
}

// Review item extraction for active learning
export interface ExtractedReviewItem {
  question_type: 'flashcard' | 'multiple_choice' | 'true_false';
  question: string;
  answer: string;
  options?: string[]; // For multiple choice
  topic?: string;
}

const REVIEW_EXTRACTION_PROMPT = `Analyze this tutoring conversation and create 3-5 review items to help the learner remember key concepts. Generate a mix of question types.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "review_items": [
    {
      "question_type": "flashcard",
      "question": "What is X?",
      "answer": "X is...",
      "topic": "Topic Name"
    },
    {
      "question_type": "multiple_choice",
      "question": "Which of the following is true about X?",
      "answer": "B",
      "options": ["A) Wrong answer", "B) Correct answer", "C) Wrong answer", "D) Wrong answer"],
      "topic": "Topic Name"
    },
    {
      "question_type": "true_false",
      "question": "X is Y. (True or False)",
      "answer": "true",
      "topic": "Topic Name"
    }
  ]
}

Rules:
- Create questions that test understanding, not just recall
- For multiple_choice: answer should be just the letter (A, B, C, or D)
- For true_false: answer should be "true" or "false" (lowercase)
- For flashcard: answer should be a clear, concise explanation
- Focus on the main concepts discussed
- Make questions clear and unambiguous
- If the conversation is too short or lacks educational content, return fewer items or empty array`;

export async function extractReviewItems(
  messages: Message[]
): Promise<ExtractedReviewItem[]> {
  const settings = get(settingsStore);

  if (!settings.anthropic_api_key) {
    console.log('No API key configured - skipping review item extraction');
    return [];
  }

  if (messages.length < 2) {
    console.log('Not enough messages for review item extraction');
    return [];
  }

  // Format conversation for analysis
  const conversationText = messages
    .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
    .join('\n\n');

  console.log('Extracting review items from conversation...');

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
        max_tokens: 2048,
        system: REVIEW_EXTRACTION_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Create review items from this conversation:\n\n${conversationText}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Review extraction API failed:', response.status, errorText);
      return [];
    }

    const data = await response.json();
    const content = data.content[0]?.text;

    if (!content) {
      console.log('No content in API response');
      return [];
    }

    console.log('Raw API response for review extraction:', content.substring(0, 200));

    // Parse JSON response
    const parsed = JSON.parse(content) as { review_items: ExtractedReviewItem[] };
    console.log('Successfully extracted review items:', parsed.review_items?.length || 0);
    return parsed.review_items || [];
  } catch (error) {
    console.error('Failed to extract review items:', error);
    return [];
  }
}

// On-demand quiz generation from knowledge map topics
const QUIZ_GENERATION_PROMPT = `Generate quiz questions to test understanding of the given topics. Create a mix of question types.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "questions": [
    {
      "question_type": "flashcard",
      "question": "What is X?",
      "answer": "X is...",
      "topic": "Topic Name"
    },
    {
      "question_type": "multiple_choice",
      "question": "Which of the following best describes X?",
      "answer": "B",
      "options": ["A) Wrong answer", "B) Correct answer", "C) Wrong answer", "D) Wrong answer"],
      "topic": "Topic Name"
    },
    {
      "question_type": "true_false",
      "question": "X is Y. (True or False)",
      "answer": "true",
      "topic": "Topic Name"
    }
  ]
}

Rules:
- Create questions that test real understanding, not just definitions
- For multiple_choice: answer should be just the letter (A, B, C, or D), make distractors plausible
- For true_false: answer should be "true" or "false" (lowercase), include some false statements
- For flashcard: answer should be clear and educational
- Vary difficulty based on mastery level (lower mastery = more basic questions)
- Make questions specific and substantive
- Generate 5-8 questions total, mixing types`;

export interface QuizQuestion {
  question_type: 'flashcard' | 'multiple_choice' | 'true_false';
  question: string;
  answer: string;
  options?: string[];
  topic: string;
}

export async function generateQuizFromTopics(
  topics: { name: string; mastery_level: number }[],
  count: number = 6
): Promise<QuizQuestion[]> {
  const settings = get(settingsStore);

  if (!settings.anthropic_api_key) {
    console.log('No API key configured - cannot generate quiz');
    return [];
  }

  if (topics.length === 0) {
    console.log('No topics provided for quiz generation');
    return [];
  }

  // Format topics with mastery levels
  const topicsText = topics
    .map((t) => `- ${t.name} (${Math.round(t.mastery_level * 100)}% mastery)`)
    .join('\n');

  console.log('Generating quiz from topics:', topics.map(t => t.name));

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
        max_tokens: 2048,
        system: QUIZ_GENERATION_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Generate ${count} quiz questions about these topics:\n\n${topicsText}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Quiz generation API failed:', response.status, errorText);
      return [];
    }

    const data = await response.json();
    const content = data.content[0]?.text;

    if (!content) {
      console.log('No content in API response');
      return [];
    }

    console.log('Raw API response for quiz:', content.substring(0, 200));

    // Strip markdown code fences if present
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    // Parse JSON response
    const parsed = JSON.parse(jsonContent) as { questions: QuizQuestion[] };
    console.log('Generated quiz questions:', parsed.questions?.length || 0);
    return parsed.questions || [];
  } catch (error) {
    console.error('Failed to generate quiz:', error);
    return [];
  }
}
