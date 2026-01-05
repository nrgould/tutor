<script lang="ts">
  import { onMount } from 'svelte';
  import { settingsStore } from '$lib/stores/settings';
  import { chatStore } from '$lib/stores/chat';
  import { streamChat } from '$lib/utils/api';
  import { createConversation, saveMessage, getMessages, getConversations, getSetting, setSetting } from '$lib/utils/db';
  import { processConversationMemories } from '$lib/services/memoryService';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import type { Message, ScreenContext } from '$lib/types';
  import ChatMessage from '$lib/components/overlay/ChatMessage.svelte';
  import Onboarding from '$lib/components/Onboarding.svelte';

  const settings = $derived($settingsStore);
  const chat = $derived($chatStore);

  // UI State
  let isExpanded = $state(false);
  let inputValue = $state('');
  let isWatching = $state(false);
  let watchDuration = $state(0);
  let messagesContainer: HTMLDivElement;
  let showOnboarding = $state(false);
  let checkingOnboarding = $state(true);

  // Watching state
  let screenshotBuffer = $state<string[]>([]);
  let watchInterval: ReturnType<typeof setInterval> | null = null;
  let durationInterval: ReturnType<typeof setInterval> | null = null;
  let lastVLMContext = $state<string>('');
  let isProcessingBatch = $state(false);

  // Proactive notifications
  let proactiveMessage = $state<string | null>(null);
  let showProactiveToast = $state(false);

  onMount(() => {
    const init = async () => {
      await settingsStore.load();

      // Check onboarding
      try {
        const onboardingComplete = await getSetting('onboarding_complete');
        if (!onboardingComplete) {
          showOnboarding = true;
        }
      } catch {
        showOnboarding = true;
      }
      checkingOnboarding = false;

      // Load most recent conversation
      try {
        const conversations = await getConversations(1);
        if (conversations.length > 0) {
          chatStore.setConversation(conversations[0]);
          const msgs = await getMessages(conversations[0].id);
          chatStore.setMessages(msgs);
        } else {
          await startNewConversation();
        }
      } catch {
        await startNewConversation();
      }
    };

    init();

    return () => {
      stopWatching();
    };
  });

  async function startNewConversation() {
    try {
      if (chat.currentConversation && chat.messages.length >= 4) {
        processConversationMemories(chat.messages, chat.currentConversation.id).catch(console.warn);
      }
      const conversation = await createConversation();
      chatStore.setConversation(conversation);
      chatStore.setMessages([]);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  }

  async function handleOnboardingComplete(profile: { name: string; courses: string[]; goals: string }) {
    await setSetting('onboarding_complete', 'true');
    if (profile.name) await setSetting('user_name', profile.name);
    if (profile.courses.length > 0) await setSetting('user_courses', JSON.stringify(profile.courses));
    if (profile.goals) await setSetting('user_goals', profile.goals);
    showOnboarding = false;
  }

  // Watching functions
  async function startWatching() {
    if (isWatching) return;
    isWatching = true;
    watchDuration = 0;
    screenshotBuffer = [];

    // Hide our window briefly for cleaner screenshots
    const window = getCurrentWindow();

    // Duration timer
    durationInterval = setInterval(() => {
      watchDuration++;
    }, 1000);

    // Screenshot every second
    watchInterval = setInterval(async () => {
      try {
        // Minimize window impact during capture
        const screenshot = await invoke<string>('capture_screen');
        screenshotBuffer = [...screenshotBuffer, screenshot];

        // Process batch when we have 5 screenshots
        if (screenshotBuffer.length >= 5 && !isProcessingBatch) {
          processBatch();
        }
      } catch (error) {
        console.error('Screenshot failed:', error);
      }
    }, 1000);
  }

  function stopWatching() {
    isWatching = false;
    if (watchInterval) {
      clearInterval(watchInterval);
      watchInterval = null;
    }
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }
    // Process any remaining screenshots
    if (screenshotBuffer.length > 0 && !isProcessingBatch) {
      processBatch();
    }
  }

  async function processBatch() {
    if (screenshotBuffer.length === 0 || isProcessingBatch) return;

    isProcessingBatch = true;
    const batch = [...screenshotBuffer];
    screenshotBuffer = [];

    try {
      // Send batch to VLM for context understanding
      const context = await analyzeScreenshots(batch);
      if (context) {
        lastVLMContext = context;

        // Check for proactive suggestions
        if (context.includes('[SUGGESTION]')) {
          const suggestion = context.split('[SUGGESTION]')[1]?.trim();
          if (suggestion) {
            proactiveMessage = suggestion;
            showProactiveToast = true;
          }
        }
      }
    } catch (error) {
      console.error('Batch processing failed:', error);
    } finally {
      isProcessingBatch = false;
    }
  }

  async function analyzeScreenshots(screenshots: string[]): Promise<string> {
    if (!settings.anthropic_api_key) return '';

    // Use the most recent screenshot for analysis (to save tokens)
    // In production, could send multiple for temporal context
    const recentScreenshot = screenshots[screenshots.length - 1];

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.anthropic_api_key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: `You are a study assistant watching a student's screen. Briefly describe what they're working on (1-2 sentences). If you notice they might be stuck or could benefit from a tip, add [SUGGESTION] followed by a helpful hint. Be concise.`,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: recentScreenshot }
              },
              { type: 'text', text: 'What is the student working on? Any suggestions?' }
            ]
          }]
        })
      });

      const data = await response.json();
      return data.content?.[0]?.text || '';
    } catch {
      return '';
    }
  }

  async function handleSend() {
    const message = inputValue.trim();
    if (!message || !settings.anthropic_api_key) return;

    inputValue = '';
    isExpanded = true;

    if (!chat.currentConversation) {
      await startNewConversation();
    }

    // Include current screen context if watching
    let screenContext: ScreenContext | undefined;
    if (isWatching) {
      try {
        const screenshot = await invoke<string>('capture_screen');
        screenContext = { screenshot, captured_at: new Date().toISOString() };
      } catch {}
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      conversation_id: chat.currentConversation!.id,
      role: 'user',
      content: message,
      screen_context: screenContext,
      created_at: new Date().toISOString()
    };

    chatStore.addMessage(userMessage);
    await saveMessage(chat.currentConversation!.id, 'user', message, screenContext);

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      conversation_id: chat.currentConversation!.id,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString()
    };

    chatStore.addMessage(assistantMessage);
    chatStore.setLoading(true);

    try {
      const messagesToSend = [...chat.messages.slice(0, -1)];
      for await (const chunk of streamChat(messagesToSend)) {
        chatStore.appendToLastMessage(chunk);
        scrollToBottom();
      }
      const finalMessage = $chatStore.messages[$chatStore.messages.length - 1];
      await saveMessage(chat.currentConversation!.id, 'assistant', finalMessage.content, undefined);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      chatStore.updateLastMessage(`Error: ${errorMessage}`);
    } finally {
      chatStore.setLoading(false);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      isExpanded = false;
    }
  }

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function handleProactiveClick() {
    if (proactiveMessage) {
      inputValue = proactiveMessage;
      showProactiveToast = false;
      proactiveMessage = null;
      isExpanded = true;
    }
  }

  function dismissProactive() {
    showProactiveToast = false;
    proactiveMessage = null;
  }

  $effect(() => {
    if (chat.messages.length > 0) {
      scrollToBottom();
    }
  });
</script>

<!-- Minimal Floating Bar -->
<div class="h-screen w-screen flex flex-col" data-tauri-drag-region>
  <!-- Main floating bar -->
  <div class="floating-bar mx-auto mt-3 flex items-center gap-2 px-3 py-2 rounded-2xl bg-[var(--gray-2)]/90 backdrop-blur-xl border border-[var(--gray-4)] shadow-2xl">
    <!-- Watch toggle -->
    <button
      class="flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all {isWatching ? 'bg-[var(--error)]/10 text-[var(--error)]' : 'bg-[var(--gray-3)] text-[var(--gray-10)] hover:text-[var(--gray-12)]'}"
      onclick={() => isWatching ? stopWatching() : startWatching()}
      title={isWatching ? 'Stop session' : 'Start session'}
    >
      {#if isWatching}
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--error)] opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-[var(--error)]"></span>
        </span>
        <span class="text-sm font-medium">{formatDuration(watchDuration)}</span>
      {:else}
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
        <span class="text-sm">Start</span>
      {/if}
    </button>

    <!-- Divider -->
    <div class="w-px h-6 bg-[var(--gray-4)]"></div>

    <!-- Input -->
    <div class="flex-1 min-w-[300px]">
      <input
        type="text"
        bind:value={inputValue}
        placeholder="Ask anything..."
        class="w-full px-3 py-1.5 text-sm bg-transparent text-[var(--gray-12)] placeholder:text-[var(--gray-8)] focus:outline-none"
        onkeydown={handleKeydown}
        onfocus={() => isExpanded = true}
      />
    </div>

    <!-- Send button -->
    <button
      class="p-2 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-30 transition-colors"
      onclick={handleSend}
      disabled={!inputValue.trim() || chat.isLoading}
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
      </svg>
    </button>

    <!-- Expand/collapse -->
    <button
      class="p-2 rounded-xl text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-3)] transition-colors"
      onclick={() => isExpanded = !isExpanded}
      title={isExpanded ? 'Collapse' : 'Expand'}
    >
      <svg class="w-4 h-4 transition-transform {isExpanded ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Settings -->
    <a
      href="/settings"
      class="p-2 rounded-xl text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-3)] transition-colors"
      title="Settings"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </a>

    <!-- History -->
    <a
      href="/history"
      class="p-2 rounded-xl text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-3)] transition-colors"
      title="Session history"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </a>
  </div>

  <!-- Live context indicator -->
  {#if isWatching && lastVLMContext && !lastVLMContext.includes('[SUGGESTION]')}
    <div class="mx-auto mt-2 px-4 py-2 rounded-xl bg-[var(--gray-2)]/80 backdrop-blur-xl border border-[var(--gray-4)] max-w-xl">
      <p class="text-xs text-[var(--gray-10)]">{lastVLMContext}</p>
    </div>
  {/if}

  <!-- Expanded chat panel -->
  {#if isExpanded && chat.messages.length > 0}
    <div class="mx-auto mt-2 w-full max-w-2xl flex-1 flex flex-col bg-[var(--gray-2)]/90 backdrop-blur-xl border border-[var(--gray-4)] rounded-2xl shadow-2xl overflow-hidden max-h-[60vh]">
      <div bind:this={messagesContainer} class="flex-1 overflow-y-auto p-4 space-y-4">
        {#each chat.messages as message (message.id)}
          <ChatMessage {message} />
        {/each}

        {#if chat.isLoading}
          <div class="flex items-center gap-2 pl-10">
            <div class="flex gap-1">
              <span class="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce"></span>
              <span class="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce" style="animation-delay: 0.15s"></span>
              <span class="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce" style="animation-delay: 0.3s"></span>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Proactive toast notification -->
  {#if showProactiveToast && proactiveMessage}
    <div class="fixed bottom-6 right-6 max-w-sm animate-slide-up">
      <div class="bg-[var(--gray-2)] border border-[var(--accent)]/30 rounded-2xl shadow-2xl p-4">
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
            <svg class="w-4 h-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div class="flex-1">
            <p class="text-sm text-[var(--gray-12)]">{proactiveMessage}</p>
            <div class="mt-3 flex gap-2">
              <button
                class="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
                onclick={handleProactiveClick}
              >
                Ask about this
              </button>
              <button
                class="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--gray-3)] text-[var(--gray-11)] hover:bg-[var(--gray-4)] transition-colors"
                onclick={dismissProactive}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Onboarding -->
{#if showOnboarding && !checkingOnboarding}
  <Onboarding oncomplete={handleOnboardingComplete} />
{/if}

<style>
  .floating-bar {
    z-index: 100;
  }

  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-slide-up {
    animation: slide-up 0.3s ease-out;
  }
</style>
