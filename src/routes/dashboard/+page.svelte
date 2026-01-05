<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getConversations } from '$lib/utils/db';
  import { settingsStore } from '$lib/stores/settings';
  import type { Conversation } from '$lib/types';

  const settings = $derived($settingsStore);

  let sessions = $state<Conversation[]>([]);
  let isLoading = $state(true);
  let totalStudyTime = $state(0);
  let sessionsThisWeek = $state(0);

  let anthropicKeyInput = $state('');
  let showApiKey = $state(false);
  let saveSuccess = $state(false);

  let activeSection = $state<'overview' | 'sessions' | 'settings'>('overview');
  let searchQuery = $state('');

  onMount(async () => {
    await settingsStore.load();
    await loadSessions();
  });

  async function loadSessions() {
    try {
      sessions = await getConversations(50);
      calculateStats();
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      isLoading = false;
    }
  }

  function calculateStats() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    sessionsThisWeek = sessions.filter(s => {
      const date = parseDate(s.created_at);
      return date && date > weekAgo;
    }).length;
    totalStudyTime = sessions.length * 15;
  }

  async function saveApiKey() {
    if (!anthropicKeyInput.trim()) return;
    try {
      await settingsStore.setApiKey('anthropic_api_key', anthropicKeyInput.trim());
      anthropicKeyInput = '';
      saveSuccess = true;
      setTimeout(() => (saveSuccess = false), 2000);
    } catch (e) {
      console.error('Failed to save API key:', e);
    }
  }

  async function startDrag(e: MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, a, .content')) return;
    try {
      await getCurrentWindow().startDragging();
    } catch {}
  }

  async function closeWindow() {
    await getCurrentWindow().close();
  }

  async function startSession() {
    await getCurrentWindow().close();
  }

  function parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    // Handle ISO strings with or without timezone
    let date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      // Try adding Z for UTC
      date = new Date(dateStr + 'Z');
    }
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  }

  function formatDate(dateStr: string): string {
    const date = parseDate(dateStr);
    if (!date) return '';

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function getTitle(s: Conversation): string {
    return s.title || s.summary || 'Untitled session';
  }

  const filteredSessions = $derived(
    searchQuery
      ? sessions.filter(s => getTitle(s).toLowerCase().includes(searchQuery.toLowerCase()))
      : sessions
  );
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
</svelte:head>

<div class="app" onmousedown={startDrag} role="application" aria-label="Eigen Dashboard">
  <header class="header">
    <div class="header-left">
      <div class="brand">
        <span class="brand-mark">E</span>
        <span class="brand-name">Eigen</span>
      </div>
    </div>

    <nav class="nav">
      <button
        class="nav-item"
        class:active={activeSection === 'overview'}
        onclick={() => activeSection = 'overview'}
      >Overview</button>
      <button
        class="nav-item"
        class:active={activeSection === 'sessions'}
        onclick={() => activeSection = 'sessions'}
      >Sessions</button>
      <button
        class="nav-item"
        class:active={activeSection === 'settings'}
        onclick={() => activeSection = 'settings'}
      >Settings</button>
    </nav>

    <div class="header-right">
      <div class="search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          placeholder="Search..."
          bind:value={searchQuery}
        />
      </div>
      <button class="close-btn" onclick={closeWindow} aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  </header>

  <main class="content">
    {#if activeSection === 'overview'}
      <div class="view">
        <section class="hero">
          <div>
            <h1>Welcome back</h1>
            <p class="subtitle">Continue where you left off</p>
          </div>
          <button class="btn-primary" onclick={startSession}>
            Start Session
          </button>
        </section>

        <section class="metrics">
          <div class="metric">
            <span class="metric-value">{totalStudyTime}m</span>
            <span class="metric-label">Total time</span>
          </div>
          <div class="divider"></div>
          <div class="metric">
            <span class="metric-value">{sessionsThisWeek}</span>
            <span class="metric-label">This week</span>
          </div>
          <div class="divider"></div>
          <div class="metric">
            <span class="metric-value">{sessions.length}</span>
            <span class="metric-label">Total sessions</span>
          </div>
        </section>

        <section class="recent">
          <div class="section-header">
            <h2>Recent</h2>
            {#if sessions.length > 0}
              <button class="link" onclick={() => activeSection = 'sessions'}>View all</button>
            {/if}
          </div>

          {#if sessions.length === 0}
            <div class="empty">
              <p>No sessions yet</p>
              <span>Start a session to begin tracking your learning</span>
            </div>
          {:else}
            <div class="session-list">
              {#each sessions.slice(0, 6) as session}
                <button class="session-row">
                  <span class="session-title">{getTitle(session)}</span>
                  <span class="session-time">{formatDate(session.created_at)}</span>
                </button>
              {/each}
            </div>
          {/if}
        </section>
      </div>

    {:else if activeSection === 'sessions'}
      <div class="view">
        <div class="section-header">
          <h2>Sessions</h2>
          <span class="count">{filteredSessions.length}</span>
        </div>

        {#if isLoading}
          <div class="empty">
            <p>Loading...</p>
          </div>
        {:else if filteredSessions.length === 0}
          <div class="empty">
            <p>{searchQuery ? 'No results' : 'No sessions yet'}</p>
            <span>{searchQuery ? 'Try a different search' : 'Start a session to begin'}</span>
          </div>
        {:else}
          <div class="session-list full">
            {#each filteredSessions as session}
              <button class="session-row">
                <span class="session-title">{getTitle(session)}</span>
                <span class="session-time">{formatDate(session.created_at)}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

    {:else if activeSection === 'settings'}
      <div class="view settings-view">
        <div class="section-header">
          <h2>Settings</h2>
        </div>

        <div class="settings-group">
          <label class="settings-label">API Key</label>
          <div class="api-input-row">
            <input
              type={showApiKey ? 'text' : 'password'}
              bind:value={anthropicKeyInput}
              placeholder={settings.anthropic_api_key ? 'Key configured' : 'Enter Anthropic API key'}
              class="input"
            />
            <button class="btn-icon" onclick={() => showApiKey = !showApiKey} aria-label="Toggle visibility">
              {#if showApiKey}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              {:else}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              {/if}
            </button>
            <button
              class="btn-secondary"
              onclick={saveApiKey}
              disabled={!anthropicKeyInput.trim()}
            >
              {saveSuccess ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        <div class="settings-group">
          <label class="settings-label">Status</label>
          <div class="status-row">
            {#if settings.anthropic_api_key}
              <span class="status-dot active"></span>
              <span>Connected</span>
            {:else}
              <span class="status-dot"></span>
              <span>Not configured</span>
            {/if}
          </div>
        </div>

        <div class="settings-group">
          <label class="settings-label">Version</label>
          <span class="version">0.1.0</span>
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background: #09090b;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    color: #fafafa;
    -webkit-font-smoothing: antialiased;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #09090b;
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 52px;
    padding: 0 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    cursor: grab;
    flex-shrink: 0;
  }

  .header:active {
    cursor: grabbing;
  }

  .header-left {
    display: flex;
    align-items: center;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-mark {
    width: 24px;
    height: 24px;
    background: #fafafa;
    color: #09090b;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 13px;
  }

  .brand-name {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.3px;
  }

  .nav {
    display: flex;
    gap: 2px;
  }

  .nav-item {
    padding: 6px 14px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: rgba(250, 250, 250, 0.5);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }

  .nav-item:hover {
    color: rgba(250, 250, 250, 0.8);
  }

  .nav-item.active {
    color: #fafafa;
    background: rgba(255, 255, 255, 0.08);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    color: rgba(250, 250, 250, 0.4);
  }

  .search input {
    width: 140px;
    background: none;
    border: none;
    color: #fafafa;
    font-size: 13px;
    outline: none;
  }

  .search input::placeholder {
    color: rgba(250, 250, 250, 0.35);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: rgba(250, 250, 250, 0.4);
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }

  .close-btn:hover {
    color: #fafafa;
    background: rgba(255, 255, 255, 0.08);
  }

  /* Content */
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 40px;
    display: flex;
    justify-content: center;
  }

  .content::-webkit-scrollbar {
    width: 6px;
  }

  .content::-webkit-scrollbar-track {
    background: transparent;
  }

  .content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  /* View container */
  .view {
    width: 100%;
    max-width: 640px;
  }

  .settings-view {
    max-width: 480px;
  }

  /* Hero */
  .hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 48px;
  }

  .hero h1 {
    margin: 0 0 6px;
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.5px;
  }

  .subtitle {
    margin: 0;
    color: rgba(250, 250, 250, 0.45);
    font-size: 15px;
  }

  .btn-primary {
    padding: 10px 20px;
    background: #fafafa;
    border: none;
    border-radius: 8px;
    color: #09090b;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  /* Metrics */
  .metrics {
    display: flex;
    align-items: center;
    gap: 32px;
    padding: 24px 0;
    margin-bottom: 48px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .metric {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .metric-value {
    font-size: 32px;
    font-weight: 600;
    letter-spacing: -1px;
    font-variant-numeric: tabular-nums;
  }

  .metric-label {
    font-size: 13px;
    color: rgba(250, 250, 250, 0.45);
  }

  .divider {
    width: 1px;
    height: 40px;
    background: rgba(255, 255, 255, 0.08);
  }

  /* Section Header */
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .section-header h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    color: rgba(250, 250, 250, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .link {
    background: none;
    border: none;
    color: rgba(250, 250, 250, 0.45);
    font-size: 13px;
    cursor: pointer;
    transition: color 0.15s;
  }

  .link:hover {
    color: #fafafa;
  }

  .count {
    font-size: 13px;
    color: rgba(250, 250, 250, 0.35);
    font-variant-numeric: tabular-nums;
  }

  /* Session List */
  .session-list {
    display: flex;
    flex-direction: column;
  }

  .session-list.full {
    max-height: calc(100vh - 180px);
    overflow-y: auto;
  }

  .session-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 14px 0;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    cursor: pointer;
    transition: opacity 0.15s;
    text-align: left;
  }

  .session-row:hover {
    opacity: 0.7;
  }

  .session-row:last-child {
    border-bottom: none;
  }

  .session-title {
    font-size: 14px;
    font-weight: 450;
    color: #fafafa;
  }

  .session-time {
    font-size: 13px;
    color: rgba(250, 250, 250, 0.35);
    font-variant-numeric: tabular-nums;
  }

  /* Empty State */
  .empty {
    padding: 48px 0;
    text-align: center;
  }

  .empty p {
    margin: 0 0 6px;
    font-size: 14px;
    color: rgba(250, 250, 250, 0.6);
  }

  .empty span {
    font-size: 13px;
    color: rgba(250, 250, 250, 0.35);
  }

  /* Settings */
  .settings-group {
    margin-bottom: 32px;
  }

  .settings-label {
    display: block;
    margin-bottom: 10px;
    font-size: 13px;
    font-weight: 500;
    color: rgba(250, 250, 250, 0.5);
  }

  .api-input-row {
    display: flex;
    gap: 8px;
  }

  .input {
    flex: 1;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #fafafa;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }

  .input::placeholder {
    color: rgba(250, 250, 250, 0.3);
  }

  .input:focus {
    border-color: rgba(255, 255, 255, 0.25);
  }

  .btn-icon {
    padding: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: rgba(250, 250, 250, 0.5);
    cursor: pointer;
    transition: color 0.15s;
  }

  .btn-icon:hover {
    color: #fafafa;
  }

  .btn-secondary {
    padding: 10px 16px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #fafafa;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-secondary:hover:not(:disabled) {
    opacity: 0.8;
  }

  .btn-secondary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: rgba(250, 250, 250, 0.7);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(250, 250, 250, 0.25);
  }

  .status-dot.active {
    background: #22c55e;
  }

  .version {
    font-size: 14px;
    color: rgba(250, 250, 250, 0.45);
    font-variant-numeric: tabular-nums;
  }
</style>
