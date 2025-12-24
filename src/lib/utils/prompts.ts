import type { TutorContext } from '$lib/types';

// Base tutor persona prompt
export const TUTOR_BASE_PROMPT = `You are a personal tutor helping someone learn. You can see their screen when they share it.

Your approach:
- Be encouraging but honest
- Adapt explanations to their level
- Ask clarifying questions when needed
- Use examples and analogies
- Focus on understanding, not just answers
- Keep responses concise and actionable
- When looking at code or technical content, be specific about what you see`;

// Memory extraction prompt
export const MEMORY_EXTRACTION_PROMPT = `Analyze the following conversation and extract key memories about the learner. Return a JSON object with the following structure:

{
  "facts": [
    { "key": "string", "value": "string", "confidence": 0.0-1.0 }
  ],
  "preferences": ["string"],
  "struggles": ["string"],
  "successes": ["string"],
  "topics_discussed": ["string"]
}

Focus on:
- Learning preferences (visual vs text, examples vs theory, etc.)
- Areas of difficulty or confusion
- Breakthroughs or "aha" moments
- Technical background or skill level indicators
- Communication style preferences`;

// Topic detection prompt
export const TOPIC_DETECTION_PROMPT = `Based on the conversation, identify the main topics being discussed. Return a JSON array of topics with their hierarchical relationship:

{
  "topics": [
    {
      "name": "string",
      "parent": "string or null",
      "mastery_indicators": {
        "understood": ["what they got right"],
        "struggled": ["what they had trouble with"],
        "estimated_level": 0.0-1.0
      }
    }
  ]
}`;

// Build system prompt with context
export function buildSystemPrompt(context?: TutorContext): string {
  let prompt = TUTOR_BASE_PROMPT;

  if (context?.memories?.length) {
    prompt += `\n\nWhat you know about this learner:\n${context.memories.map((m) => `- ${m}`).join('\n')}`;
  }

  if (context?.currentTopic) {
    prompt += `\n\nThey are currently learning: ${context.currentTopic}`;
    if (context.masteryLevel !== undefined) {
      const percentage = Math.round(context.masteryLevel * 100);
      prompt += ` (${percentage}% mastery)`;

      if (percentage < 30) {
        prompt += '\nThey are still new to this topic - focus on fundamentals and building intuition.';
      } else if (percentage < 60) {
        prompt += '\nThey have some understanding - help them deepen their knowledge and fill gaps.';
      } else if (percentage < 85) {
        prompt +=
          '\nThey are progressing well - challenge them with edge cases and deeper concepts.';
      } else {
        prompt +=
          '\nThey have strong mastery - focus on advanced topics and real-world applications.';
      }
    }
  }

  return prompt;
}

// Screen analysis prompt addon
export function getScreenAnalysisPrompt(windowTitle?: string, appName?: string): string {
  let context = 'The user has shared their screen with you.';

  if (appName || windowTitle) {
    context += ' They appear to be using';
    if (appName) context += ` ${appName}`;
    if (windowTitle) context += ` (${windowTitle})`;
    context += '.';
  }

  return context;
}
