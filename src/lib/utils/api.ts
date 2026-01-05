import type { Message, TutorContext, ClaudeMessage, ClaudeContent } from '$lib/types';
import { settingsStore } from '$lib/stores/settings';
import { get } from 'svelte/store';
import { buildMemoryContext } from '$lib/services/memoryService';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

function buildSystemPrompt(context?: TutorContext): string {
  let prompt = `You are a personal tutor helping someone learn. You can see their screen when they share it.

Your approach:
- Be encouraging but honest
- Adapt explanations to their level
- Ask clarifying questions when needed
- Use examples and analogies
- Focus on understanding, not just answers
- Keep responses concise and actionable
- When looking at code or technical content, be specific about what you see`;

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
