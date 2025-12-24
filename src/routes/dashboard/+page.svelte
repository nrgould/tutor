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
    if (level >= 0.8) return 'bg-[var(--success)]';
    if (level >= 0.6) return 'bg-[var(--accent)]';
    if (level >= 0.4) return 'bg-[var(--warning)]';
    if (level >= 0.2) return 'bg-orange-500';
    return 'bg-[var(--error)]';
  }

  function getStatusBadge(status: string): { text: string; class: string } {
    switch (status) {
      case 'mastered':
        return { text: 'Mastered', class: 'bg-[var(--success)]/15 text-[var(--success)]' };
      case 'proficient':
        return { text: 'Proficient', class: 'bg-[var(--accent)]/15 text-[var(--accent)]' };
      case 'learning':
        return { text: 'Learning', class: 'bg-[var(--warning)]/15 text-[var(--warning)]' };
      case 'struggling':
        return { text: 'Struggling', class: 'bg-orange-500/15 text-orange-400' };
      default:
        return { text: 'New', class: 'bg-[var(--gray-5)] text-[var(--gray-11)]' };
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

<div class="min-h-screen bg-[var(--gray-1)]">
  <!-- Header -->
  <header class="relative z-10 border-b border-[var(--gray-3)] bg-[var(--gray-1)]/80 backdrop-blur-xl">
    <div class="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <a href="/" class="flex items-center gap-3 group">
          <div class="w-9 h-9 rounded-xl bg-[var(--accent)] flex items-center justify-center">
            <span class="text-white font-bold text-sm">E</span>
          </div>
          <span class="font-semibold text-[var(--gray-12)] group-hover:text-[var(--accent)] transition-colors">Eigen</span>
        </a>
        <span class="text-[var(--gray-7)]">/</span>
        <span class="text-[var(--gray-11)]">Dashboard</span>
      </div>

      <div class="flex items-center gap-3">
        <a
          href="/analytics"
          class="px-4 py-2 text-sm font-medium rounded-xl bg-[var(--gray-3)] border border-[var(--gray-4)] text-[var(--gray-11)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
        >
          Analytics
        </a>
        <a
          href="/"
          class="px-4 py-2 text-sm font-medium rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
        >
          Back to Chat
        </a>
      </div>
    </div>
  </header>

  <main class="relative z-10 max-w-5xl mx-auto px-6 py-8">
    <!-- Stats Summary -->
    {#if !loading && (topics.length > 0 || memories.length > 0 || facts.length > 0)}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div class="p-5 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-xl bg-[var(--accent-muted)] flex items-center justify-center">
              <svg class="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
          </div>
          <p class="text-2xl font-semibold text-[var(--gray-12)] tracking-tight">{topics.length}</p>
          <p class="text-sm text-[var(--gray-9)] mt-1">Topics</p>
        </div>

        <div class="p-5 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-xl bg-[var(--accent-muted)] flex items-center justify-center">
              <svg class="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
            </div>
          </div>
          <p class="text-2xl font-semibold text-[var(--gray-12)] tracking-tight">{Math.round(avgMastery * 100)}%</p>
          <p class="text-sm text-[var(--gray-9)] mt-1">Avg Mastery</p>
        </div>

        <div class="p-5 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-xl bg-[var(--success)]/15 flex items-center justify-center">
              <svg class="w-5 h-5 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
          </div>
          <p class="text-2xl font-semibold text-[var(--success)] tracking-tight">{successCount}</p>
          <p class="text-sm text-[var(--gray-9)] mt-1">Breakthroughs</p>
        </div>

        <div class="p-5 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-xl bg-[var(--warning)]/15 flex items-center justify-center">
              <svg class="w-5 h-5 text-[var(--warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
          </div>
          <p class="text-2xl font-semibold text-[var(--warning)] tracking-tight">{strugglingCount}</p>
          <p class="text-sm text-[var(--gray-9)] mt-1">Struggles</p>
        </div>
      </div>
    {/if}

    <!-- Tabs -->
    <div class="flex gap-1 p-1 rounded-xl bg-[var(--gray-2)] border border-[var(--gray-4)] w-fit mb-6">
      <button
        class="px-5 py-2 text-sm font-medium rounded-lg transition-colors {activeTab === 'topics'
          ? 'bg-[var(--gray-4)] text-[var(--gray-12)]'
          : 'text-[var(--gray-9)] hover:text-[var(--gray-11)]'}"
        onclick={() => (activeTab = 'topics')}
      >
        Topics ({topics.length})
      </button>
      <button
        class="px-5 py-2 text-sm font-medium rounded-lg transition-colors {activeTab === 'memories'
          ? 'bg-[var(--gray-4)] text-[var(--gray-12)]'
          : 'text-[var(--gray-9)] hover:text-[var(--gray-11)]'}"
        onclick={() => (activeTab = 'memories')}
      >
        Memories ({memories.length})
      </button>
      <button
        class="px-5 py-2 text-sm font-medium rounded-lg transition-colors {activeTab === 'facts'
          ? 'bg-[var(--gray-4)] text-[var(--gray-12)]'
          : 'text-[var(--gray-9)] hover:text-[var(--gray-11)]'}"
        onclick={() => (activeTab = 'facts')}
      >
        Facts ({facts.length})
      </button>
    </div>

    <!-- Content -->
    {#if loading}
      <div class="flex flex-col items-center justify-center py-20">
        <div class="flex gap-1.5">
          <span class="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce"></span>
          <span class="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
          <span class="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
        </div>
        <p class="mt-4 text-sm text-[var(--gray-9)]">Loading your learning data...</p>
      </div>
    {:else if activeTab === 'topics'}
      {#if topics.length === 0}
        <div class="flex flex-col items-center justify-center py-20 text-center">
          <div class="w-20 h-20 rounded-3xl bg-[var(--gray-3)] border border-[var(--gray-4)] flex items-center justify-center mb-5">
            <svg class="w-10 h-10 text-[var(--gray-7)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-[var(--gray-12)] mb-2">No topics yet</h2>
          <p class="text-sm text-[var(--gray-9)] max-w-sm">
            Start learning! Topics will appear here as you have conversations with your tutor.
          </p>
          <a href="/" class="mt-6 px-5 py-2.5 text-sm font-medium rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors">
            Start Learning
          </a>
        </div>
      {:else}
        <div class="space-y-4">
          <!-- Due for Review Section -->
          {#if topicsDue.length > 0}
            <div class="p-5 rounded-2xl bg-[var(--warning)]/10 border border-[var(--warning)]/30 mb-6">
              <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-xl bg-[var(--warning)]/20 flex items-center justify-center">
                  <svg class="w-5 h-5 text-[var(--warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>
                <div>
                  <h3 class="font-semibold text-[var(--warning)]">Due for Review</h3>
                  <p class="text-sm text-[var(--gray-9)]">{topicsDue.length} topic{topicsDue.length > 1 ? 's' : ''} need your attention</p>
                </div>
              </div>
              <div class="space-y-2 mb-4">
                {#each topicsDue.slice(0, 3) as topic}
                  {@const reviewInfo = getReviewInfo(topic)}
                  <a
                    href="/?topic={encodeURIComponent(topic.name)}"
                    class="flex items-center justify-between p-3 rounded-xl bg-[var(--gray-2)]/80 hover:bg-[var(--gray-2)] transition-colors"
                  >
                    <span class="text-sm font-medium text-[var(--gray-12)]">{topic.name}</span>
                    <span class="text-xs px-2.5 py-1 rounded-full font-medium {
                      reviewInfo.urgency === 'overdue' ? 'bg-[var(--error)]/20 text-[var(--error)]' : 'bg-[var(--warning)]/20 text-[var(--warning)]'
                    }">
                      {reviewInfo.timeText}
                    </span>
                  </a>
                {/each}
              </div>
              <a
                href="/?review=true"
                class="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl bg-[var(--warning)] text-black hover:opacity-90 transition-opacity"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Start Review Session
              </a>
            </div>
          {/if}

          <!-- All Topics -->
          <div class="grid gap-3">
            {#each topics as topic}
              {@const badge = getStatusBadge(topic.status)}
              {@const reviewInfo = getReviewInfo(topic)}
              <div class="p-5 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)] {
                reviewInfo.urgency === 'overdue' ? 'border-[var(--error)]/50' :
                reviewInfo.urgency === 'due' ? 'border-[var(--warning)]/50' : ''
              }">
                <div class="flex items-start justify-between mb-4">
                  <div>
                    <h3 class="font-semibold text-[var(--gray-12)]">{topic.name}</h3>
                    <p class="text-xs text-[var(--gray-9)] mt-1">
                      Started {formatDate(topic.first_seen)}
                      {#if topic.last_practiced}
                        &middot; Last practiced {formatDate(topic.last_practiced)}
                      {/if}
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    {#if reviewInfo.urgency === 'overdue' || reviewInfo.urgency === 'due'}
                      <span class="px-2.5 py-1 text-xs font-medium rounded-full {
                        reviewInfo.urgency === 'overdue' ? 'bg-[var(--error)]/15 text-[var(--error)]' : 'bg-[var(--warning)]/15 text-[var(--warning)]'
                      }">
                        {reviewInfo.timeText}
                      </span>
                    {/if}
                    <span class="px-2.5 py-1 text-xs font-medium rounded-full {badge.class}">
                      {badge.text}
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-4">
                  <div class="flex-1 h-2 bg-[var(--gray-4)] rounded-full overflow-hidden">
                    <div
                      class="h-full {getMasteryColor(topic.mastery_level)} transition-all duration-500"
                      style="width: {topic.mastery_level * 100}%"
                    ></div>
                  </div>
                  <span class="text-sm font-semibold text-[var(--gray-11)] min-w-[3rem] text-right">
                    {Math.round(topic.mastery_level * 100)}%
                  </span>
                </div>
                {#if reviewInfo.urgency !== 'overdue' && reviewInfo.urgency !== 'due'}
                  <p class="text-xs text-[var(--gray-8)] mt-3">
                    Next review: {reviewInfo.timeText}
                  </p>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {:else if activeTab === 'memories'}
      {#if memories.length === 0}
        <div class="flex flex-col items-center justify-center py-20 text-center">
          <div class="w-20 h-20 rounded-3xl bg-[var(--gray-3)] border border-[var(--gray-4)] flex items-center justify-center mb-5">
            <svg class="w-10 h-10 text-[var(--gray-7)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-[var(--gray-12)] mb-2">No memories yet</h2>
          <p class="text-sm text-[var(--gray-9)] max-w-sm">
            Memories are extracted from your conversations. Keep chatting with your tutor!
          </p>
        </div>
      {:else}
        <div class="grid gap-3">
          {#each memories as memory}
            <div class="p-4 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)] flex items-start gap-4">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 {
                memory.memory_type === 'preference' ? 'bg-pink-500/15 text-pink-400' :
                memory.memory_type === 'struggle' ? 'bg-orange-500/15 text-orange-400' :
                memory.memory_type === 'success' ? 'bg-[var(--success)]/15 text-[var(--success)]' :
                'bg-[var(--accent-muted)] text-[var(--accent)]'
              }">
                {#if memory.memory_type === 'preference'}
                  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                {:else if memory.memory_type === 'struggle'}
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                {:else if memory.memory_type === 'success'}
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                {:else}
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                  </svg>
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-[var(--gray-12)] leading-relaxed">{memory.content}</p>
                <p class="text-xs text-[var(--gray-8)] mt-2">
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
        <div class="flex flex-col items-center justify-center py-20 text-center">
          <div class="w-20 h-20 rounded-3xl bg-[var(--gray-3)] border border-[var(--gray-4)] flex items-center justify-center mb-5">
            <svg class="w-10 h-10 text-[var(--gray-7)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-[var(--gray-12)] mb-2">No facts yet</h2>
          <p class="text-sm text-[var(--gray-9)] max-w-sm">
            Facts about you (like your name, goals, preferences) will be learned over time.
          </p>
        </div>
      {:else}
        <div class="grid gap-3">
          {#each facts as fact}
            <div class="p-4 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)] flex items-center justify-between">
              <div>
                <span class="text-xs font-medium text-[var(--gray-9)] uppercase tracking-wide">{fact.key}</span>
                <p class="text-[var(--gray-12)] mt-1">{fact.value}</p>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-16 h-1.5 bg-[var(--gray-4)] rounded-full overflow-hidden">
                  <div class="h-full bg-[var(--accent)]" style="width: {fact.confidence * 100}%"></div>
                </div>
                <span class="text-xs font-medium text-[var(--gray-9)] min-w-[2.5rem] text-right">
                  {Math.round(fact.confidence * 100)}%
                </span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </main>
</div>
