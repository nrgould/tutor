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

// ============================================================
// ENHANCED TOPIC SIMILARITY ALGORITHMS
// ============================================================

// Normalize a topic name for comparison
function normalizeTopic(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']s\b/g, '') // Remove possessives ('s, 's)
    .replace(/[^a-z0-9\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Calculate Levenshtein distance between two strings
 * More accurate for detecting typos and minor variations
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate normalized Levenshtein similarity (0-1)
 */
function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * Calculate Jaccard similarity between word sets
 */
function jaccardSimilarity(wordsA: Set<string>, wordsB: Set<string>): number {
  if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return intersection / union;
}

/**
 * Calculate n-gram similarity for partial word matching
 */
function ngramSimilarity(a: string, b: string, n: number = 2): number {
  const getNgrams = (s: string): Set<string> => {
    const ngrams = new Set<string>();
    const padded = ' '.repeat(n - 1) + s + ' '.repeat(n - 1);
    for (let i = 0; i < padded.length - n + 1; i++) {
      ngrams.add(padded.slice(i, i + n));
    }
    return ngrams;
  };

  const ngramsA = getNgrams(a);
  const ngramsB = getNgrams(b);

  return jaccardSimilarity(ngramsA, ngramsB);
}

/**
 * Enhanced topic similarity using multiple algorithms
 * Returns a weighted combination for robust matching
 */
function topicSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;

  // Get words for Jaccard
  const wordsA = new Set(a.split(' ').filter(w => w.length > 1));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 1));

  // Check if one is a substring of the other (strong indicator)
  if (a.includes(b) || b.includes(a)) {
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    // High score for containment
    return 0.7 + 0.3 * (shorter.length / longer.length);
  }

  // Calculate multiple similarity metrics
  const levenshtein = levenshteinSimilarity(a, b);
  const jaccard = jaccardSimilarity(wordsA, wordsB);
  const bigram = ngramSimilarity(a, b, 2);
  const trigram = ngramSimilarity(a, b, 3);

  // Weighted combination
  // - Jaccard is good for multi-word topics
  // - Levenshtein catches typos
  // - N-grams help with partial word matches
  const weights = {
    jaccard: 0.35,
    levenshtein: 0.25,
    bigram: 0.2,
    trigram: 0.2,
  };

  return (
    jaccard * weights.jaccard +
    levenshtein * weights.levenshtein +
    bigram * weights.bigram +
    trigram * weights.trigram
  );
}

// Cache for topic embeddings (semantic similarity)
const topicEmbeddingCache = new Map<string, number[]>();

/**
 * Get semantic similarity between topics using embeddings
 * Falls back to string similarity if embeddings unavailable
 */
async function semanticTopicSimilarity(
  a: string,
  b: string
): Promise<number> {
  try {
    // Get or generate embeddings
    let embA = topicEmbeddingCache.get(a);
    let embB = topicEmbeddingCache.get(b);

    if (!embA) {
      embA = await generateEmbedding(a);
      topicEmbeddingCache.set(a, embA);
    }
    if (!embB) {
      embB = await generateEmbedding(b);
      topicEmbeddingCache.set(b, embB);
    }

    return cosineSimilarity(embA, embB);
  } catch {
    // Fall back to string similarity
    return topicSimilarity(normalizeTopic(a), normalizeTopic(b));
  }
}

/**
 * Find matching topic with confidence score
 */
interface TopicMatch {
  id: string;
  name: string;
  confidence: number;
  matchType: 'exact' | 'normalized' | 'fuzzy' | 'semantic';
}

// Find a matching topic from existing topics (multi-stage matching)
function findMatchingTopic(
  normalizedName: string,
  existingTopics: Map<string, string>
): string | undefined {
  // Stage 1: Exact match
  if (existingTopics.has(normalizedName)) {
    return existingTopics.get(normalizedName);
  }

  // Stage 2: Fuzzy match with enhanced similarity
  let bestMatch: string | undefined;
  let bestScore = 0.65; // Slightly lower threshold due to better algorithm

  for (const [existingName, id] of existingTopics) {
    const score = topicSimilarity(normalizedName, existingName);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = id;
    }
  }

  return bestMatch;
}

/**
 * Find best matching topic with full details (async for semantic matching)
 */
async function findBestTopicMatch(
  name: string,
  existingTopics: StoredTopic[],
  useSemanticSearch: boolean = false
): Promise<TopicMatch | null> {
  const normalized = normalizeTopic(name);

  // Build lookup map
  const normalizedMap = new Map<string, StoredTopic>();
  for (const topic of existingTopics) {
    normalizedMap.set(normalizeTopic(topic.name), topic);
  }

  // Stage 1: Exact normalized match
  const exactMatch = normalizedMap.get(normalized);
  if (exactMatch) {
    return {
      id: exactMatch.id,
      name: exactMatch.name,
      confidence: 1.0,
      matchType: 'exact',
    };
  }

  // Stage 2: String-based fuzzy match
  let bestFuzzyMatch: TopicMatch | null = null;
  let bestFuzzyScore = 0.65;

  for (const [existingNorm, topic] of normalizedMap) {
    const score = topicSimilarity(normalized, existingNorm);
    if (score > bestFuzzyScore) {
      bestFuzzyScore = score;
      bestFuzzyMatch = {
        id: topic.id,
        name: topic.name,
        confidence: score,
        matchType: 'fuzzy',
      };
    }
  }

  // Stage 3: Semantic match (if enabled and no good fuzzy match)
  if (useSemanticSearch && (!bestFuzzyMatch || bestFuzzyMatch.confidence < 0.8)) {
    let bestSemanticMatch: TopicMatch | null = null;
    let bestSemanticScore = 0.75; // Higher threshold for semantic

    for (const topic of existingTopics) {
      try {
        const score = await semanticTopicSimilarity(name, topic.name);
        if (score > bestSemanticScore) {
          bestSemanticScore = score;
          bestSemanticMatch = {
            id: topic.id,
            name: topic.name,
            confidence: score,
            matchType: 'semantic',
          };
        }
      } catch {
        // Skip on error
      }
    }

    // Use semantic if better than fuzzy
    if (bestSemanticMatch && (!bestFuzzyMatch || bestSemanticMatch.confidence > bestFuzzyMatch.confidence)) {
      return bestSemanticMatch;
    }
  }

  return bestFuzzyMatch;
}

/**
 * Clear topic embedding cache (call when topics are updated)
 */
export function clearTopicEmbeddingCache(): void {
  topicEmbeddingCache.clear();
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

// ============================================================
// TOPIC RELATIONSHIP DISCOVERY & KNOWLEDGE GRAPH
// ============================================================

export interface TopicRelationship {
  fromId: string;
  toId: string;
  type: 'prerequisite' | 'related' | 'subtopic' | 'builds_on';
  strength: number; // 0-1 confidence
  reason?: string;
}

/**
 * Discover semantic relationships between topics using embeddings
 * Returns pairs of related topics that aren't already connected via parent
 */
export async function discoverTopicRelationships(
  minSimilarity: number = 0.6
): Promise<TopicRelationship[]> {
  const topics = await getTopics();
  const relationships: TopicRelationship[] = [];

  // Build set of existing parent-child connections
  const existingConnections = new Set<string>();
  for (const topic of topics) {
    if (topic.parent_id) {
      existingConnections.add(`${topic.id}-${topic.parent_id}`);
      existingConnections.add(`${topic.parent_id}-${topic.id}`);
    }
  }

  // Compare all pairs for semantic similarity
  for (let i = 0; i < topics.length; i++) {
    for (let j = i + 1; j < topics.length; j++) {
      const a = topics[i];
      const b = topics[j];

      // Skip if already connected
      const connectionKey = `${a.id}-${b.id}`;
      if (existingConnections.has(connectionKey)) continue;

      try {
        const similarity = await semanticTopicSimilarity(a.name, b.name);

        if (similarity >= minSimilarity) {
          // Determine relationship type based on mastery levels
          let type: TopicRelationship['type'] = 'related';

          // If one has much higher mastery, it might be a prerequisite
          const masteryDiff = a.mastery_level - b.mastery_level;
          if (Math.abs(masteryDiff) > 0.3) {
            type = masteryDiff > 0 ? 'builds_on' : 'prerequisite';
          }

          // Check if names suggest hierarchy
          const aNorm = normalizeTopic(a.name);
          const bNorm = normalizeTopic(b.name);
          if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) {
            type = 'subtopic';
          }

          relationships.push({
            fromId: a.id,
            toId: b.id,
            type,
            strength: similarity,
          });
        }
      } catch {
        // Skip on embedding error
      }
    }
  }

  // Sort by strength (strongest relationships first)
  relationships.sort((a, b) => b.strength - a.strength);

  return relationships;
}

/**
 * Get recommended learning order based on prerequisites and mastery
 * Uses topological sort with mastery weighting
 */
export async function getOptimalLearningOrder(): Promise<StoredTopic[]> {
  const topics = await getTopics();

  // Build adjacency list for prerequisites
  const prerequisites = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();

  for (const topic of topics) {
    prerequisites.set(topic.id, new Set());
    dependents.set(topic.id, new Set());
  }

  // Add parent as prerequisite
  for (const topic of topics) {
    if (topic.parent_id) {
      prerequisites.get(topic.id)?.add(topic.parent_id);
      dependents.get(topic.parent_id)?.add(topic.id);
    }
  }

  // Calculate priority score for each topic
  // Lower mastery + more dependents = higher priority
  const priorityScore = (topic: StoredTopic): number => {
    const dependentCount = dependents.get(topic.id)?.size || 0;
    const prerequisiteCount = prerequisites.get(topic.id)?.size || 0;

    // Prioritize:
    // 1. Topics with low mastery
    // 2. Topics that unlock more content (more dependents)
    // 3. Topics with fewer prerequisites (easier to start)
    return (
      (1 - topic.mastery_level) * 3 +
      dependentCount * 2 -
      prerequisiteCount * 0.5
    );
  };

  // Sort by priority
  return [...topics].sort((a, b) => priorityScore(b) - priorityScore(a));
}

/**
 * Find knowledge gaps - topics that need attention
 * Based on: low mastery, overdue review, struggling status
 */
export async function findKnowledgeGaps(): Promise<{
  topic: StoredTopic;
  reason: string;
  priority: number;
}[]> {
  const topics = await getTopics();
  const gaps: { topic: StoredTopic; reason: string; priority: number }[] = [];

  const now = new Date();

  for (const topic of topics) {
    if (topic.status === 'suggested' || topic.status === 'mastered') continue;

    let priority = 0;
    const reasons: string[] = [];

    // Check mastery level
    if (topic.mastery_level < 0.3) {
      priority += 3;
      reasons.push('Low mastery');
    } else if (topic.mastery_level < 0.5) {
      priority += 1;
      reasons.push('Moderate mastery');
    }

    // Check if overdue for review
    if (topic.next_review) {
      const reviewDate = new Date(topic.next_review);
      const daysOverdue = Math.floor(
        (now.getTime() - reviewDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysOverdue > 7) {
        priority += 3;
        reasons.push(`${daysOverdue} days overdue`);
      } else if (daysOverdue > 0) {
        priority += 1;
        reasons.push('Due for review');
      }
    }

    // Check status
    if (topic.status === 'struggling') {
      priority += 2;
      reasons.push('Struggling');
    }

    // Check time since last practice
    if (topic.last_practiced) {
      const daysSince = Math.floor(
        (now.getTime() - new Date(topic.last_practiced).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSince > 14) {
        priority += 1;
        reasons.push('Not practiced recently');
      }
    } else {
      priority += 2;
      reasons.push('Never practiced');
    }

    if (priority > 0) {
      gaps.push({
        topic,
        reason: reasons.join(', '),
        priority,
      });
    }
  }

  // Sort by priority (highest first)
  gaps.sort((a, b) => b.priority - a.priority);

  return gaps;
}

/**
 * Calculate overall knowledge strength in a domain
 * Weighted average of topic mastery with time decay
 */
export async function calculateDomainStrength(
  parentTopicId?: string
): Promise<{
  strength: number;
  topicCount: number;
  averageMastery: number;
  coverage: number;
}> {
  const topics = await getTopics();

  // Filter to domain if specified
  let domainTopics = topics.filter(t => t.status !== 'suggested');
  if (parentTopicId) {
    // Get all descendants of the parent topic
    const descendants = new Set<string>([parentTopicId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const topic of topics) {
        if (topic.parent_id && descendants.has(topic.parent_id) && !descendants.has(topic.id)) {
          descendants.add(topic.id);
          changed = true;
        }
      }
    }
    domainTopics = topics.filter(t => descendants.has(t.id));
  }

  if (domainTopics.length === 0) {
    return { strength: 0, topicCount: 0, averageMastery: 0, coverage: 0 };
  }

  // Calculate weighted mastery with time decay
  let totalWeight = 0;
  let weightedMastery = 0;
  let masteredCount = 0;

  for (const topic of domainTopics) {
    // Weight by recency
    let weight = 1;
    if (topic.last_practiced) {
      const daysSince = Math.max(1,
        (Date.now() - new Date(topic.last_practiced).getTime()) / (1000 * 60 * 60 * 24)
      );
      weight = 1 / Math.log2(daysSince + 1); // Logarithmic decay
    }

    totalWeight += weight;
    weightedMastery += topic.mastery_level * weight;

    if (topic.status === 'mastered' || topic.mastery_level >= 0.8) {
      masteredCount++;
    }
  }

  const averageMastery = weightedMastery / totalWeight;
  const coverage = masteredCount / domainTopics.length;

  // Overall strength combines mastery and coverage
  const strength = averageMastery * 0.7 + coverage * 0.3;

  return {
    strength,
    topicCount: domainTopics.length,
    averageMastery,
    coverage,
  };
}

/**
 * Get learning velocity - how fast mastery is improving
 */
export async function calculateLearningVelocity(
  topicId: string,
  dayWindow: number = 30
): Promise<{
  velocity: number; // Change in mastery per day
  trend: 'improving' | 'stable' | 'declining';
  dataPoints: number;
}> {
  // This would ideally use mastery history from the database
  // For now, estimate based on current state
  const topics = await getTopics();
  const topic = topics.find(t => t.id === topicId);

  if (!topic) {
    return { velocity: 0, trend: 'stable', dataPoints: 0 };
  }

  // Estimate velocity based on current mastery and time since first seen
  if (topic.first_seen) {
    const daysSinceStart = Math.max(1,
      (Date.now() - new Date(topic.first_seen).getTime()) / (1000 * 60 * 60 * 24)
    );
    const velocity = topic.mastery_level / daysSinceStart;

    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (velocity > 0.02) trend = 'improving';
    else if (velocity < 0.005) trend = 'declining';

    return { velocity, trend, dataPoints: 1 };
  }

  return { velocity: 0, trend: 'stable', dataPoints: 0 };
}
