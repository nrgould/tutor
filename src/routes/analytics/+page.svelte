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
    const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];
    return colors[index];
  }
</script>

<div class="h-screen flex flex-col bg-tutor-bg">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-tutor-border bg-tutor-surface">
    <div class="flex items-center gap-2">
      <a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <div class="w-8 h-8 rounded-lg bg-tutor-accent flex items-center justify-center">
          <span class="text-white font-bold text-sm">T</span>
        </div>
        <span class="font-semibold text-tutor-text">Tutor</span>
      </a>
      <span class="text-tutor-text-secondary">/</span>
      <span class="text-tutor-text">Analytics</span>
    </div>

    <a
      href="/"
      class="px-3 py-1.5 text-sm rounded-lg bg-tutor-border text-tutor-text hover:bg-tutor-border/80 transition-colors"
    >
      Back to Chat
    </a>
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
    {:else}
      <div class="max-w-4xl mx-auto space-y-6">
        <!-- Overview Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
            <p class="text-xs text-tutor-text-secondary mb-1">Total Topics</p>
            <p class="text-2xl font-bold text-tutor-text">{totalTopics}</p>
          </div>
          <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
            <p class="text-xs text-tutor-text-secondary mb-1">Avg Mastery</p>
            <p class="text-2xl font-bold text-tutor-text">{avgMastery}%</p>
          </div>
          <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
            <p class="text-xs text-tutor-text-secondary mb-1">Conversations</p>
            <p class="text-2xl font-bold text-tutor-text">{totalConversations}</p>
          </div>
          <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
            <p class="text-xs text-tutor-text-secondary mb-1">Memories</p>
            <p class="text-2xl font-bold text-tutor-text">{totalMemories}</p>
          </div>
        </div>

        <!-- Topic Status Breakdown -->
        <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
          <h3 class="text-sm font-medium text-tutor-text mb-4">Topic Progress</h3>
          <div class="grid grid-cols-3 gap-4">
            <div class="text-center">
              <div class="w-12 h-12 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-2">
                <span class="text-lg font-bold text-green-400">{masteredCount}</span>
              </div>
              <p class="text-xs text-tutor-text-secondary">Mastered</p>
            </div>
            <div class="text-center">
              <div class="w-12 h-12 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center mb-2">
                <span class="text-lg font-bold text-blue-400">{learningCount}</span>
              </div>
              <p class="text-xs text-tutor-text-secondary">Learning</p>
            </div>
            <div class="text-center">
              <div class="w-12 h-12 mx-auto rounded-full bg-orange-500/20 flex items-center justify-center mb-2">
                <span class="text-lg font-bold text-orange-400">{strugglingCount}</span>
              </div>
              <p class="text-xs text-tutor-text-secondary">Struggling</p>
            </div>
          </div>
        </div>

        <!-- Weekly Activity Chart -->
        <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
          <h3 class="text-sm font-medium text-tutor-text mb-4">Weekly Activity</h3>
          <div class="flex items-end justify-between gap-2 h-32">
            {#each weeklyActivity() as day}
              {@const total = day.conversations + day.topics + day.memories}
              {@const height = (total / maxDailyActivity()) * 100}
              <div class="flex-1 flex flex-col items-center">
                <div class="w-full flex flex-col justify-end h-24">
                  {#if total > 0}
                    <div
                      class="w-full bg-tutor-accent rounded-t transition-all"
                      style="height: {height}%"
                    ></div>
                  {:else}
                    <div class="w-full h-1 bg-tutor-border rounded"></div>
                  {/if}
                </div>
                <p class="text-xs text-tutor-text-secondary mt-2">{day.date}</p>
                <p class="text-xs text-tutor-text font-medium">{total}</p>
              </div>
            {/each}
          </div>
          <div class="flex justify-center gap-4 mt-4 text-xs text-tutor-text-secondary">
            <span>Activities per day (conversations + topics + memories)</span>
          </div>
        </div>

        <!-- Mastery Distribution -->
        <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
          <h3 class="text-sm font-medium text-tutor-text mb-4">Mastery Distribution</h3>
          {#if totalTopics === 0}
            <p class="text-sm text-tutor-text-secondary text-center py-4">
              No topics yet. Start learning to see your progress!
            </p>
          {:else}
            <div class="space-y-3">
              {#each masteryDistribution() as count, index}
                {@const percentage = totalTopics > 0 ? (count / totalTopics) * 100 : 0}
                <div class="flex items-center gap-3">
                  <span class="text-xs text-tutor-text-secondary w-16">{getMasteryLabel(index)}</span>
                  <div class="flex-1 h-4 bg-tutor-border rounded-full overflow-hidden">
                    <div
                      class="h-full {getMasteryColor(index)} transition-all"
                      style="width: {percentage}%"
                    ></div>
                  </div>
                  <span class="text-xs text-tutor-text w-8 text-right">{count}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Memory Insights -->
        <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
          <h3 class="text-sm font-medium text-tutor-text mb-4">Memory Insights</h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <div class="flex items-center gap-2 mb-1">
                <svg class="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <span class="text-xs text-green-400">Breakthroughs</span>
              </div>
              <p class="text-xl font-bold text-green-400">{successMemories}</p>
              <p class="text-xs text-tutor-text-secondary mt-1">
                {totalMemories > 0 ? Math.round((successMemories / totalMemories) * 100) : 0}% of memories
              </p>
            </div>
            <div class="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <div class="flex items-center gap-2 mb-1">
                <svg class="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span class="text-xs text-orange-400">Struggles</span>
              </div>
              <p class="text-xl font-bold text-orange-400">{struggleMemories}</p>
              <p class="text-xs text-tutor-text-secondary mt-1">
                {totalMemories > 0 ? Math.round((struggleMemories / totalMemories) * 100) : 0}% of memories
              </p>
            </div>
          </div>
        </div>

        <!-- Top Topics by Mastery -->
        {#if topics.length > 0}
          <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
            <h3 class="text-sm font-medium text-tutor-text mb-4">Top Topics by Mastery</h3>
            <div class="space-y-2">
              {#each [...topics].sort((a, b) => b.mastery_level - a.mastery_level).slice(0, 5) as topic}
                <div class="flex items-center gap-3">
                  <span class="text-sm text-tutor-text flex-1 truncate">{topic.name}</span>
                  <div class="w-24 h-2 bg-tutor-border rounded-full overflow-hidden">
                    <div
                      class="h-full bg-tutor-accent transition-all"
                      style="width: {topic.mastery_level * 100}%"
                    ></div>
                  </div>
                  <span class="text-xs text-tutor-text-secondary w-10 text-right">
                    {Math.round(topic.mastery_level * 100)}%
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
