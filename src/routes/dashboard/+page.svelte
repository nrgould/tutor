<script lang="ts">
  import { onMount } from 'svelte';
  import { getTopics, getUserFacts, getRecentMemories } from '$lib/services/memoryService';
  import {
    getTopicsDueForReview,
    calculateNextReview,
    getReviewTimeText,
  } from '$lib/utils/spacedRepetition';
  import type { Topic, Fact, Memory } from '$lib/types';

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

  let topics = $state<StoredTopic[]>([]);
  let facts = $state<StoredFact[]>([]);
  let memories = $state<StoredMemory[]>([]);
  let loading = $state(true);
  let activeTab = $state<'topics' | 'memories' | 'facts'>('topics');

  onMount(async () => {
    try {
      const [topicsData, factsData, memoriesData] = await Promise.all([
        getTopics(),
        getUserFacts(),
        getRecentMemories(20),
      ]);
      topics = topicsData;
      facts = factsData;
      memories = memoriesData;
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      loading = false;
    }
  });

  function getMasteryColor(level: number): string {
    if (level >= 0.8) return 'bg-green-500';
    if (level >= 0.6) return 'bg-blue-500';
    if (level >= 0.4) return 'bg-yellow-500';
    if (level >= 0.2) return 'bg-orange-500';
    return 'bg-red-500';
  }

  function getStatusBadge(status: string): { text: string; class: string } {
    switch (status) {
      case 'mastered':
        return { text: 'Mastered', class: 'bg-green-500/20 text-green-400' };
      case 'proficient':
        return { text: 'Proficient', class: 'bg-blue-500/20 text-blue-400' };
      case 'learning':
        return { text: 'Learning', class: 'bg-yellow-500/20 text-yellow-400' };
      case 'struggling':
        return { text: 'Struggling', class: 'bg-orange-500/20 text-orange-400' };
      default:
        return { text: 'New', class: 'bg-gray-500/20 text-gray-400' };
    }
  }

  function getMemoryIcon(type: string): string {
    switch (type) {
      case 'preference':
        return 'heart';
      case 'struggle':
        return 'alert';
      case 'success':
        return 'check';
      default:
        return 'info';
    }
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Computed stats
  const avgMastery = $derived(
    topics.length > 0
      ? topics.reduce((sum, t) => sum + t.mastery_level, 0) / topics.length
      : 0
  );

  const strugglingCount = $derived(
    memories.filter((m) => m.memory_type === 'struggle').length
  );

  const successCount = $derived(
    memories.filter((m) => m.memory_type === 'success').length
  );

  // Topics due for review
  const topicsDue = $derived(getTopicsDueForReview(topics));

  // Get review info for a topic
  function getReviewInfo(topic: StoredTopic) {
    const schedule = calculateNextReview(
      topic.mastery_level,
      topic.status,
      topic.last_practiced
    );
    return {
      ...schedule,
      timeText: getReviewTimeText(schedule.nextReview),
    };
  }
</script>

<div class="h-screen flex flex-col bg-tutor-bg">
  <!-- Header -->
  <div
    class="flex items-center justify-between px-4 py-3 border-b border-tutor-border bg-tutor-surface"
  >
    <div class="flex items-center gap-2">
      <a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <div class="w-8 h-8 rounded-lg bg-tutor-accent flex items-center justify-center">
          <span class="text-white font-bold text-sm">T</span>
        </div>
        <span class="font-semibold text-tutor-text">Tutor</span>
      </a>
      <span class="text-tutor-text-secondary">/</span>
      <span class="text-tutor-text">Dashboard</span>
    </div>

    <a
      href="/"
      class="px-3 py-1.5 text-sm rounded-lg bg-tutor-accent text-white hover:bg-tutor-accent/90 transition-colors"
    >
      Back to Chat
    </a>
  </div>

  <!-- Stats Summary -->
  {#if !loading && (topics.length > 0 || memories.length > 0 || facts.length > 0)}
    <div class="px-4 py-3 border-b border-tutor-border bg-tutor-surface/50">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
        <div class="p-3 rounded-lg bg-tutor-surface border border-tutor-border">
          <p class="text-xs text-tutor-text-secondary">Topics</p>
          <p class="text-xl font-semibold text-tutor-text">{topics.length}</p>
        </div>
        <div class="p-3 rounded-lg bg-tutor-surface border border-tutor-border">
          <p class="text-xs text-tutor-text-secondary">Avg Mastery</p>
          <p class="text-xl font-semibold text-tutor-text">{Math.round(avgMastery * 100)}%</p>
        </div>
        <div class="p-3 rounded-lg bg-tutor-surface border border-tutor-border">
          <p class="text-xs text-tutor-text-secondary">Breakthroughs</p>
          <p class="text-xl font-semibold text-green-400">{successCount}</p>
        </div>
        <div class="p-3 rounded-lg bg-tutor-surface border border-tutor-border">
          <p class="text-xs text-tutor-text-secondary">Struggles</p>
          <p class="text-xl font-semibold text-orange-400">{strugglingCount}</p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Tabs -->
  <div class="border-b border-tutor-border bg-tutor-surface">
    <div class="flex gap-1 px-4">
      <button
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px {activeTab ===
        'topics'
          ? 'text-tutor-accent border-tutor-accent'
          : 'text-tutor-text-secondary border-transparent hover:text-tutor-text'}"
        onclick={() => (activeTab = 'topics')}
      >
        Topics ({topics.length})
      </button>
      <button
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px {activeTab ===
        'memories'
          ? 'text-tutor-accent border-tutor-accent'
          : 'text-tutor-text-secondary border-transparent hover:text-tutor-text'}"
        onclick={() => (activeTab = 'memories')}
      >
        Memories ({memories.length})
      </button>
      <button
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px {activeTab ===
        'facts'
          ? 'text-tutor-accent border-tutor-accent'
          : 'text-tutor-text-secondary border-transparent hover:text-tutor-text'}"
        onclick={() => (activeTab = 'facts')}
      >
        Facts ({facts.length})
      </button>
    </div>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-4">
    {#if loading}
      <div class="flex items-center justify-center h-full">
        <div class="flex gap-1">
          <span class="w-2 h-2 bg-tutor-accent rounded-full animate-bounce"></span>
          <span class="w-2 h-2 bg-tutor-accent rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
          <span class="w-2 h-2 bg-tutor-accent rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
        </div>
      </div>
    {:else if activeTab === 'topics'}
      {#if topics.length === 0}
        <div class="flex flex-col items-center justify-center h-full text-center">
          <div class="w-16 h-16 rounded-2xl bg-tutor-accent/10 flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-tutor-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 class="text-lg font-semibold text-tutor-text mb-2">No topics yet</h2>
          <p class="text-sm text-tutor-text-secondary max-w-xs">
            Start learning! Topics will appear here as you have conversations with your tutor.
          </p>
        </div>
      {:else}
        <div class="grid gap-3 max-w-2xl mx-auto">
          <!-- Due for Review Section -->
          {#if topicsDue.length > 0}
            <div class="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 mb-2">
              <div class="flex items-center gap-2 mb-3">
                <svg class="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 class="font-medium text-orange-400">Due for Review ({topicsDue.length})</h3>
              </div>
              <div class="space-y-2">
                {#each topicsDue as topic}
                  {@const reviewInfo = getReviewInfo(topic)}
                  <a
                    href="/?topic={encodeURIComponent(topic.name)}"
                    class="flex items-center justify-between p-2 rounded-lg bg-tutor-surface/50 hover:bg-tutor-surface transition-colors"
                  >
                    <span class="text-sm text-tutor-text">{topic.name}</span>
                    <span class="text-xs px-2 py-0.5 rounded-full {
                      reviewInfo.urgency === 'overdue' ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'
                    }">
                      {reviewInfo.timeText}
                    </span>
                  </a>
                {/each}
              </div>
              <a
                href="/?review=true"
                class="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Start Review Session
              </a>
            </div>
          {/if}
          {#each topics as topic}
            {@const badge = getStatusBadge(topic.status)}
            {@const reviewInfo = getReviewInfo(topic)}
            <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border {
              reviewInfo.urgency === 'overdue' ? 'border-red-500/50' :
              reviewInfo.urgency === 'due' ? 'border-orange-500/50' : ''
            }">
              <div class="flex items-start justify-between mb-3">
                <div>
                  <h3 class="font-medium text-tutor-text">{topic.name}</h3>
                  <p class="text-xs text-tutor-text-secondary mt-0.5">
                    Started {formatDate(topic.first_seen)}
                    {#if topic.last_practiced}
                      &middot; Last practiced {formatDate(topic.last_practiced)}
                    {/if}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  {#if reviewInfo.urgency === 'overdue' || reviewInfo.urgency === 'due'}
                    <span class="px-2 py-0.5 text-xs font-medium rounded-full {
                      reviewInfo.urgency === 'overdue' ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'
                    }">
                      {reviewInfo.timeText}
                    </span>
                  {/if}
                  <span class="px-2 py-0.5 text-xs font-medium rounded-full {badge.class}">
                    {badge.text}
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <div class="flex-1 h-2 bg-tutor-border rounded-full overflow-hidden">
                  <div
                    class="h-full {getMasteryColor(topic.mastery_level)} transition-all"
                    style="width: {topic.mastery_level * 100}%"
                  ></div>
                </div>
                <span class="text-sm font-medium text-tutor-text-secondary">
                  {Math.round(topic.mastery_level * 100)}%
                </span>
              </div>
              {#if reviewInfo.urgency !== 'overdue' && reviewInfo.urgency !== 'due'}
                <p class="text-xs text-tutor-text-secondary mt-2">
                  Next review: {reviewInfo.timeText}
                </p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {:else if activeTab === 'memories'}
      {#if memories.length === 0}
        <div class="flex flex-col items-center justify-center h-full text-center">
          <div class="w-16 h-16 rounded-2xl bg-tutor-accent/10 flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-tutor-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h2 class="text-lg font-semibold text-tutor-text mb-2">No memories yet</h2>
          <p class="text-sm text-tutor-text-secondary max-w-xs">
            Memories are extracted from your conversations. Keep chatting with your tutor!
          </p>
        </div>
      {:else}
        <div class="grid gap-2 max-w-2xl mx-auto">
          {#each memories as memory}
            <div class="p-3 rounded-lg bg-tutor-surface border border-tutor-border flex items-start gap-3">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 {
                memory.memory_type === 'preference' ? 'bg-pink-500/20 text-pink-400' :
                memory.memory_type === 'struggle' ? 'bg-orange-500/20 text-orange-400' :
                memory.memory_type === 'success' ? 'bg-green-500/20 text-green-400' :
                'bg-blue-500/20 text-blue-400'
              }">
                {#if memory.memory_type === 'preference'}
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                {:else if memory.memory_type === 'struggle'}
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                {:else if memory.memory_type === 'success'}
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                {:else}
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-tutor-text">{memory.content}</p>
                <p class="text-xs text-tutor-text-secondary mt-1">
                  {formatDate(memory.created_at)}
                  {#if memory.access_count > 0}
                    &middot; Used {memory.access_count} time{memory.access_count > 1 ? 's' : ''}
                  {/if}
                </p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else if activeTab === 'facts'}
      {#if facts.length === 0}
        <div class="flex flex-col items-center justify-center h-full text-center">
          <div class="w-16 h-16 rounded-2xl bg-tutor-accent/10 flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-tutor-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 class="text-lg font-semibold text-tutor-text mb-2">No facts yet</h2>
          <p class="text-sm text-tutor-text-secondary max-w-xs">
            Facts about you (like your name, goals, preferences) will be learned over time.
          </p>
        </div>
      {:else}
        <div class="grid gap-2 max-w-2xl mx-auto">
          {#each facts as fact}
            <div class="p-3 rounded-lg bg-tutor-surface border border-tutor-border flex items-center justify-between">
              <div>
                <span class="text-sm font-medium text-tutor-text-secondary">{fact.key}</span>
                <p class="text-tutor-text">{fact.value}</p>
              </div>
              <div class="flex items-center gap-1 text-xs text-tutor-text-secondary">
                <span>{Math.round(fact.confidence * 100)}%</span>
                <span>confident</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>
