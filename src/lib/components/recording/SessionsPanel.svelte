<script lang="ts">
  import { recordingStore } from '$lib/stores/recording';
  import type { RecordingSession, Screenshot } from '$lib/types';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  const recording = $derived($recordingStore);

  let selectedSession = $state<RecordingSession | null>(null);
  let screenshots = $state<Screenshot[]>([]);
  let loadingScreenshots = $state(false);
  let selectedScreenshot = $state<Screenshot | null>(null);
  let loadingFullImage = $state(false);

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'Z');
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function formatDuration(session: RecordingSession): string {
    if (!session.ended_at) return 'In progress';
    const start = new Date(session.started_at + 'Z');
    const end = new Date(session.ended_at + 'Z');
    const diffMs = end.getTime() - start.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  }

  async function selectSession(session: RecordingSession) {
    selectedSession = session;
    loadingScreenshots = true;
    try {
      screenshots = await recordingStore.getSessionScreenshots(session.id, false);
    } catch (e) {
      console.error('Failed to load screenshots:', e);
      screenshots = [];
    } finally {
      loadingScreenshots = false;
    }
  }

  async function viewScreenshot(screenshot: Screenshot) {
    loadingFullImage = true;
    try {
      selectedScreenshot = await recordingStore.getScreenshot(screenshot.id);
    } catch (e) {
      console.error('Failed to load screenshot:', e);
    } finally {
      loadingFullImage = false;
    }
  }

  function closeScreenshotView() {
    selectedScreenshot = null;
  }

  function goBack() {
    if (selectedScreenshot) {
      selectedScreenshot = null;
    } else if (selectedSession) {
      selectedSession = null;
      screenshots = [];
    } else {
      onclose();
    }
  }

  async function deleteSession(session: RecordingSession) {
    if (!confirm(`Delete this recording session with ${session.screenshot_count} screenshots?`)) {
      return;
    }
    try {
      await recordingStore.deleteSession(session.id);
      if (selectedSession?.id === session.id) {
        selectedSession = null;
        screenshots = [];
      }
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex">
    <!-- Backdrop -->
    <button class="absolute inset-0 bg-black/50" onclick={onclose} aria-label="Close panel"></button>

    <!-- Panel -->
    <div class="relative ml-auto w-full max-w-md h-full bg-[var(--gray-2)] border-l border-[var(--gray-4)] flex flex-col animate-slide-in-left">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--gray-4)]">
        <div class="flex items-center gap-3">
          <button
            class="p-1.5 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
            onclick={goBack}
            aria-label="Go back"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h2 class="text-sm font-semibold text-[var(--gray-12)]">
            {#if selectedScreenshot}
              Screenshot
            {:else if selectedSession}
              {selectedSession.name || 'Recording Session'}
            {:else}
              Recording Sessions
            {/if}
          </h2>
        </div>
        <button
          class="p-1.5 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
          onclick={onclose}
          aria-label="Close"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto">
        {#if selectedScreenshot}
          <!-- Full screenshot view -->
          <div class="p-4">
            <div class="rounded-lg overflow-hidden border border-[var(--gray-4)] bg-[var(--gray-3)]">
              {#if loadingFullImage}
                <div class="aspect-video flex items-center justify-center">
                  <div class="animate-spin w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full"></div>
                </div>
              {:else}
                <img
                  src="data:image/png;base64,{selectedScreenshot.image_data}"
                  alt="Screenshot"
                  class="w-full"
                />
              {/if}
            </div>
            <div class="mt-3 text-xs text-[var(--gray-10)]">
              {formatDate(selectedScreenshot.captured_at)}
            </div>
          </div>
        {:else if selectedSession}
          <!-- Session screenshots grid -->
          <div class="p-4">
            <div class="mb-4 flex items-center justify-between">
              <div class="text-xs text-[var(--gray-10)]">
                {screenshots.length} screenshot{screenshots.length !== 1 ? 's' : ''}
              </div>
              <div class="text-xs text-[var(--gray-10)]">
                {formatDuration(selectedSession)}
              </div>
            </div>

            {#if loadingScreenshots}
              <div class="flex items-center justify-center py-12">
                <div class="animate-spin w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full"></div>
              </div>
            {:else if screenshots.length === 0}
              <div class="text-center py-12 text-sm text-[var(--gray-10)]">
                No screenshots in this session
              </div>
            {:else}
              <div class="grid grid-cols-2 gap-2">
                {#each screenshots as screenshot (screenshot.id)}
                  <button
                    class="group relative rounded-lg overflow-hidden border border-[var(--gray-4)] bg-[var(--gray-3)] hover:border-[var(--accent)] transition-colors"
                    onclick={() => viewScreenshot(screenshot)}
                  >
                    {#if screenshot.thumbnail_data}
                      <img
                        src="data:image/png;base64,{screenshot.thumbnail_data}"
                        alt="Screenshot thumbnail"
                        class="w-full aspect-video object-cover"
                      />
                    {:else}
                      <div class="w-full aspect-video flex items-center justify-center">
                        <svg class="w-6 h-6 text-[var(--gray-7)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    {/if}
                    <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors"></div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          <!-- Sessions list -->
          {#if recording.isLoading}
            <div class="flex items-center justify-center py-12">
              <div class="animate-spin w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full"></div>
            </div>
          {:else if recording.sessions.length === 0}
            <div class="text-center py-12">
              <svg class="w-12 h-12 mx-auto mb-3 text-[var(--gray-6)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p class="text-sm text-[var(--gray-10)]">No recording sessions yet</p>
              <p class="text-xs text-[var(--gray-9)] mt-1">Start recording to capture your screen</p>
            </div>
          {:else}
            <div class="divide-y divide-[var(--gray-4)]">
              {#each recording.sessions as session (session.id)}
                <div class="flex items-center gap-3 px-4 py-3 hover:bg-[var(--gray-3)] transition-colors">
                  <button
                    class="flex-1 text-left"
                    onclick={() => selectSession(session)}
                  >
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium text-[var(--gray-12)]">
                        {session.name || 'Recording Session'}
                      </span>
                      {#if !session.ended_at}
                        <span class="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--error)]/10 text-[var(--error)]">
                          Live
                        </span>
                      {/if}
                    </div>
                    <div class="flex items-center gap-2 mt-0.5 text-xs text-[var(--gray-10)]">
                      <span>{formatDate(session.started_at)}</span>
                      <span>·</span>
                      <span>{session.screenshot_count} screenshots</span>
                      <span>·</span>
                      <span>{formatDuration(session)}</span>
                    </div>
                  </button>
                  <button
                    class="p-1.5 rounded-lg text-[var(--gray-8)] hover:text-[var(--error)] hover:bg-[var(--gray-4)] transition-colors"
                    onclick={() => deleteSession(session)}
                    title="Delete session"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}
