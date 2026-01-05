<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getConversations } from '$lib/utils/db';
  import { settingsStore } from '$lib/stores/settings';
  import { getSetting, setSetting } from '$lib/utils/db';
  import type { Conversation } from '$lib/types';

  const settings = $derived($settingsStore);

  // Data
  let sessions = $state<Conversation[]>([]);
  let isLoading = $state(true);
  let totalStudyTime = $state(0);
  let sessionsThisWeek = $state(0);
  let currentStreak = $state(0);

  // Settings
  let anthropicKeyInput = $state('');
  let showApiKey = $state(false);
  let saveSuccess = $state(false);

  // Active section
  let activeSection = $state<'overview' | 'sessions' | 'settings'>('overview');

  onMount(async () => {
    await settingsStore.load();
    await loadSessions();
    await loadStats();
  });

  async function loadSessions() {
    try {
      sessions = await getConversations(20);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      isLoading = false;
    }
  }

  async function loadStats() {
    // Calculate stats from sessions
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    sessionsThisWeek = sessions.filter(s => new Date(s.created_at + 'Z') > weekAgo).length;

    // Mock streak calculation (would need proper date tracking)
    currentStreak = Math.min(sessionsThisWeek, 7);

    // Total study time (mock - would need actual duration tracking)
    totalStudyTime = sessions.length * 15; // Assume 15 min avg per session
  }

  async function saveApiKey() {
    try {
      if (anthropicKeyInput.trim()) {
        await settingsStore.setApiKey('anthropic_api_key', anthropicKeyInput.trim());
        anthropicKeyInput = '';
        saveSuccess = true;
        setTimeout(() => (saveSuccess = false), 3000);
      }
    } catch (e) {
      console.error('Failed to save API key:', e);
    }
  }

  async function startDrag(e: MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('a') || target.closest('.content-area')) return;

    try {
      const window = getCurrentWindow();
      await window.startDragging();
    } catch (error) {
      console.error('Failed to start dragging:', error);
    }
  }

  async function closeWindow() {
    const window = getCurrentWindow();
    await window.close();
  }

  async function minimizeWindow() {
    const window = getCurrentWindow();
    await window.minimize();
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'Z');
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function getSessionTitle(session: Conversation): string {
    return session.title || session.summary || 'Untitled session';
  }
</script>

<div class="dashboard" onmousedown={startDrag}>
  <!-- Header -->
  <header class="header">
    <div class="header-left">
      <div class="window-controls">
        <button class="window-btn close" onclick={closeWindow}></button>
        <button class="window-btn minimize" onclick={minimizeWindow}></button>
        <button class="window-btn maximize" disabled></button>
      </div>
      <div class="logo">
        <span class="logo-icon">E</span>
        <span class="logo-text">Eigen</span>
      </div>
    </div>

    <div class="header-center">
      <div class="search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input type="text" placeholder="Search or ask anything..." />
      </div>
    </div>

    <div class="header-right">
      <div class="nav-tabs">
        <button
          class="nav-tab {activeSection === 'overview' ? 'active' : ''}"
          onclick={() => activeSection = 'overview'}
        >Overview</button>
        <button
          class="nav-tab {activeSection === 'sessions' ? 'active' : ''}"
          onclick={() => activeSection = 'sessions'}
        >Sessions</button>
        <button
          class="nav-tab {activeSection === 'settings' ? 'active' : ''}"
          onclick={() => activeSection = 'settings'}
        >Settings</button>
      </div>
    </div>
  </header>

  <!-- Content -->
  <div class="content-area">
    {#if activeSection === 'overview'}
      <!-- Hero Section -->
      <section class="hero">
        <div class="hero-content">
          <h1>Welcome back</h1>
          <p>Continue your learning journey</p>
        </div>
        <button class="start-btn">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
            <circle cx="12" cy="12" r="4" />
          </svg>
          Start Session
        </button>
      </section>

      <!-- Stats Grid -->
      <section class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon study-time">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">{totalStudyTime}m</span>
            <span class="stat-label">Total study time</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon sessions">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">{sessionsThisWeek}</span>
            <span class="stat-label">Sessions this week</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon streak">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-value">{currentStreak} days</span>
            <span class="stat-label">Current streak</span>
          </div>
        </div>
      </section>

      <!-- Feature Cards -->
      <section class="feature-cards">
        <div class="feature-card gradient-blue">
          <h3>Screen Recording</h3>
          <p>Record your screen while studying and get AI assistance in real-time</p>
          <button class="feature-btn">Learn more</button>
        </div>
        <div class="feature-card gradient-purple">
          <h3>Smart Context</h3>
          <p>AI understands what you're working on and provides relevant help</p>
          <button class="feature-btn">Explore</button>
        </div>
      </section>

      <!-- Recent Sessions -->
      <section class="recent-sessions">
        <div class="section-header">
          <h2>Recent Sessions</h2>
          <button class="see-all" onclick={() => activeSection = 'sessions'}>See all</button>
        </div>
        <div class="sessions-list">
          {#if sessions.length === 0}
            <div class="empty-sessions">
              <p>No sessions yet. Start your first session!</p>
            </div>
          {:else}
            {#each sessions.slice(0, 5) as session}
              <div class="session-item">
                <div class="session-info">
                  <span class="session-title">{getSessionTitle(session)}</span>
                  <span class="session-meta">{formatDate(session.created_at)}</span>
                </div>
                <div class="session-duration">
                  <span class="duration-time">{formatTime(new Date(session.created_at + 'Z'))}</span>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </section>

    {:else if activeSection === 'sessions'}
      <!-- All Sessions View -->
      <section class="all-sessions">
        <div class="section-header">
          <h2>All Sessions</h2>
          <span class="session-count">{sessions.length} total</span>
        </div>

        <div class="sessions-list full">
          {#if isLoading}
            <div class="loading">Loading sessions...</div>
          {:else if sessions.length === 0}
            <div class="empty-sessions">
              <p>No sessions yet. Start recording to create your first session!</p>
            </div>
          {:else}
            {#each sessions as session}
              <div class="session-item">
                <div class="session-info">
                  <span class="session-title">{getSessionTitle(session)}</span>
                  <span class="session-meta">{formatDate(session.created_at)}</span>
                </div>
                <div class="session-duration">
                  <span class="duration-time">{formatTime(new Date(session.created_at + 'Z'))}</span>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </section>

    {:else if activeSection === 'settings'}
      <!-- Settings View -->
      <section class="settings-section">
        <div class="section-header">
          <h2>Settings</h2>
        </div>

        <div class="settings-group">
          <h3>API Configuration</h3>
          <div class="setting-item">
            <div class="setting-label">
              <span class="label-text">Anthropic API Key</span>
              <span class="label-hint">Required for AI features</span>
            </div>
            <div class="setting-input">
              <input
                type={showApiKey ? 'text' : 'password'}
                bind:value={anthropicKeyInput}
                placeholder={settings.anthropic_api_key ? 'Key saved' : 'Enter your API key'}
              />
              <button class="toggle-visibility" onclick={() => showApiKey = !showApiKey}>
                {#if showApiKey}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                {/if}
              </button>
              <button class="save-btn" onclick={saveApiKey} disabled={!anthropicKeyInput.trim()}>
                {saveSuccess ? 'Saved!' : 'Save'}
              </button>
            </div>
          </div>
        </div>

        <div class="settings-group">
          <h3>Account</h3>
          <div class="setting-item">
            <div class="setting-label">
              <span class="label-text">Status</span>
            </div>
            <div class="setting-value">
              {#if settings.anthropic_api_key}
                <span class="status-badge active">API Connected</span>
              {:else}
                <span class="status-badge inactive">API Key Required</span>
              {/if}
            </div>
          </div>
        </div>

        <div class="settings-group">
          <h3>About</h3>
          <div class="setting-item">
            <div class="setting-label">
              <span class="label-text">Version</span>
            </div>
            <div class="setting-value">
              <span>0.1.0</span>
            </div>
          </div>
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: #0a0a0b;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
    color: white;
  }

  .dashboard {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: linear-gradient(180deg, #0f0f11 0%, #0a0a0b 100%);
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    cursor: grab;
  }

  .header:active {
    cursor: grabbing;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .window-controls {
    display: flex;
    gap: 8px;
  }

  .window-btn {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .window-btn:hover {
    opacity: 0.8;
  }

  .window-btn.close {
    background: #ff5f57;
  }

  .window-btn.minimize {
    background: #febc2e;
  }

  .window-btn.maximize {
    background: #28c840;
    opacity: 0.5;
    cursor: default;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .logo-icon {
    width: 28px;
    height: 28px;
    background: linear-gradient(135deg, #0a84ff 0%, #5e5ce6 100%);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
  }

  .logo-text {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.5px;
  }

  .header-center {
    flex: 1;
    max-width: 400px;
    margin: 0 24px;
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
  }

  .search-icon {
    width: 16px;
    height: 16px;
    color: rgba(255, 255, 255, 0.4);
  }

  .search-bar input {
    flex: 1;
    background: none;
    border: none;
    color: white;
    font-size: 14px;
    outline: none;
  }

  .search-bar input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .header-right {
    display: flex;
    align-items: center;
  }

  .nav-tabs {
    display: flex;
    gap: 4px;
  }

  .nav-tab {
    padding: 8px 16px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .nav-tab:hover {
    color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.06);
  }

  .nav-tab.active {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }

  /* Content */
  .content-area {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px;
    cursor: default;
  }

  .content-area::-webkit-scrollbar {
    width: 8px;
  }

  .content-area::-webkit-scrollbar-track {
    background: transparent;
  }

  .content-area::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }

  /* Hero */
  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 32px;
  }

  .hero-content h1 {
    font-size: 28px;
    font-weight: 600;
    margin: 0 0 4px;
    letter-spacing: -0.5px;
  }

  .hero-content p {
    margin: 0;
    color: rgba(255, 255, 255, 0.5);
    font-size: 15px;
  }

  .start-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 24px;
    background: linear-gradient(135deg, #0a84ff 0%, #5e5ce6 100%);
    border: none;
    border-radius: 12px;
    color: white;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 16px rgba(10, 132, 255, 0.3);
  }

  .start-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(10, 132, 255, 0.4);
  }

  .start-btn svg {
    width: 20px;
    height: 20px;
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 32px;
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
  }

  .stat-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .stat-icon svg {
    width: 24px;
    height: 24px;
  }

  .stat-icon.study-time {
    background: rgba(10, 132, 255, 0.15);
    color: #0a84ff;
  }

  .stat-icon.sessions {
    background: rgba(48, 209, 88, 0.15);
    color: #30d158;
  }

  .stat-icon.streak {
    background: rgba(255, 159, 10, 0.15);
    color: #ff9f0a;
  }

  .stat-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-value {
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.5px;
  }

  .stat-label {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
  }

  /* Feature Cards */
  .feature-cards {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin-bottom: 32px;
  }

  .feature-card {
    padding: 24px;
    border-radius: 16px;
    position: relative;
    overflow: hidden;
  }

  .feature-card.gradient-blue {
    background: linear-gradient(135deg, rgba(10, 132, 255, 0.2) 0%, rgba(94, 92, 230, 0.2) 100%);
    border: 1px solid rgba(10, 132, 255, 0.2);
  }

  .feature-card.gradient-purple {
    background: linear-gradient(135deg, rgba(191, 90, 242, 0.2) 0%, rgba(94, 92, 230, 0.2) 100%);
    border: 1px solid rgba(191, 90, 242, 0.2);
  }

  .feature-card h3 {
    margin: 0 0 8px;
    font-size: 17px;
    font-weight: 600;
  }

  .feature-card p {
    margin: 0 0 16px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.5;
  }

  .feature-btn {
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: white;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .feature-btn:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  /* Sessions */
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .section-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .see-all, .session-count {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.5);
    background: none;
    border: none;
    cursor: pointer;
  }

  .see-all:hover {
    color: #0a84ff;
  }

  .sessions-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    overflow: hidden;
  }

  .sessions-list.full {
    max-height: calc(100vh - 200px);
    overflow-y: auto;
  }

  .session-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: rgba(255, 255, 255, 0.02);
    cursor: pointer;
    transition: background 0.2s;
  }

  .session-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .session-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .session-title {
    font-size: 15px;
    font-weight: 500;
  }

  .session-meta {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.4);
  }

  .session-duration {
    text-align: right;
  }

  .duration-time {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.5);
    font-variant-numeric: tabular-nums;
  }

  .empty-sessions {
    padding: 40px;
    text-align: center;
  }

  .empty-sessions p {
    margin: 0;
    color: rgba(255, 255, 255, 0.4);
    font-size: 14px;
  }

  .loading {
    padding: 40px;
    text-align: center;
    color: rgba(255, 255, 255, 0.4);
  }

  /* Settings */
  .settings-section {
    max-width: 600px;
  }

  .settings-group {
    margin-bottom: 32px;
  }

  .settings-group h3 {
    margin: 0 0 16px;
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .setting-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    margin-bottom: 8px;
  }

  .setting-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .label-text {
    font-size: 15px;
    font-weight: 500;
  }

  .label-hint {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.4);
  }

  .setting-input {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .setting-input input {
    width: 200px;
    padding: 10px 14px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: white;
    font-size: 14px;
    outline: none;
  }

  .setting-input input::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .setting-input input:focus {
    border-color: rgba(10, 132, 255, 0.5);
  }

  .toggle-visibility {
    padding: 8px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
  }

  .toggle-visibility svg {
    width: 18px;
    height: 18px;
  }

  .toggle-visibility:hover {
    color: rgba(255, 255, 255, 0.8);
  }

  .save-btn {
    padding: 10px 20px;
    background: #0a84ff;
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .save-btn:hover:not(:disabled) {
    background: #0077ed;
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .setting-value {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.7);
  }

  .status-badge {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
  }

  .status-badge.active {
    background: rgba(48, 209, 88, 0.15);
    color: #30d158;
  }

  .status-badge.inactive {
    background: rgba(255, 69, 58, 0.15);
    color: #ff453a;
  }

  /* All Sessions */
  .all-sessions {
    height: 100%;
  }
</style>
