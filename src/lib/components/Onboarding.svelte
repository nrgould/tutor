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

  onMount(() => {
    isMac = navigator.userAgent.includes('Mac');
    if (!isMac) {
      hasScreenPermission = true;
    } else {
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
    { id: 'exams', title: 'Ace my exams', desc: 'Prepare for tests and finals' },
    { id: 'understand', title: 'Understand deeply', desc: 'Master concepts, not just memorize' },
    { id: 'homework', title: 'Get homework help', desc: 'Work through assignments' },
    { id: 'explore', title: 'Explore topics', desc: 'Learn something new' },
  ];

  const totalSteps = $derived(isMac ? 6 : 5);

  function getStepIndex(logicalStep: number): number {
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
      const checkInterval = setInterval(async () => {
        try {
          const hasPermission = await invoke<boolean>('check_screen_recording_permission');
          if (hasPermission) {
            hasScreenPermission = true;
            clearInterval(checkInterval);
          }
        } catch {}
      }, 1000);
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
    if (currentStep === 2 && !userName.trim()) return;
    if (currentStep === 3 && selectedSubjects.length === 0) return;
    if (currentStep === 4 && !selectedGoal) return;

    if (step < totalSteps - 1) {
      step++;
    } else {
      oncomplete({
        name: userName.trim(),
        courses: selectedSubjects,
        goals: selectedGoal,
      });
    }
  }

  function skipOnboarding() {
    oncomplete({ name: '', courses: [], goals: '' });
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

<div class="onboarding" in:fade={{ duration: 200 }} out:fade={{ duration: 150 }}>
  <div class="content">
    <!-- Step 0: Welcome -->
    {#if getCurrentStep() === 0}
      <div class="step" in:fly={{ x: 20, duration: 250 }}>
        <div class="icon-box">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h1>Welcome to Eigen</h1>
        <p class="subtitle">Your AI-powered study companion</p>
        <button class="btn-primary" onclick={handleContinue}>
          Continue
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

    <!-- Step 1: Permissions (Mac only) -->
    {:else if getCurrentStep() === 1 && isMac}
      <div class="step" in:fly={{ x: 20, duration: 250 }}>
        <h1>Let's get you set up</h1>
        <p class="subtitle">Eigen needs permission to see your screen</p>

        <div class="permission-row">
          <div class="permission-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
            </svg>
          </div>
          <div class="permission-text">
            <span class="permission-label">Screen recording</span>
            <span class="permission-desc">Help you with what's on screen</span>
          </div>
          {#if hasScreenPermission}
            <div class="status granted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Enabled
            </div>
          {:else}
            <div class="status pending">Required</div>
          {/if}
        </div>

        {#if !hasScreenPermission}
          <button class="btn-primary" onclick={requestPermission}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
            </svg>
            Grant screen access
          </button>
          <p class="hint">Enable Eigen in System Settings when prompted</p>
        {:else}
          <button class="btn-primary" onclick={handleContinue}>
            Continue
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        {/if}
      </div>

    <!-- Step 2: Name -->
    {:else if getCurrentStep() === 2}
      <div class="step" in:fly={{ x: 20, duration: 250 }}>
        <h1>What should we call you?</h1>
        <p class="subtitle">Let's personalize your experience</p>
        <input
          type="text"
          bind:value={userName}
          placeholder="Your name"
          class="input"
          onkeydown={handleKeydown}
        />
        <button class="btn-primary" onclick={handleContinue} disabled={!userName.trim()}>
          Continue
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

    <!-- Step 3: Subjects -->
    {:else if getCurrentStep() === 3}
      <div class="step wide" in:fly={{ x: 20, duration: 250 }}>
        <h1>What are you studying?</h1>
        <p class="subtitle">Select all that apply</p>
        <div class="chips">
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
        <div class="add-row">
          <input
            type="text"
            bind:value={customSubject}
            placeholder="Other subject..."
            class="input small"
            onkeydown={handleKeydown}
          />
          <button class="btn-secondary" onclick={addCustomSubject} disabled={!customSubject.trim()}>
            Add
          </button>
        </div>
        <button class="btn-primary" onclick={handleContinue} disabled={selectedSubjects.length === 0}>
          Continue
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

    <!-- Step 4: Goals -->
    {:else if getCurrentStep() === 4}
      <div class="step" in:fly={{ x: 20, duration: 250 }}>
        <h1>What's your main goal?</h1>
        <p class="subtitle">We'll tailor your experience</p>
        <div class="goals">
          {#each goals as goal}
            <button
              class="goal-row"
              class:selected={selectedGoal === goal.id}
              onclick={() => selectedGoal = goal.id}
            >
              <div class="goal-radio" class:checked={selectedGoal === goal.id}>
                {#if selectedGoal === goal.id}
                  <div class="radio-dot"></div>
                {/if}
              </div>
              <div class="goal-text">
                <span class="goal-title">{goal.title}</span>
                <span class="goal-desc">{goal.desc}</span>
              </div>
            </button>
          {/each}
        </div>
        <button class="btn-primary" onclick={handleContinue} disabled={!selectedGoal}>
          Continue
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

    <!-- Step 5: Shortcut -->
    {:else if getCurrentStep() === 5}
      <div class="step" in:fly={{ x: 20, duration: 250 }}>
        <h1>Show & hide Eigen instantly</h1>
        <p class="subtitle">Use this keyboard shortcut anytime</p>
        <div class="keys">
          <kbd>{isMac ? '⌃' : 'Ctrl'}</kbd>
          <span class="plus">+</span>
          <kbd>{isMac ? '⇧' : 'Shift'}</kbd>
          <span class="plus">+</span>
          <kbd>Space</kbd>
        </div>
        <p class="hint">Try it now, or continue to start learning</p>
        <button class="btn-primary" onclick={handleContinue}>
          Start learning
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>
    {/if}
  </div>

  <!-- Progress -->
  <div class="footer">
    <div class="dots">
      {#each Array(totalSteps) as _, i}
        <div class="dot" class:active={i === step} class:done={i < step}></div>
      {/each}
    </div>
    <button class="skip" onclick={skipOnboarding}>
      Skip
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .onboarding {
    position: absolute;
    inset: 0;
    z-index: 9999;
    background: #fafafa;
    display: flex;
    flex-direction: column;
  }

  .content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 24px;
  }

  .step {
    width: 100%;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .step.wide {
    max-width: 440px;
  }

  .icon-box {
    width: 64px;
    height: 64px;
    background: #18181b;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    margin-bottom: 24px;
  }

  h1 {
    font-size: 24px;
    font-weight: 600;
    color: #18181b;
    margin: 0 0 8px 0;
    letter-spacing: -0.02em;
  }

  .subtitle {
    font-size: 15px;
    color: #71717a;
    margin: 0 0 28px 0;
  }

  .btn-primary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    max-width: 260px;
    height: 48px;
    font-size: 15px;
    font-weight: 500;
    color: white;
    background: #18181b;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-primary:hover:not(:disabled) {
    background: #27272a;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-secondary {
    height: 42px;
    padding: 0 20px;
    font-size: 14px;
    font-weight: 500;
    color: #18181b;
    background: white;
    border: 1px solid #e4e4e7;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #f4f4f5;
  }

  .btn-secondary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Permission */
  .permission-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px;
    background: white;
    border: 1px solid #e4e4e7;
    border-radius: 12px;
    margin-bottom: 24px;
  }

  .permission-icon {
    width: 40px;
    height: 40px;
    background: #f4f4f5;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #52525b;
  }

  .permission-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
  }

  .permission-label {
    font-size: 14px;
    font-weight: 500;
    color: #18181b;
  }

  .permission-desc {
    font-size: 13px;
    color: #71717a;
  }

  .status {
    font-size: 12px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .status.pending {
    background: #fef3c7;
    color: #b45309;
  }

  .status.granted {
    background: #dcfce7;
    color: #16a34a;
  }

  .hint {
    font-size: 13px;
    color: #a1a1aa;
    margin-top: 16px;
  }

  /* Input */
  .input {
    width: 100%;
    height: 48px;
    padding: 0 16px;
    font-size: 15px;
    color: #18181b;
    background: white;
    border: 1px solid #e4e4e7;
    border-radius: 12px;
    margin-bottom: 20px;
    transition: border-color 0.15s;
  }

  .input:focus {
    outline: none;
    border-color: #a1a1aa;
  }

  .input::placeholder {
    color: #a1a1aa;
  }

  .input.small {
    flex: 1;
    height: 42px;
    margin-bottom: 0;
    font-size: 14px;
  }

  /* Chips */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin-bottom: 16px;
  }

  .chip {
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 450;
    color: #52525b;
    background: white;
    border: 1px solid #e4e4e7;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .chip:hover {
    border-color: #a1a1aa;
  }

  .chip.selected {
    color: white;
    background: #18181b;
    border-color: #18181b;
  }

  .add-row {
    display: flex;
    gap: 8px;
    width: 100%;
    margin-bottom: 20px;
  }

  /* Goals */
  .goals {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 24px;
  }

  .goal-row {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 14px 16px;
    background: white;
    border: 1px solid #e4e4e7;
    border-radius: 12px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s;
  }

  .goal-row:hover {
    border-color: #a1a1aa;
  }

  .goal-row.selected {
    border-color: #18181b;
  }

  .goal-radio {
    width: 20px;
    height: 20px;
    border: 2px solid #d4d4d8;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s;
  }

  .goal-radio.checked {
    border-color: #18181b;
  }

  .radio-dot {
    width: 10px;
    height: 10px;
    background: #18181b;
    border-radius: 50%;
  }

  .goal-text {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .goal-title {
    font-size: 14px;
    font-weight: 500;
    color: #18181b;
  }

  .goal-desc {
    font-size: 13px;
    color: #71717a;
  }

  /* Keys */
  .keys {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 20px;
  }

  kbd {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 48px;
    height: 48px;
    padding: 0 14px;
    font-size: 15px;
    font-weight: 500;
    font-family: inherit;
    color: #18181b;
    background: white;
    border: 1px solid #e4e4e7;
    border-radius: 10px;
  }

  .plus {
    font-size: 16px;
    color: #a1a1aa;
  }

  /* Footer */
  .footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 16px 24px 32px;
  }

  .dots {
    display: flex;
    gap: 6px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #d4d4d8;
    transition: all 0.2s;
  }

  .dot.active {
    background: #18181b;
    width: 18px;
    border-radius: 3px;
  }

  .dot.done {
    background: #a1a1aa;
  }

  .skip {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;
    color: #71717a;
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.15s;
  }

  .skip:hover {
    color: #52525b;
  }
</style>
