<script lang="ts">
  import { recordingStore } from '$lib/stores/recording';

  const recording = $derived($recordingStore);

  function formatDuration(startedAt: string): string {
    const start = new Date(startedAt + 'Z');
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const mins = Math.floor(diffSecs / 60);
    const secs = diffSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  async function toggleRecording() {
    if (recording.status.is_recording) {
      await recordingStore.stopRecording();
    } else {
      await recordingStore.startRecording(30);
    }
  }

  // Update duration every second when recording
  let duration = $state('0:00');
  $effect(() => {
    if (recording.status.is_recording && recording.status.started_at) {
      const interval = setInterval(() => {
        duration = formatDuration(recording.status.started_at!);
      }, 1000);
      return () => clearInterval(interval);
    }
  });
</script>

{#if recording.status.is_recording}
  <button
    class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--error)]/10 text-[var(--error)] hover:bg-[var(--error)]/20 transition-colors"
    onclick={toggleRecording}
    disabled={recording.isLoading}
    title="Stop recording"
  >
    <span class="relative flex h-2 w-2">
      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--error)] opacity-75"></span>
      <span class="relative inline-flex rounded-full h-2 w-2 bg-[var(--error)]"></span>
    </span>
    <span class="text-xs font-medium">{duration}</span>
    <span class="text-xs text-[var(--gray-10)]">({recording.status.screenshot_count})</span>
  </button>
{:else}
  <button
    class="p-2 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
    onclick={toggleRecording}
    disabled={recording.isLoading}
    title="Start recording session"
  >
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" fill="currentColor" />
    </svg>
  </button>
{/if}
