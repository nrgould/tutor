<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { getTopics } from '$lib/services/memoryService';
  import { getTopicsDueForReview } from '$lib/utils/spacedRepetition';
  import { notifyStudySessionComplete, notifyBreakTime } from '$lib/services/notificationService';
  import Button from '$lib/components/shared/Button.svelte';

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

  function getSessionDurationText(): string {
    if (!sessionStartTime) return '0 min';
    const elapsed = Math.floor((Date.now() - sessionStartTime.getTime()) / 1000 / 60);
    return `${elapsed} min`;
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
      <span class="text-tutor-text">Study Session</span>
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
    {:else if !isSessionActive}
      <!-- Session Setup -->
      <div class="max-w-xl mx-auto space-y-6">
        <div class="text-center">
          <h1 class="text-2xl font-bold text-tutor-text mb-2">Start a Study Session</h1>
          <p class="text-tutor-text-secondary">Focus on your learning with a timed session</p>
        </div>

        <!-- Timer Selection -->
        <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
          <label class="block text-sm font-medium text-tutor-text mb-3">Session Duration</label>
          <div class="grid grid-cols-4 gap-2">
            {#each [15, 25, 45, 60] as duration}
              <button
                class="py-2 px-3 text-sm font-medium rounded-lg transition-colors {sessionDuration === duration
                  ? 'bg-tutor-accent text-white'
                  : 'bg-tutor-border text-tutor-text hover:bg-tutor-border/80'}"
                onclick={() => (sessionDuration = duration)}
              >
                {duration} min
              </button>
            {/each}
          </div>
        </div>

        <!-- Goal Setting -->
        <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
          <label for="goal" class="block text-sm font-medium text-tutor-text mb-2">
            Session Goal <span class="text-tutor-text-secondary">(optional)</span>
          </label>
          <input
            id="goal"
            type="text"
            bind:value={sessionGoal}
            placeholder="e.g., Understand recursion basics"
            class="w-full px-3 py-2 text-sm rounded-lg border border-tutor-border bg-tutor-bg text-tutor-text
              placeholder:text-tutor-text-secondary
              focus:outline-none focus:ring-2 focus:ring-tutor-accent focus:border-transparent"
          />
        </div>

        <!-- Topic Selection -->
        <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
          <div class="flex items-center justify-between mb-3">
            <label class="block text-sm font-medium text-tutor-text">
              Topics to Review ({selectedTopics.length} selected)
            </label>
            <div class="flex gap-2">
              {#if topicsDue.length > 0}
                <button
                  class="text-xs text-tutor-accent hover:underline"
                  onclick={selectAllDue}
                >
                  Select due ({topicsDue.length})
                </button>
              {/if}
              <button
                class="text-xs text-tutor-text-secondary hover:underline"
                onclick={clearSelection}
              >
                Clear
              </button>
            </div>
          </div>

          {#if allTopics.length === 0}
            <p class="text-sm text-tutor-text-secondary text-center py-4">
              No topics yet. Start chatting to build your topic list!
            </p>
          {:else}
            <div class="space-y-2 max-h-48 overflow-y-auto">
              {#each allTopics as topic}
                {@const isDue = topicsDue.some((t) => t.id === topic.id)}
                <button
                  class="w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left {selectedTopics.includes(topic.id)
                    ? 'bg-tutor-accent/10 border border-tutor-accent'
                    : 'bg-tutor-bg border border-transparent hover:border-tutor-border'}"
                  onclick={() => toggleTopic(topic.id)}
                >
                  <div class="flex items-center gap-2">
                    <div
                      class="w-4 h-4 rounded border-2 flex items-center justify-center {selectedTopics.includes(topic.id)
                        ? 'bg-tutor-accent border-tutor-accent'
                        : 'border-tutor-border'}"
                    >
                      {#if selectedTopics.includes(topic.id)}
                        <svg class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                        </svg>
                      {/if}
                    </div>
                    <span class="text-sm text-tutor-text">{topic.name}</span>
                    {#if isDue}
                      <span class="px-1.5 py-0.5 text-xs rounded bg-orange-500/20 text-orange-400">Due</span>
                    {/if}
                  </div>
                  <span class="text-xs text-tutor-text-secondary">{Math.round(topic.mastery_level * 100)}%</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Start Button -->
        <Button class="w-full py-3" onclick={startSession} disabled={allTopics.length === 0}>
          <svg class="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Start Session
        </Button>
      </div>
    {:else}
      <!-- Active Session -->
      <div class="max-w-xl mx-auto space-y-6">
        <!-- Timer Display -->
        <div class="p-8 rounded-2xl bg-tutor-surface border border-tutor-border text-center">
          <div class="text-6xl font-mono font-bold text-tutor-text mb-4">
            {formatTime(timeRemaining)}
          </div>

          <!-- Progress Bar -->
          <div class="w-full h-2 bg-tutor-border rounded-full overflow-hidden mb-6">
            <div
              class="h-full bg-tutor-accent transition-all duration-1000"
              style="width: {progressPercent}%"
            ></div>
          </div>

          <!-- Timer Controls -->
          <div class="flex justify-center gap-3">
            <Button variant="secondary" onclick={pauseSession}>
              {#if isPaused}
                <svg class="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                </svg>
                Resume
              {:else}
                <svg class="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Pause
              {/if}
            </Button>
            <Button variant="secondary" onclick={endSession}>
              <svg class="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              End Session
            </Button>
          </div>
        </div>

        <!-- Session Info -->
        {#if sessionGoal}
          <div class="p-4 rounded-xl bg-tutor-accent/10 border border-tutor-accent/30">
            <p class="text-xs text-tutor-accent mb-1">Session Goal</p>
            <p class="text-sm text-tutor-text">{sessionGoal}</p>
          </div>
        {/if}

        <!-- Selected Topics -->
        {#if selectedTopics.length > 0}
          <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
            <p class="text-xs text-tutor-text-secondary mb-2">Topics for this session</p>
            <div class="flex flex-wrap gap-2">
              {#each allTopics.filter((t) => selectedTopics.includes(t.id)) as topic}
                <span class="px-2 py-1 text-sm rounded-lg bg-tutor-border text-tutor-text">
                  {topic.name}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Start Studying Button -->
        <Button class="w-full py-3" onclick={startStudying}>
          <svg class="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Open Chat & Start Studying
        </Button>
      </div>
    {/if}
  </div>
</div>
