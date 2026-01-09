<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { fade, fly } from 'svelte/transition';

  interface Props {
    oncomplete: (profile: UserProfile) => void;
  }

  interface UserProfile {
    name: string;
    courses: string[];
    goals: string;
  }

  let { oncomplete }: Props = $props();

  let step = $state(0);
  let userName = $state('');
  let userCourses = $state('');
  let userGoals = $state('');
  let isTyping = $state(false);
  let displayedMessage = $state('');

  const messages = [
    "Hey there! I'm Eigen, your AI study companion. I'm here to help you learn anything you're working on.",
    "Before we dive in, I'd love to get to know you a bit better so I can personalize your experience.",
    "What should I call you?",
    "Nice to meet you, {name}! What subjects or courses are you currently studying? (You can list a few, separated by commas)",
    "Awesome! And finally, what are your main learning goals right now? What do you want to achieve?",
    "Perfect! I've got everything I need. Let's start learning together, {name}!",
  ];

  function getCurrentMessage() {
    let msg = messages[step];
    if (msg.includes('{name}')) {
      msg = msg.replace('{name}', userName || 'friend');
    }
    return msg;
  }

  $effect(() => {
    // Typewriter effect for messages
    const fullMessage = getCurrentMessage();
    displayedMessage = '';
    isTyping = true;

    let i = 0;
    const interval = setInterval(() => {
      if (i < fullMessage.length) {
        displayedMessage = fullMessage.slice(0, i + 1);
        i++;
      } else {
        clearInterval(interval);
        isTyping = false;
      }
    }, 30);

    return () => clearInterval(interval);
  });

  function handleContinue() {
    if (step === 2 && !userName.trim()) {
      return;
    }
    if (step === 3 && !userCourses.trim()) {
      return;
    }
    if (step === 4 && !userGoals.trim()) {
      return;
    }

    if (step < messages.length - 1) {
      step++;
    }

    if (step === messages.length - 1) {
      // Final step - complete onboarding
      setTimeout(() => {
        const courses = userCourses
          .split(',')
          .map((c) => c.trim())
          .filter((c) => c.length > 0);

        oncomplete({
          name: userName.trim(),
          courses,
          goals: userGoals.trim(),
        });
      }, 2000);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !isTyping) {
      e.preventDefault();
      handleContinue();
    }
  }

  function skipOnboarding() {
    oncomplete({
      name: '',
      courses: [],
      goals: '',
    });
  }
</script>

<div
  class="absolute inset-0 z-[9999] bg-[var(--gray-1)] flex flex-col items-center p-6"
  in:fade={{ duration: 300 }}
  out:fade={{ duration: 200 }}
>
  <!-- Skip button -->
  <button
    class="absolute top-4 right-4 text-xs text-[var(--gray-9)] hover:text-[var(--gray-11)] transition-colors"
    onclick={skipOnboarding}
  >
    Skip intro
  </button>

  <!-- Spacer to push content down -->
  <div class="flex-1 min-h-[60px]"></div>

  <!-- Message bubble -->
  <div
    class="max-w-sm w-full bg-[var(--gray-2)] rounded-2xl p-5 border border-[var(--gray-4)] shadow-xl"
    in:fly={{ y: 20, duration: 500, delay: 400 }}
  >
    <p class="text-[var(--gray-12)] text-sm leading-relaxed min-h-[3em]">
      {displayedMessage}
      {#if isTyping}
        <span class="inline-block w-0.5 h-4 bg-[var(--accent)] animate-pulse ml-0.5 align-middle"></span>
      {/if}
    </p>
  </div>

  <!-- Spacer between message and button area -->
  <div class="flex-1"></div>

  <!-- Input/Button area - positioned above pagination -->
  <div class="max-w-sm w-full min-h-[140px] flex flex-col items-center justify-center mb-12">
    {#if step >= 2 && step <= 4 && !isTyping}
      <div class="w-full" in:fly={{ y: 20, duration: 300 }}>
        {#if step === 2}
          <input
            type="text"
            bind:value={userName}
            placeholder="Your name..."
            class="w-full px-4 py-3 text-sm rounded-xl bg-[var(--gray-2)] border border-[var(--gray-4)] text-[var(--gray-12)] placeholder:text-[var(--gray-8)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-muted)] transition-colors"
            onkeydown={handleKeydown}
            autofocus
          />
        {:else if step === 3}
          <input
            type="text"
            bind:value={userCourses}
            placeholder="e.g., Calculus, Chemistry, History..."
            class="w-full px-4 py-3 text-sm rounded-xl bg-[var(--gray-2)] border border-[var(--gray-4)] text-[var(--gray-12)] placeholder:text-[var(--gray-8)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-muted)] transition-colors"
            onkeydown={handleKeydown}
            autofocus
          />
        {:else if step === 4}
          <textarea
            bind:value={userGoals}
            placeholder="e.g., Pass my finals, understand quantum physics, get better at coding..."
            rows="3"
            class="w-full px-4 py-3 text-sm rounded-xl bg-[var(--gray-2)] border border-[var(--gray-4)] text-[var(--gray-12)] placeholder:text-[var(--gray-8)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-muted)] transition-colors resize-none"
            onkeydown={handleKeydown}
          ></textarea>
        {/if}

        <button
          class="w-full mt-3 py-3 px-4 bg-[var(--accent)] text-white rounded-xl font-medium text-sm hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={handleContinue}
          disabled={
            (step === 2 && !userName.trim()) ||
            (step === 3 && !userCourses.trim()) ||
            (step === 4 && !userGoals.trim())
          }
        >
          Continue
        </button>
      </div>
    {:else if step < 2 && !isTyping}
      <button
        class="px-6 py-3 bg-[var(--accent)] text-white rounded-xl font-medium text-sm hover:bg-[var(--accent-hover)] transition-colors"
        onclick={handleContinue}
      >
        {step === 0 ? "Let's go!" : 'Continue'}
      </button>
    {:else if step === messages.length - 1 && !isTyping}
      <div class="flex items-center gap-2 text-sm text-[var(--gray-10)]">
        <div class="animate-spin w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full"></div>
        Starting your journey...
      </div>
    {/if}
  </div>

  <!-- Progress dots -->
  <div class="flex items-center gap-2 mb-4">
    {#each messages as _, i}
      <div
        class="w-2 h-2 rounded-full transition-colors duration-300 {i === step
          ? 'bg-[var(--accent)]'
          : i < step
            ? 'bg-[var(--accent)]/50'
            : 'bg-[var(--gray-5)]'}"
      ></div>
    {/each}
  </div>
</div>
