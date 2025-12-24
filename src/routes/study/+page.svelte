<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { getTopics } from '$lib/services/memoryService';
  import { getTopicsDueForReview } from '$lib/utils/spacedRepetition';
  import { notifyStudySessionComplete, notifyBreakTime } from '$lib/services/notificationService';

  interface TopicInfo {
    id: string;
    name: string;
    mastery_level: number;
    status: string;
    last_practiced?: string;
  }

  // Session configuration
  let sessionDuration = $state(25); // minutes (Pomodoro default)
  let selectedTopics = $state<string[]>([]);
  let sessionGoal = $state('');

  // Session state
  let isSessionActive = $state(false);
  let isPaused = $state(false);
  let timeRemaining = $state(0); // seconds
  let sessionStartTime = $state<Date | null>(null);
  let topicsReviewed = $state<string[]>([]);
  let questionsAsked = $state(0);

  // Data
  let allTopics = $state<TopicInfo[]>([]);
  let topicsDue = $state<TopicInfo[]>([]);
  let loading = $state(true);

  // Timer interval
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    try {
      allTopics = await getTopics();
      topicsDue = getTopicsDueForReview(allTopics);
      // Pre-select due topics
      selectedTopics = topicsDue.slice(0, 3).map((t) => t.id);
    } catch (error) {
      console.error('Failed to load topics:', error);
    } finally {
      loading = false;
    }
  });

  onDestroy(() => {
    if (timerInterval) {
      clearInterval(timerInterval);
    }
  });

  function startSession() {
    isSessionActive = true;
    isPaused = false;
    timeRemaining = sessionDuration * 60;
    sessionStartTime = new Date();
    topicsReviewed = [];
    questionsAsked = 0;

    timerInterval = setInterval(() => {
      if (!isPaused && timeRemaining > 0) {
        timeRemaining--;
      } else if (timeRemaining === 0) {
        endSession();
      }
    }, 1000);
  }

  function pauseSession() {
    isPaused = !isPaused;
  }

  async function endSession() {
    isSessionActive = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    // Send notification about session completion
    const duration = sessionStartTime
      ? Math.floor((Date.now() - sessionStartTime.getTime()) / 1000 / 60)
      : sessionDuration;
    await notifyStudySessionComplete(duration, selectedTopics.length);
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function startStudying() {
    // Navigate to chat with selected topics context
    const topicNames = allTopics
      .filter((t) => selectedTopics.includes(t.id))
      .map((t) => t.name)
      .join(', ');

    goto(`/?study=true&topics=${encodeURIComponent(topicNames)}&goal=${encodeURIComponent(sessionGoal)}`);
  }

  function toggleTopic(topicId: string) {
    if (selectedTopics.includes(topicId)) {
      selectedTopics = selectedTopics.filter((id) => id !== topicId);
    } else {
      selectedTopics = [...selectedTopics, topicId];
    }
  }

  function selectAllDue() {
    selectedTopics = topicsDue.map((t) => t.id);
  }

  function clearSelection() {
    selectedTopics = [];
  }

  const progressPercent = $derived(
    sessionDuration > 0 ? ((sessionDuration * 60 - timeRemaining) / (sessionDuration * 60)) * 100 : 0
  );
</script>

<div class="min-h-screen bg-[var(--gray-1)]">
  <!-- Gradient background -->
  <div class="fixed inset-0 overflow-hidden pointer-events-none">
    <div class="absolute -top-[40%] -right-[20%] w-[70%] h-[70%] rounded-full bg-[var(--accent-9)] opacity-[0.03] blur-[100px]"></div>
    <div class="absolute -bottom-[30%] -left-[10%] w-[50%] h-[50%] rounded-full bg-[var(--success)] opacity-[0.02] blur-[80px]"></div>
  </div>

  <!-- Header -->
  <header class="relative z-10 border-b border-[var(--gray-3)] bg-[var(--gray-1)]/80 backdrop-blur-xl">
    <div class="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <a href="/" class="flex items-center gap-3 group">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent-8)] to-[var(--accent-9)] flex items-center justify-center shadow-lg shadow-[var(--accent-9)]/20">
            <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
            </svg>
          </div>
          <span class="font-semibold text-[var(--gray-12)] group-hover:text-[var(--accent-11)] transition-colors">Tutor</span>
        </a>
        <span class="text-[var(--gray-7)]">/</span>
        <span class="text-[var(--gray-11)]">Study Session</span>
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
  <main class="relative z-10 max-w-3xl mx-auto px-6 py-8">
    {#if loading}
      <div class="flex flex-col items-center justify-center py-20">
        <div class="flex gap-1.5">
          <span class="w-2 h-2 bg-[var(--accent-9)] rounded-full animate-bounce"></span>
          <span class="w-2 h-2 bg-[var(--accent-9)] rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
          <span class="w-2 h-2 bg-[var(--accent-9)] rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
        </div>
        <p class="mt-4 text-sm text-[var(--gray-9)]">Loading topics...</p>
      </div>
    {:else if !isSessionActive}
      <!-- Session Setup -->
      <div class="space-y-6">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-[var(--gray-12)] tracking-tight mb-2">Start a Study Session</h1>
          <p class="text-[var(--gray-9)]">Focus on your learning with a timed session</p>
        </div>

        <!-- Timer Selection -->
        <div class="p-6 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
          <div class="flex items-center gap-3 mb-5">
            <div class="w-10 h-10 rounded-xl bg-[var(--accent-9)]/15 flex items-center justify-center">
              <svg class="w-5 h-5 text-[var(--accent-11)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div>
              <h2 class="font-semibold text-[var(--gray-12)]">Session Duration</h2>
              <p class="text-sm text-[var(--gray-9)]">Choose how long you want to study</p>
            </div>
          </div>
          <div class="grid grid-cols-4 gap-3">
            {#each [15, 25, 45, 60] as duration}
              <button
                class="py-3 px-4 text-sm font-medium rounded-xl transition-colors {sessionDuration === duration
                  ? 'bg-[var(--accent-9)] text-white shadow-lg shadow-[var(--accent-9)]/20'
                  : 'bg-[var(--gray-3)] border border-[var(--gray-4)] text-[var(--gray-11)] hover:bg-[var(--gray-4)]'}"
                onclick={() => (sessionDuration = duration)}
              >
                {duration} min
              </button>
            {/each}
          </div>
        </div>

        <!-- Goal Setting -->
        <div class="p-6 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
          <div class="flex items-center gap-3 mb-5">
            <div class="w-10 h-10 rounded-xl bg-[var(--success)]/15 flex items-center justify-center">
              <svg class="w-5 h-5 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
              </svg>
            </div>
            <div>
              <h2 class="font-semibold text-[var(--gray-12)]">Session Goal</h2>
              <p class="text-sm text-[var(--gray-9)]">Optional: What do you want to achieve?</p>
            </div>
          </div>
          <input
            type="text"
            bind:value={sessionGoal}
            placeholder="e.g., Understand recursion basics"
            class="w-full px-4 py-3 text-sm rounded-xl border border-[var(--gray-4)] bg-[var(--gray-3)] text-[var(--gray-12)]
              placeholder:text-[var(--gray-8)]
              focus:outline-none focus:border-[var(--accent-7)] focus:ring-1 focus:ring-[var(--accent-8)]/30 transition-colors"
          />
        </div>

        <!-- Topic Selection -->
        <div class="p-6 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
          <div class="flex items-center justify-between mb-5">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-[var(--info)]/15 flex items-center justify-center">
                <svg class="w-5 h-5 text-[var(--info)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div>
                <h2 class="font-semibold text-[var(--gray-12)]">Topics to Review</h2>
                <p class="text-sm text-[var(--gray-9)]">{selectedTopics.length} selected</p>
              </div>
            </div>
            <div class="flex gap-3">
              {#if topicsDue.length > 0}
                <button
                  class="text-sm font-medium text-[var(--accent-11)] hover:text-[var(--accent-12)]"
                  onclick={selectAllDue}
                >
                  Select due ({topicsDue.length})
                </button>
              {/if}
              <button
                class="text-sm text-[var(--gray-9)] hover:text-[var(--gray-11)]"
                onclick={clearSelection}
              >
                Clear
              </button>
            </div>
          </div>

          {#if allTopics.length === 0}
            <div class="py-8 text-center">
              <div class="w-14 h-14 mx-auto rounded-2xl bg-[var(--gray-3)] border border-[var(--gray-4)] flex items-center justify-center mb-4">
                <svg class="w-7 h-7 text-[var(--gray-7)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <p class="text-sm text-[var(--gray-9)]">No topics yet. Start chatting to build your topic list!</p>
            </div>
          {:else}
            <div class="space-y-2 max-h-56 overflow-y-auto">
              {#each allTopics as topic}
                {@const isDue = topicsDue.some((t) => t.id === topic.id)}
                <button
                  class="w-full flex items-center justify-between p-3 rounded-xl transition-colors text-left {selectedTopics.includes(topic.id)
                    ? 'bg-[var(--accent-9)]/10 border border-[var(--accent-7)]'
                    : 'bg-[var(--gray-3)] border border-[var(--gray-4)] hover:bg-[var(--gray-4)]'}"
                  onclick={() => toggleTopic(topic.id)}
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors {selectedTopics.includes(topic.id)
                        ? 'bg-[var(--accent-9)] border-[var(--accent-9)]'
                        : 'border-[var(--gray-6)]'}"
                    >
                      {#if selectedTopics.includes(topic.id)}
                        <svg class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      {/if}
                    </div>
                    <span class="text-sm font-medium text-[var(--gray-12)]">{topic.name}</span>
                    {#if isDue}
                      <span class="px-2 py-0.5 text-xs font-medium rounded-full bg-[var(--warning)]/15 text-[var(--warning)]">Due</span>
                    {/if}
                  </div>
                  <span class="text-xs font-medium text-[var(--gray-9)]">{Math.round(topic.mastery_level * 100)}%</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Start Button -->
        <button
          class="w-full py-4 text-sm font-medium rounded-xl bg-[var(--accent-9)] text-white hover:bg-[var(--accent-10)] transition-colors shadow-lg shadow-[var(--accent-9)]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          onclick={startSession}
          disabled={allTopics.length === 0}
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
          </svg>
          Start Session
        </button>
      </div>
    {:else}
      <!-- Active Session -->
      <div class="space-y-6">
        <!-- Timer Display -->
        <div class="p-10 rounded-3xl bg-[var(--gray-2)] border border-[var(--gray-4)] text-center">
          <div class="text-7xl font-mono font-bold text-[var(--gray-12)] tracking-tight mb-6">
            {formatTime(timeRemaining)}
          </div>

          <!-- Progress Bar -->
          <div class="w-full h-2 bg-[var(--gray-4)] rounded-full overflow-hidden mb-8">
            <div
              class="h-full bg-gradient-to-r from-[var(--accent-8)] to-[var(--accent-9)] transition-all duration-1000"
              style="width: {progressPercent}%"
            ></div>
          </div>

          <!-- Timer Controls -->
          <div class="flex justify-center gap-3">
            <button
              onclick={pauseSession}
              class="px-6 py-3 text-sm font-medium rounded-xl bg-[var(--gray-3)] border border-[var(--gray-4)] text-[var(--gray-11)] hover:bg-[var(--gray-4)] transition-colors flex items-center gap-2"
            >
              {#if isPaused}
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
                Resume
              {:else}
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                </svg>
                Pause
              {/if}
            </button>
            <button
              onclick={endSession}
              class="px-6 py-3 text-sm font-medium rounded-xl bg-[var(--error)]/15 text-[var(--error)] hover:bg-[var(--error)]/20 transition-colors flex items-center gap-2"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
              </svg>
              End Session
            </button>
          </div>
        </div>

        <!-- Session Info -->
        {#if sessionGoal}
          <div class="p-5 rounded-2xl bg-[var(--accent-9)]/10 border border-[var(--accent-7)]">
            <p class="text-xs font-medium text-[var(--accent-11)] mb-1">Session Goal</p>
            <p class="text-sm text-[var(--gray-12)]">{sessionGoal}</p>
          </div>
        {/if}

        <!-- Selected Topics -->
        {#if selectedTopics.length > 0}
          <div class="p-5 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
            <p class="text-xs font-medium text-[var(--gray-9)] mb-3">Topics for this session</p>
            <div class="flex flex-wrap gap-2">
              {#each allTopics.filter((t) => selectedTopics.includes(t.id)) as topic}
                <span class="px-3 py-1.5 text-sm font-medium rounded-lg bg-[var(--gray-3)] border border-[var(--gray-4)] text-[var(--gray-11)]">
                  {topic.name}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Start Studying Button -->
        <button
          class="w-full py-4 text-sm font-medium rounded-xl bg-[var(--accent-9)] text-white hover:bg-[var(--accent-10)] transition-colors shadow-lg shadow-[var(--accent-9)]/20 flex items-center justify-center gap-2"
          onclick={startStudying}
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
          </svg>
          Open Chat & Start Studying
        </button>
      </div>
    {/if}
  </main>
</div>
