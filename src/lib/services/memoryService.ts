import { invoke } from '@tauri-apps/api/core';
import { generateEmbedding, cosineSimilarity } from '$lib/utils/embeddings';
import {
  extractMemoriesFromConversation,
  convertToMemoryObjects,
  convertToTopicObjects,
} from '$lib/utils/memory';
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

    // Save topics
    const topicObjects = convertToTopicObjects(extracted);
    for (const topic of topicObjects) {
      const topicId = crypto.randomUUID();
      await invoke('save_topic', {
        topic: {
          id: topicId,
          name: topic.name,
          parent_id: topic.parent_id,
          mastery_level: topic.mastery_level,
          status: topic.status,
        },
      }).catch((e) => console.warn('Failed to save topic:', e));
    }

    console.log('Processed conversation memories:', {
      facts: extracted.facts.length,
      memories: memoryObjects.length,
      topics: topicObjects.length,
    });
  } catch (error) {
    console.error('Failed to process conversation memories:', error);
  }
}

// Get all stored facts about the user
export async function getUserFacts(): Promise<StoredFact[]> {
  return invoke<StoredFact[]>('get_facts');
}

// Get all tracked topics
export async function getTopics(): Promise<StoredTopic[]> {
  return invoke<StoredTopic[]>('get_topics');
}

// Get recent memories (not by similarity, just recent)
export async function getRecentMemories(limit: number = 10): Promise<StoredMemory[]> {
  return invoke<StoredMemory[]>('get_memories', { limit });
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
