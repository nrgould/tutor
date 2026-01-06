import type { Message, TutorContext, ClaudeMessage, ClaudeContent } from '$lib/types';
import { settingsStore } from '$lib/stores/settings';
import { get } from 'svelte/store';
import { buildMemoryContext } from '$lib/services/memoryService';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// Parse suggestions from Claude's response
const SUGGESTIONS_REGEX = /\[SUGGESTIONS:\s*(.+?)\]\s*$/;

export function parseSuggestionsFromResponse(response: string): {
  cleanedResponse: string;
  suggestions: string[];
} {
  const match = response.match(SUGGESTIONS_REGEX);
  if (!match) {
    return { cleanedResponse: response, suggestions: [] };
  }

  const suggestionsStr = match[1];
  const suggestions = suggestionsStr
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const cleanedResponse = response.replace(SUGGESTIONS_REGEX, '').trim();
  return { cleanedResponse, suggestions };
}

function buildSystemPrompt(context?: TutorContext): string {
  let prompt: string;

  if (context?.socraticMode) {
    // Socratic mode: guide through questions instead of direct answers
    prompt = `You are a Socratic tutor helping someone learn through guided discovery. You can see their screen when they share it.

Your Socratic approach:
- NEVER give direct answers - instead, ask probing questions that lead the learner to discover the answer themselves
- Break complex problems into smaller questions
- When they're stuck, provide hints through questions like "What would happen if...?" or "Have you considered...?"
- Celebrate when they figure things out: "Exactly! What made you realize that?"
- If they're really struggling after 2-3 attempts, you may provide a small hint, but frame it as a question
- Use phrases like: "What do you think happens when...?", "Why might that be?", "What's your intuition here?"
- Keep responses concise - focus on one guiding question at a time
- When looking at code or technical content, ask "What do you notice about...?" instead of explaining

IMPORTANT: At the end of EVERY response, include 2-3 follow-up suggestions. Format them EXACTLY like this on a new line:
[SUGGESTIONS: Let me think about it | Can you give me a hint? | I think I know - let me try]
Keep suggestions short (under 8 words each), relevant to the conversation.`;
  } else {
    // Normal mode: direct explanations
    prompt = `You are a personal tutor helping someone learn. You can see their screen when they share it.

Your approach:
- Be encouraging but honest
- Adapt explanations to their level
- Ask clarifying questions when needed
- Use examples and analogies
- Focus on understanding, not just answers
- Keep responses concise and actionable
- When looking at code or technical content, be specific about what you see

IMPORTANT: At the end of EVERY response, include 2-3 helpful follow-up suggestions the learner might want to ask next. Format them EXACTLY like this on a new line:
[SUGGESTIONS: Can you explain that differently? | Show me an example | What should I try next?]
Keep suggestions short (under 8 words each), relevant to the conversation, and phrased as things the learner would say.`;
  }

  if (context?.memories?.length) {
    prompt += `\n\nWhat you know about this learner:\n${context.memories.map((m) => `- ${m}`).join('\n')}`;
  }

  if (context?.currentTopic) {
    prompt += `\n\nThey are currently learning: ${context.currentTopic}`;
    if (context.masteryLevel !== undefined) {
      prompt += ` (${Math.round(context.masteryLevel * 100)}% mastery)`;
    }
  }

  // Include recent screen activity history so AI knows what user was looking at
  if (context?.screenHistory) {
    prompt += `\n\nRecent screen activity (what you observed while recording):\n${context.screenHistory}`;
  }

  return prompt;
}

function convertToClaudeMessage(message: Message): ClaudeMessage {
  const content: ClaudeContent[] = [];

  // Add screenshot if present
  if (message.screen_context?.screenshot) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: message.screen_context.screenshot,
      },
    });
  }

  // Add text content
  content.push({
    type: 'text',
    text: message.content,
  });

  return {
    role: message.role,
    content: content.length === 1 && content[0].type === 'text' ? message.content : content,
  };
}

export async function* streamChat(
  messages: Message[],
  context?: TutorContext
): AsyncGenerator<string, void, unknown> {
  const settings = get(settingsStore);

  if (!settings.anthropic_api_key) {
    throw new Error('Anthropic API key not configured. Please add your API key in settings.');
  }

  // Build memory context if not provided
  let enhancedContext = context;
  if (!context?.memories?.length) {
    try {
      const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
      if (lastUserMessage) {
        const memoryContextStr = await buildMemoryContext(lastUserMessage.content);
        if (memoryContextStr) {
          enhancedContext = {
            ...context,
            memories: [memoryContextStr],
          };
        }
      }
    } catch {
      // Continue without memory context if it fails
    }
  }

  const systemPrompt = buildSystemPrompt(enhancedContext);
  const claudeMessages = messages.map(convertToClaudeMessage);

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.anthropic_api_key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: claudeMessages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            if (event.type === 'content_block_delta' && event.delta?.text) {
              yield event.delta.text;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function chat(messages: Message[], context?: TutorContext): Promise<string> {
  let fullResponse = '';
  for await (const chunk of streamChat(messages, context)) {
    fullResponse += chunk;
  }
  return fullResponse;
}

export async function generateSessionSummary(
  screenshotCount: number,
  durationMinutes: number,
  sessionNotes?: string
): Promise<string> {
  const settings = get(settingsStore);

  if (!settings.anthropic_api_key) {
    throw new Error('Anthropic API key not configured.');
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.anthropic_api_key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system: `You are a helpful study companion summarizing a learning session.
Create a brief, encouraging summary of the study session.
Focus on:
- Acknowledging the time and effort spent
- Suggesting what might have been studied based on duration
- Encouraging continued learning`,
      messages: [
        {
          role: 'user',
          content: `Study session completed:
- Duration: ${durationMinutes} minutes
- Screenshots captured: ${screenshotCount}${sessionNotes ? `\n- Notes: ${sessionNotes}` : ''}

Please provide a brief summary of this study session.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || 'Session completed successfully.';
}

export async function generateNoteSummary(content: string): Promise<string> {
  const settings = get(settingsStore);

  if (!settings.anthropic_api_key) {
    throw new Error('Anthropic API key not configured.');
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.anthropic_api_key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system: `You are a helpful assistant that creates concise summaries of study notes.
Your summaries should:
- Be 2-3 sentences maximum
- Capture the key concepts and main takeaways
- Be written in a clear, direct style
- Focus on what the learner should remember`,
      messages: [
        {
          role: 'user',
          content: `Please summarize the following study notes:\n\n${content}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || 'Unable to generate summary.';
}

/**
 * Analyze a batch of screenshots to build context about what the user is working on.
 * Returns a brief summary of the activity observed.
 */
export async function analyzeScreenBatch(screenshots: string[]): Promise<string | null> {
  const settings = get(settingsStore);

  if (!settings.anthropic_api_key || screenshots.length === 0) {
    return null;
  }

  // Use the most recent screenshot for analysis (to save tokens)
  const latestScreenshot = screenshots[screenshots.length - 1];

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
        model: CLAUDE_MODEL,
        max_tokens: 200,
        system: `You are observing a user's screen to understand what they're working on.
Provide a very brief (1-2 sentence) factual description of what you see.
Focus on: the application/website, the type of content, and what task they appear to be doing.
Be concise and factual. No greetings or offers to help.`,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: latestScreenshot,
                },
              },
              {
                type: 'text',
                text: 'What is on this screen?',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.content?.[0]?.text || null;
  } catch {
    return null;
  }
}

/**
 * Generate a concise session title based on the conversation content.
 */
export async function generateSessionTitle(userMessage: string, assistantResponse: string): Promise<string | null> {
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
        model: CLAUDE_MODEL,
        max_tokens: 30,
        system: `Generate a concise 2-5 word title for this tutoring session. No quotes, no punctuation, just the title. Focus on the main topic or concept being discussed.`,
        messages: [
          {
            role: 'user',
            content: `User asked: "${userMessage.slice(0, 200)}"\n\nTutor discussed: "${assistantResponse.slice(0, 300)}"`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const title = data.content?.[0]?.text?.trim();
    return title || null;
  } catch {
    return null;
  }
}
