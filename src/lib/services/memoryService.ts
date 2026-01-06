import { invoke } from '@tauri-apps/api/core';
import { generateEmbedding, cosineSimilarity } from '$lib/utils/embeddings';
import {
  extractMemoriesFromConversation,
  convertToMemoryObjects,
  convertToTopicObjects,
  generateTopicSuggestions,
  type ExtractedTopicWithParent,
  type SuggestedTopic,
} from '$lib/utils/memory';
import {
  topicsCache,
  memoriesCache,
  withCache,
  CACHE_TTL,
} from '$lib/utils/cache';
import type { Message } from '$lib/types';

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

interface StoredFact {
  key: string;
  value: string;
  confidence: number;
}

// Save a memory with its embedding
export async function saveMemoryWithEmbedding(
  content: string,
  memoryType: string,
  topicId?: string,
  conversationId?: string
): Promise<number> {
  let embeddingJson: string | undefined;

  try {
    const embedding = await generateEmbedding(content);
    embeddingJson = JSON.stringify(embedding);
  } catch (error) {
    console.warn('Could not generate embedding:', error);
  }

  const id = await invoke<number>('save_memory', {
    memory: {
      content,
      memory_type: memoryType,
      topic_id: topicId,
      source_conversation_id: conversationId,
      embedding: embeddingJson,
      access_count: 0,
    },
  });

  return id;
}

// Search memories by semantic similarity
export async function searchMemories(
  query: string,
  limit: number = 5,
  minSimilarity: number = 0.3
): Promise<{ memory: StoredMemory; similarity: number }[]> {
  // Get query embedding
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(query);
  } catch (error) {
    console.warn('Could not generate query embedding:', error);
    return [];
  }

  // Get all memories with embeddings
  const memories = await invoke<StoredMemory[]>('get_memories_with_embeddings');

  // Calculate similarity for each memory
  const results: { memory: StoredMemory; similarity: number }[] = [];

  for (const memory of memories) {
    if (!memory.embedding) continue;

    try {
      const memoryEmbedding = JSON.parse(memory.embedding) as number[];
      const similarity = cosineSimilarity(queryEmbedding, memoryEmbedding);

      if (similarity >= minSimilarity) {
        results.push({ memory, similarity });
      }
    } catch {
      // Skip invalid embeddings
    }
  }

  // Sort by similarity and take top results
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, limit);
}

// Get relevant memories for a context (message + optional screenshot description)
export async function getRelevantMemories(
  context: string,
  limit: number = 5
): Promise<string[]> {
  const results = await searchMemories(context, limit);

  // Update access counts for retrieved memories
  for (const { memory } of results) {
    if (memory.id) {
      await invoke('update_memory_access', { id: memory.id }).catch(() => {});
    }
  }

  return results.map((r) => r.memory.content);
}

// Process a completed conversation to extract and store memories
export async function processConversationMemories(
  messages: Message[],
  conversationId: string
): Promise<void> {
  // Only process if we have meaningful conversation (at least 2 exchanges)
  if (messages.length < 4) {
    return;
  }

  try {
    // Extract memories using Claude
    const extracted = await extractMemoriesFromConversation(messages);

    if (!extracted) {
      return;
    }

    // Save facts
    for (const fact of extracted.facts) {
      await invoke('save_fact', { fact }).catch((e) => console.warn('Failed to save fact:', e));
    }

    // Save memories with embeddings
    const memoryObjects = convertToMemoryObjects(extracted, conversationId);
    for (const memory of memoryObjects) {
      await saveMemoryWithEmbedding(
        memory.content,
        memory.type,
        memory.topic_id,
        memory.source_conversation_id
      ).catch((e) => console.warn('Failed to save memory:', e));
    }

    // Save topics with parent resolution
    const topicObjects = convertToTopicObjects(extracted);

    // First, get existing topics to resolve parent names
    const existingTopics = await getTopicsUncached();
    const topicNameToId = new Map<string, string>();
    for (const t of existingTopics) {
      topicNameToId.set(t.name.toLowerCase(), t.id);
    }

    // Create a map for newly created topics in this batch
    const newTopicIds = new Map<string, string>();

    // First pass: create all topics without parent links
    for (const topic of topicObjects) {
      const topicId = crypto.randomUUID();
      newTopicIds.set(topic.name.toLowerCase(), topicId);

      await invoke('save_topic', {
        topic: {
          id: topicId,
          name: topic.name,
          parent_id: undefined, // Set in second pass
          mastery_level: topic.mastery_level,
          status: topic.status,
        },
      }).catch((e) => console.warn('Failed to save topic:', e));
    }

    // Second pass: update parent links
    for (const topic of topicObjects) {
      if (topic.parentName) {
        const parentNameLower = topic.parentName.toLowerCase();
        const parentId = topicNameToId.get(parentNameLower) || newTopicIds.get(parentNameLower);
        const topicId = newTopicIds.get(topic.name.toLowerCase());

        if (parentId && topicId) {
          await invoke('update_topic_parent', {
            topicId,
            parentId,
          }).catch((e) => console.warn('Failed to update topic parent:', e));
        }
      }
    }

    console.log('Processed conversation memories:', {
      facts: extracted.facts.length,
      memories: memoryObjects.length,
      topics: topicObjects.length,
    });

    // Invalidate caches so fresh data is fetched
    invalidateTopicsCache();
    invalidateMemoriesCache();
  } catch (error) {
    console.error('Failed to process conversation memories:', error);
  }
}

// Get all stored facts about the user
export async function getUserFacts(): Promise<StoredFact[]> {
  return invoke<StoredFact[]>('get_facts');
}

// Get all tracked topics (with caching)
export async function getTopics(): Promise<StoredTopic[]> {
  return withCache(topicsCache, 'all_topics', CACHE_TTL.TOPICS, () =>
    invoke<StoredTopic[]>('get_topics')
  );
}

// Get topics without cache (for forced refresh)
export async function getTopicsUncached(): Promise<StoredTopic[]> {
  topicsCache.delete('all_topics');
  return getTopics();
}

// Get recent memories (with caching)
export async function getRecentMemories(limit: number = 10): Promise<StoredMemory[]> {
  return withCache(memoriesCache, `recent_${limit}`, CACHE_TTL.MEMORIES, () =>
    invoke<StoredMemory[]>('get_memories', { limit })
  );
}

// Invalidate caches when data changes
export function invalidateTopicsCache(): void {
  topicsCache.clear();
}

export function invalidateMemoriesCache(): void {
  memoriesCache.clear();
}

// Build context string for Claude from memories and facts
export async function buildMemoryContext(currentQuery: string): Promise<string> {
  const parts: string[] = [];

  // Get relevant memories based on current query
  try {
    const relevantMemories = await getRelevantMemories(currentQuery, 5);
    if (relevantMemories.length > 0) {
      parts.push('Relevant things I remember about this learner:');
      parts.push(...relevantMemories.map((m) => `- ${m}`));
    }
  } catch {
    // OpenAI key might not be set
  }

  // Get user facts
  try {
    const facts = await getUserFacts();
    if (facts.length > 0) {
      parts.push('\nKnown facts about this learner:');
      parts.push(...facts.map((f) => `- ${f.key}: ${f.value}`));
    }
  } catch {
    // Ignore
  }

  // Get current topics being studied
  try {
    const topics = await getTopics();
    const activeTopics = topics.filter((t) => t.status !== 'mastered').slice(0, 5);
    if (activeTopics.length > 0) {
      parts.push('\nTopics they are currently learning:');
      parts.push(
        ...activeTopics.map(
          (t) => `- ${t.name}: ${Math.round(t.mastery_level * 100)}% mastery (${t.status})`
        )
      );
    }
  } catch {
    // Ignore
  }

  return parts.join('\n');
}

// Generate and return suggested topics based on current knowledge
export async function getSuggestedTopics(): Promise<
  { id: string; name: string; parentId?: string; reason: string }[]
> {
  try {
    const topics = await getTopics();

    // Filter out already suggested topics
    const realTopics = topics.filter((t) => t.status !== 'suggested');

    if (realTopics.length === 0) {
      return [];
    }

    const suggestions = await generateTopicSuggestions(realTopics);

    if (suggestions.length === 0) {
      return [];
    }

    // Build name-to-id map for parent resolution
    const topicNameToId = new Map<string, string>();
    for (const t of topics) {
      topicNameToId.set(t.name.toLowerCase(), t.id);
    }

    // Save suggested topics with status "suggested"
    const result: { id: string; name: string; parentId?: string; reason: string }[] = [];

    for (const suggestion of suggestions) {
      // Check if this topic already exists
      const existingId = topicNameToId.get(suggestion.name.toLowerCase());
      if (existingId) {
        continue; // Skip if topic already exists
      }

      const topicId = crypto.randomUUID();

      // Resolve parent name to ID
      let parentId: string | undefined;
      if (suggestion.parentName) {
        parentId = topicNameToId.get(suggestion.parentName.toLowerCase());
      }

      await invoke('save_topic', {
        topic: {
          id: topicId,
          name: suggestion.name,
          parent_id: parentId,
          mastery_level: 0,
          status: 'suggested',
        },
      }).catch((e) => console.warn('Failed to save suggested topic:', e));

      result.push({
        id: topicId,
        name: suggestion.name,
        parentId,
        reason: suggestion.reason,
      });

      // Add to map so subsequent suggestions can reference it
      topicNameToId.set(suggestion.name.toLowerCase(), topicId);
    }

    // Invalidate cache so UI can show new suggestions
    invalidateTopicsCache();

    return result;
  } catch (error) {
    console.error('Failed to generate suggested topics:', error);
    return [];
  }
}
