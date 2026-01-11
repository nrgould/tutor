<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { fade, fly } from 'svelte/transition';
  import { onMount } from 'svelte';

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
  let selectedSubjects = $state<string[]>([]);
  let customSubject = $state('');
  let selectedGoal = $state('');
  let hasScreenPermission = $state(false);
  let checkingPermission = $state(false);
  let isMac = $state(false);

  // Check platform on mount
  onMount(() => {
    // Detect macOS via navigator
    isMac = navigator.userAgent.includes('Mac');
    if (!isMac) {
      // Skip permission step on non-Mac
      hasScreenPermission = true;
    } else {
      // Check permission status on Mac
      checkPermission();
    }
  });

  const subjects = [
    'Mathematics', 'Physics', 'Chemistry', 'Biology',
    'Computer Science', 'Engineering', 'Economics', 'Psychology',
    'History', 'Literature', 'Philosophy', 'Languages',
    'Business', 'Medicine', 'Law', 'Art & Design'
  ];

  const goals = [
    { id: 'exams', icon: '📝', title: 'Ace my exams', desc: 'Prepare for tests and finals' },
    { id: 'understand', icon: '💡', title: 'Understand deeply', desc: 'Master concepts, not just memorize' },
    { id: 'homework', icon: '📚', title: 'Get homework help', desc: 'Work through assignments' },
    { id: 'explore', icon: '🔬', title: 'Explore topics', desc: 'Learn something new' },
  ];

  // Total steps: Welcome, Permissions (Mac only), Name, Subjects, Goals, Shortcut
  const totalSteps = $derived(isMac ? 6 : 5);

  function getStepIndex(logicalStep: number): number {
    // If not Mac, skip the permissions step (step 1)
    if (!isMac && logicalStep >= 1) {
      return logicalStep + 1;
    }
    return logicalStep;
  }

  function getCurrentStep(): number {
    return getStepIndex(step);
  }

  async function checkPermission() {
    checkingPermission = true;
    try {
      const hasPermission = await invoke<boolean>('check_screen_recording_permission');
      hasScreenPermission = hasPermission;
    } catch {
      hasScreenPermission = false;
    }
    checkingPermission = false;
  }

  async function requestPermission() {
    try {
      await invoke('open_screen_recording_settings');
      // Poll for permission after opening settings
      const checkInterval = setInterval(async () => {
        try {
          const hasPermission = await invoke<boolean>('check_screen_recording_permission');
          if (hasPermission) {
            hasScreenPermission = true;
            clearInterval(checkInterval);
          }
        } catch {}
      }, 1000);

      // Stop polling after 30 seconds
      setTimeout(() => clearInterval(checkInterval), 30000);
    } catch (e) {
      console.error('Failed to open settings:', e);
    }
  }

  function toggleSubject(subject: string) {
    if (selectedSubjects.includes(subject)) {
      selectedSubjects = selectedSubjects.filter(s => s !== subject);
    } else {
      selectedSubjects = [...selectedSubjects, subject];
    }
  }

  function addCustomSubject() {
    if (customSubject.trim() && !selectedSubjects.includes(customSubject.trim())) {
      selectedSubjects = [...selectedSubjects, customSubject.trim()];
      customSubject = '';
    }
  }

  function handleContinue() {
    const currentStep = getCurrentStep();

    // Validation
    if (currentStep === 2 && !userName.trim()) return;
    if (currentStep === 3 && selectedSubjects.length === 0) return;
    if (currentStep === 4 && !selectedGoal) return;

    if (step < totalSteps - 1) {
      step++;
    } else {
      // Complete onboarding
      oncomplete({
        name: userName.trim(),
        courses: selectedSubjects,
        goals: selectedGoal,
      });
    }
  }

  function skipOnboarding() {
    oncomplete({
      name: '',
      courses: [],
      goals: '',
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (getCurrentStep() === 3 && customSubject.trim()) {
        addCustomSubject();
      } else {
        handleContinue();
      }
    }
  }
</script>

<div
  class="onboarding-container"
  in:fade={{ duration: 300 }}
  out:fade={{ duration: 200 }}
>
  <!-- Skip button -->
  <button class="skip-btn" onclick={skipOnboarding}>
    Skip
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  </button>

  <div class="content-wrapper">
    <!-- Step 0: Welcome -->
    {#if getCurrentStep() === 0}
      <div class="step-content" in:fly={{ x: 20, duration: 300 }}>
        <div class="logo-container">
          <div class="logo">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
        </div>

        <h1 class="title">Welcome to Eigen</h1>
        <p class="subtitle">Your AI-powered study companion</p>

        <button class="primary-btn" onclick={handleContinue}>
          Continue
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

    <!-- Step 1: Permissions (Mac only) -->
    {:else if getCurrentStep() === 1 && isMac}
      <div class="step-content" in:fly={{ x: 20, duration: 300 }}>
        <h1 class="title">Let's get you set up</h1>
        <p class="subtitle">Eigen needs permission to see your screen so it can help you study</p>

        <div class="permission-card">
          <div class="permission-icon">
            {#if hasScreenPermission}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            {:else}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            {/if}
          </div>
          <div class="permission-info">
            <span class="permission-title">Allow Eigen to see your screen</span>
            <span class="permission-desc">Eigen can help explain what you're looking at</span>
          </div>
          <div class="permission-status" class:granted={hasScreenPermission}>
            {hasScreenPermission ? 'Granted' : 'Required'}
          </div>
        </div>

        {#if !hasScreenPermission}
          <button class="permission-btn" onclick={requestPermission} disabled={checkingPermission}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            Grant screen access
          </button>
          <p class="permission-hint">
            Click the button above, then enable Eigen in System Settings
          </p>
        {:else}
          <button class="primary-btn" onclick={handleContinue}>
            Continue
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        {/if}
      </div>

    <!-- Step 2: Name -->
    {:else if getCurrentStep() === 2}
      <div class="step-content" in:fly={{ x: 20, duration: 300 }}>
        <h1 class="title">What should we call you?</h1>
        <p class="subtitle">Let's personalize your experience</p>

        <input
          type="text"
          bind:value={userName}
          placeholder="Your name"
          class="text-input"
          onkeydown={handleKeydown}
          autofocus
        />

        <button
          class="primary-btn"
          onclick={handleContinue}
          disabled={!userName.trim()}
        >
          Continue
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

    <!-- Step 3: Subjects -->
    {:else if getCurrentStep() === 3}
      <div class="step-content" in:fly={{ x: 20, duration: 300 }}>
        <h1 class="title">What are you studying?</h1>
        <p class="subtitle">Select all that apply</p>

        <div class="chips-container">
          {#each subjects as subject}
            <button
              class="chip"
              class:selected={selectedSubjects.includes(subject)}
              onclick={() => toggleSubject(subject)}
            >
              {subject}
            </button>
          {/each}
        </div>

        <div class="custom-input-row">
          <input
            type="text"
            bind:value={customSubject}
            placeholder="Other subject..."
            class="text-input small"
            onkeydown={handleKeydown}
          />
          <button
            class="add-btn"
            onclick={addCustomSubject}
            disabled={!customSubject.trim()}
          >
            Add
          </button>
        </div>

        <button
          class="primary-btn"
          onclick={handleContinue}
          disabled={selectedSubjects.length === 0}
        >
          Continue
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

    <!-- Step 4: Goals -->
    {:else if getCurrentStep() === 4}
      <div class="step-content" in:fly={{ x: 20, duration: 300 }}>
        <h1 class="title">What's your main goal?</h1>
        <p class="subtitle">We'll tailor your experience</p>

        <div class="goals-container">
          {#each goals as goal}
            <button
              class="goal-card"
              class:selected={selectedGoal === goal.id}
              onclick={() => selectedGoal = goal.id}
            >
              <span class="goal-icon">{goal.icon}</span>
              <div class="goal-text">
                <span class="goal-title">{goal.title}</span>
                <span class="goal-desc">{goal.desc}</span>
              </div>
              <div class="goal-check">
                {#if selectedGoal === goal.id}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                {/if}
              </div>
            </button>
          {/each}
        </div>

        <button
          class="primary-btn"
          onclick={handleContinue}
          disabled={!selectedGoal}
        >
          Continue
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

    <!-- Step 5: Keyboard Shortcut -->
    {:else if getCurrentStep() === 5}
      <div class="step-content" in:fly={{ x: 20, duration: 300 }}>
        <h1 class="title">Show & hide Eigen instantly</h1>
        <p class="subtitle">Use this keyboard shortcut anytime</p>

        <div class="shortcut-display">
          <div class="key">
            {#if isMac}
              <span>⌃</span>
            {:else}
              <span>Ctrl</span>
            {/if}
          </div>
          <span class="key-plus">+</span>
          <div class="key">
            {#if isMac}
              <span>⇧</span>
            {:else}
              <span>Shift</span>
            {/if}
          </div>
          <span class="key-plus">+</span>
          <div class="key">
            <span>Space</span>
          </div>
        </div>

        <p class="shortcut-hint">Press the shortcut now to try it, or continue to start learning</p>

        <button class="primary-btn" onclick={handleContinue}>
          Start learning
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>
    {/if}
  </div>

  <!-- Progress dots -->
  <div class="progress-dots">
    {#each Array(totalSteps) as _, i}
      <div
        class="dot"
        class:active={i === step}
        class:completed={i < step}
      ></div>
    {/each}
  </div>
</div>

<style>
  .onboarding-container {
    position: absolute;
    inset: 0;
    z-index: 9999;
    background: white;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .skip-btn {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 16px;
    font-size: 14px;
    color: #6b7280;
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.2s;
  }

  .skip-btn:hover {
    color: #374151;
  }

  .content-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    padding-bottom: 80px;
  }

  .step-content {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .logo-container {
    margin-bottom: 24px;
  }

  .logo {
    width: 80px;
    height: 80px;
    background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .title {
    font-size: 28px;
    font-weight: 600;
    color: #111827;
    margin: 0 0 8px 0;
    line-height: 1.2;
  }

  .subtitle {
    font-size: 16px;
    color: #6b7280;
    margin: 0 0 32px 0;
    line-height: 1.5;
  }

  .primary-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    max-width: 280px;
    padding: 14px 24px;
    font-size: 16px;
    font-weight: 500;
    color: white;
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  .primary-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
  }

  .primary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Permission styles */
  .permission-card {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 20px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    margin-bottom: 24px;
  }

  .permission-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border-radius: 10px;
    color: #6b7280;
  }

  .permission-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
  }

  .permission-title {
    font-size: 14px;
    font-weight: 500;
    color: #111827;
  }

  .permission-desc {
    font-size: 12px;
    color: #6b7280;
  }

  .permission-status {
    font-size: 12px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 6px;
    background: #fef3c7;
    color: #d97706;
  }

  .permission-status.granted {
    background: #d1fae5;
    color: #059669;
  }

  .permission-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 14px 24px;
    font-size: 15px;
    font-weight: 500;
    color: white;
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .permission-btn:hover {
    transform: translateY(-1px);
  }

  .permission-hint {
    font-size: 13px;
    color: #9ca3af;
    margin-top: 16px;
  }

  /* Input styles */
  .text-input {
    width: 100%;
    padding: 14px 18px;
    font-size: 16px;
    color: #111827;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    margin-bottom: 24px;
    transition: all 0.2s;
  }

  .text-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .text-input.small {
    flex: 1;
    margin-bottom: 0;
    padding: 10px 14px;
    font-size: 14px;
  }

  .text-input::placeholder {
    color: #9ca3af;
  }

  /* Chips styles */
  .chips-container {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin-bottom: 16px;
  }

  .chip {
    padding: 8px 16px;
    font-size: 14px;
    color: #374151;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .chip:hover {
    background: #e5e7eb;
  }

  .chip.selected {
    color: white;
    background: #3b82f6;
    border-color: #3b82f6;
  }

  .custom-input-row {
    display: flex;
    gap: 8px;
    width: 100%;
    margin-bottom: 24px;
  }

  .add-btn {
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 500;
    color: #3b82f6;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-btn:hover:not(:disabled) {
    background: #dbeafe;
  }

  .add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Goals styles */
  .goals-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 24px;
  }

  .goal-card {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 14px 16px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .goal-card:hover {
    background: #f3f4f6;
  }

  .goal-card.selected {
    background: #eff6ff;
    border-color: #3b82f6;
  }

  .goal-icon {
    font-size: 24px;
  }

  .goal-text {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .goal-title {
    font-size: 15px;
    font-weight: 500;
    color: #111827;
  }

  .goal-desc {
    font-size: 13px;
    color: #6b7280;
  }

  .goal-check {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #3b82f6;
  }

  /* Shortcut styles */
  .shortcut-display {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 24px;
  }

  .key {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 56px;
    height: 56px;
    padding: 0 16px;
    font-size: 18px;
    font-weight: 500;
    color: #374151;
    background: linear-gradient(180deg, #ffffff 0%, #f3f4f6 100%);
    border: 1px solid #d1d5db;
    border-radius: 12px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.5);
  }

  .key-plus {
    font-size: 20px;
    color: #9ca3af;
  }

  .shortcut-hint {
    font-size: 14px;
    color: #9ca3af;
    margin-bottom: 32px;
  }

  /* Progress dots */
  .progress-dots {
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    padding-bottom: 60px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #e5e7eb;
    transition: all 0.3s;
  }

  .dot.active {
    background: #3b82f6;
    transform: scale(1.2);
  }

  .dot.completed {
    background: #93c5fd;
  }
</style>
