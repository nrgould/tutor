import { get } from 'svelte/store';
import { settingsStore } from '$lib/stores/settings';
import { nudgeStore, type Nudge } from '$lib/stores/nudge';
import { getTopics } from '$lib/services/memoryService';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

interface NudgeResult {
  shouldNudge: boolean;
  type: Nudge['type'];
  toastMessage: string;  // Short message for the toast (1 line)
  aiMessage: string;     // Full message to show in chat
  suggestions: string[]; // Quick reply suggestions
}

const NUDGE_SYSTEM_PROMPT = `You are a helpful, proactive AI tutor. Based on what the user is currently viewing/studying, decide if you should proactively reach out with something helpful or interesting.

You should nudge when you have:
- A genuinely useful tip or insight related to what they're studying
- A fun fact that would make learning more engaging
- A connection to something they've learned before (if known topics provided)
- A gentle check-in if they seem stuck (on same content for a while)
- A resource suggestion that would help

You should NOT nudge if:
- There's nothing particularly interesting to say
- The screen content is unclear or not study-related
- You'd just be restating what's already on screen

Respond with JSON only (NO emojis anywhere):
{
  "shouldNudge": true/false,
  "type": "tip" | "question" | "resource" | "funfact" | "check-in",
  "toastMessage": "Short 1-line message for notification (max 80 chars, no emojis)",
  "aiMessage": "Your full conversational message as the tutor (2-4 sentences, friendly and helpful, no emojis)",
  "suggestions": ["Quick reply 1", "Quick reply 2", "Quick reply 3"]
}

The suggestions should be 2-3 short phrases (3-6 words each) the user might want to respond with.
If shouldNudge is false, still include placeholder values for other fields.`;

export async function generateNudge(
  screenContext: string,
  screenshot?: string,
  previousContexts?: string[]
): Promise<NudgeResult | null> {
  const settings = get(settingsStore);

  if (!settings.anthropic_api_key) {
    return null;
  }

  // Check if we can nudge (cooldown, settings, etc.)
  if (!nudgeStore.canNudge()) {
    return null;
  }

  try {
    // Get user's known topics for connection suggestions
    let knownTopics: string[] = [];
    try {
      const topics = await getTopics();
      knownTopics = topics.slice(0, 10).map(t => t.name);
    } catch {
      // Ignore - topics are optional
    }

    const contextInfo = [
      `Current screen: ${screenContext}`,
      previousContexts?.length ? `Recent activity: ${previousContexts.slice(-3).join('; ')}` : '',
      knownTopics.length ? `User's known topics: ${knownTopics.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    const messageContent: Array<{ type: string; source?: object; text?: string }> = [];

    // Include screenshot if provided
    if (screenshot) {
      messageContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: screenshot,
        },
      });
    }

    messageContent.push({
      type: 'text',
      text: `${contextInfo}\n\nShould you proactively reach out to help this user? If yes, what would you say?`,
    });

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
        system: NUDGE_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: messageContent,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('[NudgeGenerator] API error:', response.status);
      return null;
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;

    if (!text) {
      return null;
    }

    // Parse JSON response
    try {
      // Extract JSON from response (might have markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[NudgeGenerator] No JSON found in response');
        return null;
      }

      const result = JSON.parse(jsonMatch[0]) as NudgeResult;

      if (!result.shouldNudge) {
        console.log('[NudgeGenerator] AI decided not to nudge');
        return null;
      }

      return result;
    } catch (parseError) {
      console.error('[NudgeGenerator] Failed to parse response:', parseError);
      return null;
    }
  } catch (error) {
    console.error('[NudgeGenerator] Error:', error);
    return null;
  }
}

/**
 * Attempts to generate and show a nudge based on current screen context.
 * Returns true if a nudge was shown.
 */
export async function tryShowNudge(
  screenContext: string,
  screenshot?: string,
  previousContexts?: string[]
): Promise<boolean> {
  const result = await generateNudge(screenContext, screenshot, previousContexts);

  if (!result) {
    return false;
  }

  const id = nudgeStore.show(result.toastMessage, result.aiMessage, result.type, result.suggestions || []);
  return id !== null;
}
