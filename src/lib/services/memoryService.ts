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

// Normalize a topic name for comparison
function normalizeTopic(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']s\b/g, '') // Remove possessives ('s, 's)
    .replace(/[^a-z0-9\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Calculate similarity between two normalized topic names
function topicSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;

  // Check if one contains the other
  if (a.includes(b) || b.includes(a)) {
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    return shorter.length / longer.length;
  }

  // Simple word overlap for multi-word topics
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  return (2 * overlap) / (wordsA.size + wordsB.size);
}

// Find a matching topic from existing topics (exact or fuzzy match)
function findMatchingTopic(
  normalizedName: string,
  existingTopics: Map<string, string>
): string | undefined {
  // Exact match first
  if (existingTopics.has(normalizedName)) {
    return existingTopics.get(normalizedName);
  }

  // Fuzzy match - find best match above threshold
  let bestMatch: string | undefined;
  let bestScore = 0.7; // Minimum similarity threshold

  for (const [existingName, id] of existingTopics) {
    const score = topicSimilarity(normalizedName, existingName);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = id;
    }
  }

  return bestMatch;
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

    // Save topics with parent resolution and duplicate detection
    const topicObjects = convertToTopicObjects(extracted);

    // Get existing topics to check for duplicates and resolve parent names
    const existingTopics = await getTopicsUncached();
    const topicNameToId = new Map<string, string>();
    const existingMastery = new Map<string, number>();
    for (const t of existingTopics) {
      const normalizedName = normalizeTopic(t.name);
      topicNameToId.set(normalizedName, t.id);
      existingMastery.set(normalizedName, t.mastery_level);
    }

    // Track newly created topics in this batch
    const newTopicIds = new Map<string, string>();
    const topicsToCreate: typeof topicObjects = [];
    const topicsToUpdate: { id: string; mastery: number }[] = [];

    // First pass: determine which topics to create vs update
    for (const topic of topicObjects) {
      const normalizedName = normalizeTopic(topic.name);

      // Check for exact or fuzzy match with existing topics
      const existingId = findMatchingTopic(normalizedName, topicNameToId);

      if (existingId) {
        // Topic exists - update mastery if new level is higher
        const currentMastery = existingMastery.get(normalizedName) || 0;
        if (topic.mastery_level > currentMastery) {
          topicsToUpdate.push({ id: existingId, mastery: topic.mastery_level });
        }
        // Use existing ID for parent resolution
        newTopicIds.set(normalizedName, existingId);
      } else {
        // New topic - create it
        const topicId = crypto.randomUUID();
        newTopicIds.set(normalizedName, topicId);
        topicsToCreate.push({ ...topic, name: topic.name }); // Keep original name

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
    }

    // Update mastery for existing topics
    for (const update of topicsToUpdate) {
      await invoke('update_topic_mastery', {
        id: update.id,
        masteryLevel: update.mastery,
      }).catch((e) => console.warn('Failed to update topic mastery:', e));
    }

    // Second pass: update parent links for new topics
    for (const topic of topicsToCreate) {
      if (topic.parentName) {
        const parentNormalized = normalizeTopic(topic.parentName);
        const parentId = findMatchingTopic(parentNormalized, topicNameToId) ||
                         newTopicIds.get(parentNormalized);
        const topicId = newTopicIds.get(normalizeTopic(topic.name));

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
      newTopics: topicsToCreate.length,
      updatedTopics: topicsToUpdate.length,
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

// Clean up duplicate topics by merging them
export async function cleanupDuplicateTopics(): Promise<{
  merged: number;
  deleted: string[];
}> {
  const topics = await getTopicsUncached();
  const result = { merged: 0, deleted: [] as string[] };

  // Group topics by normalized name
  const groups = new Map<string, StoredTopic[]>();
  for (const topic of topics) {
    const normalized = normalizeTopic(topic.name);
    const existing = groups.get(normalized) || [];
    existing.push(topic);
    groups.set(normalized, existing);
  }

  // Process groups with duplicates
  for (const [, group] of groups) {
    if (group.length <= 1) continue;

    // Sort by mastery level (highest first), then by first_seen (oldest first)
    group.sort((a, b) => {
      if (b.mastery_level !== a.mastery_level) {
        return b.mastery_level - a.mastery_level;
      }
      return (a.first_seen || '').localeCompare(b.first_seen || '');
    });

    // Keep the first one (highest mastery, oldest)
    const keeper = group[0];
    const duplicates = group.slice(1);

    for (const dup of duplicates) {
      try {
        // Reassign any children of the duplicate to the keeper
        await invoke('reassign_topic_parent', {
          oldParentId: dup.id,
          newParentId: keeper.id,
        });

        // Delete the duplicate
        await invoke('delete_topic', { id: dup.id });

        result.deleted.push(dup.name);
        result.merged++;
      } catch (e) {
        console.warn('Failed to merge duplicate topic:', dup.name, e);
      }
    }
  }

  if (result.merged > 0) {
    invalidateTopicsCache();
    console.log('Cleaned up duplicate topics:', result);
  }

  return result;
}
