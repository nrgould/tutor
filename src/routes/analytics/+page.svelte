<script lang="ts">
  import { onMount } from 'svelte';
  import { getTopics, getRecentMemories } from '$lib/services/memoryService';
  import { getConversations } from '$lib/utils/db';
  import type { Conversation } from '$lib/types';

  interface TopicInfo {
    id: string;
    name: string;
    mastery_level: number;
    status: string;
    first_seen?: string;
    last_practiced?: string;
  }

  interface MemoryInfo {
    id: number;
    content: string;
    memory_type: string;
    created_at?: string;
  }

  interface DailyStats {
    date: string;
    conversations: number;
    topics: number;
    memories: number;
  }

  let topics = $state<TopicInfo[]>([]);
  let memories = $state<MemoryInfo[]>([]);
  let conversations = $state<Conversation[]>([]);
  let loading = $state(true);

  // Computed stats
  const totalTopics = $derived(topics.length);
  const avgMastery = $derived(
    topics.length > 0
      ? Math.round((topics.reduce((sum, t) => sum + t.mastery_level, 0) / topics.length) * 100)
      : 0
  );
  const masteredCount = $derived(topics.filter((t) => t.mastery_level >= 0.8).length);
  const learningCount = $derived(topics.filter((t) => t.mastery_level >= 0.4 && t.mastery_level < 0.8).length);
  const strugglingCount = $derived(topics.filter((t) => t.mastery_level < 0.4).length);

  const totalConversations = $derived(conversations.length);
  const totalMemories = $derived(memories.length);
  const successMemories = $derived(memories.filter((m) => m.memory_type === 'success').length);
  const struggleMemories = $derived(memories.filter((m) => m.memory_type === 'struggle').length);

  // Calculate mastery distribution for chart
  const masteryDistribution = $derived(() => {
    const dist = [0, 0, 0, 0, 0]; // 0-20%, 20-40%, 40-60%, 60-80%, 80-100%
    topics.forEach((t) => {
      const idx = Math.min(4, Math.floor(t.mastery_level * 5));
      dist[idx]++;
    });
    return dist;
  });

  // Get learning activity over last 7 days
  const weeklyActivity = $derived(() => {
    const days: DailyStats[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const dayConvos = conversations.filter((c) => c.started_at.startsWith(dateStr)).length;
      const dayTopics = topics.filter((t) => t.first_seen?.startsWith(dateStr)).length;
      const dayMemories = memories.filter((m) => m.created_at?.startsWith(dateStr)).length;

      days.push({
        date: date.toLocaleDateString('en-US', { weekday: 'short' }),
        conversations: dayConvos,
        topics: dayTopics,
        memories: dayMemories,
      });
    }

    return days;
  });

  const maxDailyActivity = $derived(() => {
    const activity = weeklyActivity();
    return Math.max(1, ...activity.map((d) => d.conversations + d.topics + d.memories));
  });

  onMount(async () => {
    try {
      const [topicsData, memoriesData, conversationsData] = await Promise.all([
        getTopics(),
        getRecentMemories(100),
        getConversations(100),
      ]);
      topics = topicsData;
      memories = memoriesData;
      conversations = conversationsData;
    } catch (error) {
      console.error('Failed to load analytics data:', error);
    } finally {
      loading = false;
    }
  });

  function getMasteryLabel(index: number): string {
    const labels = ['0-20%', '20-40%', '40-60%', '60-80%', '80-100%'];
    return labels[index];
  }

  function getMasteryColor(index: number): string {
    const colors = ['bg-[var(--error)]', 'bg-orange-500', 'bg-[var(--warning)]', 'bg-[var(--accent)]', 'bg-[var(--success)]'];
    return colors[index];
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
        <span class="text-[var(--gray-11)]">Analytics</span>
      </div>

      <a
        href="/"
        class="px-4 py-2 text-sm font-medium rounded-xl bg-[var(--gray-3)] border border-[var(--gray-4)] text-[var(--gray-11)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
      >
        Back to Chat
      </a>
    </div>
  </header>

  <!-- Content -->
  <main class="relative z-10 max-w-5xl mx-auto px-6 py-8">
    {#if loading}
      <div class="flex flex-col items-center justify-center py-20">
        <div class="flex gap-1.5">
          <span class="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce"></span>
          <span class="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
          <span class="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
        </div>
        <p class="mt-4 text-sm text-[var(--gray-9)]">Loading analytics...</p>
      </div>
    {:else}
      <div class="space-y-6">
        <!-- Overview Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="p-5 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-xl bg-[var(--accent-muted)] flex items-center justify-center">
                <svg class="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
            </div>
            <p class="text-2xl font-bold text-[var(--gray-12)] tracking-tight">{totalTopics}</p>
            <p class="text-sm text-[var(--gray-9)] mt-1">Total Topics</p>
          </div>

          <div class="p-5 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-xl bg-[var(--accent-muted)] flex items-center justify-center">
                <svg class="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
            </div>
            <p class="text-2xl font-bold text-[var(--gray-12)] tracking-tight">{avgMastery}%</p>
            <p class="text-sm text-[var(--gray-9)] mt-1">Avg Mastery</p>
          </div>

          <div class="p-5 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-xl bg-[var(--success)]/15 flex items-center justify-center">
                <svg class="w-5 h-5 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                </svg>
              </div>
            </div>
            <p class="text-2xl font-bold text-[var(--gray-12)] tracking-tight">{totalConversations}</p>
            <p class="text-sm text-[var(--gray-9)] mt-1">Conversations</p>
          </div>

          <div class="p-5 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-xl bg-[var(--warning)]/15 flex items-center justify-center">
                <svg class="w-5 h-5 text-[var(--warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                </svg>
              </div>
            </div>
            <p class="text-2xl font-bold text-[var(--gray-12)] tracking-tight">{totalMemories}</p>
            <p class="text-sm text-[var(--gray-9)] mt-1">Memories</p>
          </div>
        </div>

        <!-- Topic Status Breakdown -->
        <div class="p-6 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
          <h3 class="text-lg font-semibold text-[var(--gray-12)] mb-5">Topic Progress</h3>
          <div class="grid grid-cols-3 gap-6">
            <div class="text-center">
              <div class="w-16 h-16 mx-auto rounded-2xl bg-[var(--success)]/15 flex items-center justify-center mb-3">
                <span class="text-2xl font-bold text-[var(--success)]">{masteredCount}</span>
              </div>
              <p class="text-sm font-medium text-[var(--gray-11)]">Mastered</p>
              <p class="text-xs text-[var(--gray-9)] mt-0.5">80%+ mastery</p>
            </div>
            <div class="text-center">
              <div class="w-16 h-16 mx-auto rounded-2xl bg-[var(--accent-muted)] flex items-center justify-center mb-3">
                <span class="text-2xl font-bold text-[var(--accent)]">{learningCount}</span>
              </div>
              <p class="text-sm font-medium text-[var(--gray-11)]">Learning</p>
              <p class="text-xs text-[var(--gray-9)] mt-0.5">40-80% mastery</p>
            </div>
            <div class="text-center">
              <div class="w-16 h-16 mx-auto rounded-2xl bg-[var(--warning)]/15 flex items-center justify-center mb-3">
                <span class="text-2xl font-bold text-[var(--warning)]">{strugglingCount}</span>
              </div>
              <p class="text-sm font-medium text-[var(--gray-11)]">Struggling</p>
              <p class="text-xs text-[var(--gray-9)] mt-0.5">Below 40%</p>
            </div>
          </div>
        </div>

        <!-- Weekly Activity Chart -->
        <div class="p-6 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
          <h3 class="text-lg font-semibold text-[var(--gray-12)] mb-5">Weekly Activity</h3>
          <div class="flex items-end justify-between gap-3 h-40">
            {#each weeklyActivity() as day}
              {@const total = day.conversations + day.topics + day.memories}
              {@const height = (total / maxDailyActivity()) * 100}
              <div class="flex-1 flex flex-col items-center">
                <div class="w-full flex flex-col justify-end h-28">
                  {#if total > 0}
                    <div
                      class="w-full bg-[var(--accent)] rounded-t-lg transition-all"
                      style="height: {height}%"
                    ></div>
                  {:else}
                    <div class="w-full h-1 bg-[var(--gray-4)] rounded"></div>
                  {/if}
                </div>
                <p class="text-xs text-[var(--gray-9)] mt-3 font-medium">{day.date}</p>
                <p class="text-sm font-semibold text-[var(--gray-12)]">{total}</p>
              </div>
            {/each}
          </div>
          <p class="text-center text-xs text-[var(--gray-9)] mt-4">
            Activities per day (conversations + topics + memories)
          </p>
        </div>

        <!-- Mastery Distribution -->
        <div class="p-6 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
          <h3 class="text-lg font-semibold text-[var(--gray-12)] mb-5">Mastery Distribution</h3>
          {#if totalTopics === 0}
            <div class="py-8 text-center">
              <div class="w-14 h-14 mx-auto rounded-2xl bg-[var(--gray-3)] border border-[var(--gray-4)] flex items-center justify-center mb-4">
                <svg class="w-7 h-7 text-[var(--gray-7)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <p class="text-sm text-[var(--gray-9)]">No topics yet. Start learning to see your progress!</p>
            </div>
          {:else}
            <div class="space-y-4">
              {#each masteryDistribution() as count, index}
                {@const percentage = totalTopics > 0 ? (count / totalTopics) * 100 : 0}
                <div class="flex items-center gap-4">
                  <span class="text-sm font-medium text-[var(--gray-9)] w-20">{getMasteryLabel(index)}</span>
                  <div class="flex-1 h-3 bg-[var(--gray-4)] rounded-full overflow-hidden">
                    <div
                      class="h-full {getMasteryColor(index)} transition-all duration-500"
                      style="width: {percentage}%"
                    ></div>
                  </div>
                  <span class="text-sm font-semibold text-[var(--gray-11)] w-8 text-right">{count}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Memory Insights -->
        <div class="grid md:grid-cols-2 gap-4">
          <div class="p-6 rounded-2xl bg-[var(--success)]/10 border border-[var(--success)]/30">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl bg-[var(--success)]/20 flex items-center justify-center">
                <svg class="w-5 h-5 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <div>
                <h3 class="font-semibold text-[var(--success)]">Breakthroughs</h3>
                <p class="text-xs text-[var(--gray-9)]">Moments of understanding</p>
              </div>
            </div>
            <p class="text-3xl font-bold text-[var(--success)]">{successMemories}</p>
            <p class="text-sm text-[var(--gray-9)] mt-1">
              {totalMemories > 0 ? Math.round((successMemories / totalMemories) * 100) : 0}% of memories
            </p>
          </div>

          <div class="p-6 rounded-2xl bg-[var(--warning)]/10 border border-[var(--warning)]/30">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl bg-[var(--warning)]/20 flex items-center justify-center">
                <svg class="w-5 h-5 text-[var(--warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h3 class="font-semibold text-[var(--warning)]">Struggles</h3>
                <p class="text-xs text-[var(--gray-9)]">Areas needing attention</p>
              </div>
            </div>
            <p class="text-3xl font-bold text-[var(--warning)]">{struggleMemories}</p>
            <p class="text-sm text-[var(--gray-9)] mt-1">
              {totalMemories > 0 ? Math.round((struggleMemories / totalMemories) * 100) : 0}% of memories
            </p>
          </div>
        </div>

        <!-- Top Topics by Mastery -->
        {#if topics.length > 0}
          <div class="p-6 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
            <h3 class="text-lg font-semibold text-[var(--gray-12)] mb-5">Top Topics by Mastery</h3>
            <div class="space-y-3">
              {#each [...topics].sort((a, b) => b.mastery_level - a.mastery_level).slice(0, 5) as topic, i}
                <div class="flex items-center gap-4">
                  <span class="w-6 h-6 rounded-lg bg-[var(--gray-4)] flex items-center justify-center text-xs font-semibold text-[var(--gray-11)]">
                    {i + 1}
                  </span>
                  <span class="text-sm font-medium text-[var(--gray-12)] flex-1 truncate">{topic.name}</span>
                  <div class="w-32 h-2 bg-[var(--gray-4)] rounded-full overflow-hidden">
                    <div
                      class="h-full bg-[var(--accent)] transition-all duration-500"
                      style="width: {topic.mastery_level * 100}%"
                    ></div>
                  </div>
                  <span class="text-sm font-semibold text-[var(--gray-11)] w-12 text-right">
                    {Math.round(topic.mastery_level * 100)}%
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </main>
</div>
