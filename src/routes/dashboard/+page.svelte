<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { emit } from '@tauri-apps/api/event';
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

  let activeSection = $state<'overview' | 'sessions' | 'mind' | 'settings'>('overview');
  let mindTab = $state<'constellation' | 'profile'>('constellation');

  // Sample topic data for Knowledge Map
  const currentTopics = [
    { id: 1, name: 'Hegel\'s Dialectics', mastery: 0.72, status: 'learning', connections: [2, 3, 5] },
    { id: 2, name: 'Phenomenology', mastery: 0.45, status: 'learning', connections: [1, 4] },
    { id: 3, name: 'Kant\'s Critique', mastery: 0.88, status: 'reviewing', connections: [1, 5, 6] },
    { id: 4, name: 'Existentialism', mastery: 0.95, status: 'mastered', connections: [2, 6] },
    { id: 5, name: 'Logic & Reasoning', mastery: 0.60, status: 'learning', connections: [1, 3] },
    { id: 6, name: 'Ethics', mastery: 0.33, status: 'learning', connections: [3, 4] },
  ];

  const recommendedTopics = [
    { id: 101, name: 'Metaphysics', mastery: 0, status: 'recommended', connections: [3, 5] },
    { id: 102, name: 'Philosophy of Mind', mastery: 0, status: 'recommended', connections: [2, 4] },
    { id: 103, name: 'Nietzsche', mastery: 0, status: 'recommended', connections: [4, 6] },
  ];

  const allTopics = [...currentTopics, ...recommendedTopics];

  const positions: Record<number, { x: number; y: number }> = {
    1: { x: 50, y: 25 },
    2: { x: 28, y: 42 },
    3: { x: 72, y: 35 },
    4: { x: 32, y: 68 },
    5: { x: 50, y: 50 },
    6: { x: 68, y: 62 },
    101: { x: 78, y: 20 },
    102: { x: 18, y: 28 },
    103: { x: 50, y: 82 },
  };

  // Learning profile data
  const learningProfile = [
    { name: 'Visual', value: 0.85, description: 'Diagrams, charts, videos' },
    { name: 'Reading', value: 0.70, description: 'Texts, articles, books' },
    { name: 'Auditory', value: 0.45, description: 'Lectures, discussions' },
    { name: 'Kinesthetic', value: 0.55, description: 'Practice, hands-on' },
    { name: 'Social', value: 0.60, description: 'Group learning, debate' },
    { name: 'Solitary', value: 0.80, description: 'Self-study, reflection' },
  ];

  function getNodeSize(mastery: number, isRecommended: boolean): number {
    if (isRecommended) return 1.8;
    return 2 + mastery * 2;
  }

  // Pan/zoom state for constellation
  let panX = $state(0);
  let panY = $state(0);
  let scale = $state(1);
  let dragging = $state(false);
  let dragStart = { x: 0, y: 0 };

  function startDragConstellation(e: MouseEvent) {
    e.stopPropagation();
    dragging = true;
    dragStart = { x: e.clientX - panX, y: e.clientY - panY };
  }

  function onDragConstellation(e: MouseEvent) {
    if (!dragging) return;
    panX = e.clientX - dragStart.x;
    panY = e.clientY - dragStart.y;
  }

  function endDragConstellation() {
    dragging = false;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    scale = Math.max(0.5, Math.min(3, scale + delta));
  }

  function resetView() {
    panX = 0;
    panY = 0;
    scale = 1;
  }

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
      const date = parseDate(s.started_at);
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

  async function openSession(session: Conversation) {
    // Emit event to main window to load this conversation
    await emit('load-conversation', { conversationId: session.id });

    // Show and focus the main window
    const mainWindow = await WebviewWindow.getByLabel('main');
    if (mainWindow) {
      await mainWindow.show();
      await mainWindow.setFocus();
    }

    // Close the dashboard
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
</script>


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
        onmousedown={(e) => e.stopPropagation()}
      >Overview</button>
      <button
        class="nav-item"
        class:active={activeSection === 'sessions'}
        onclick={() => activeSection = 'sessions'}
        onmousedown={(e) => e.stopPropagation()}
      >Sessions</button>
      <button
        class="nav-item"
        class:active={activeSection === 'mind'}
        onclick={() => activeSection = 'mind'}
        onmousedown={(e) => e.stopPropagation()}
      >Mind</button>
      <button
        class="nav-item"
        class:active={activeSection === 'settings'}
        onclick={() => activeSection = 'settings'}
        onmousedown={(e) => e.stopPropagation()}
      >Settings</button>
    </nav>

    <div class="header-right">
      <button
        class="close-btn"
        onclick={closeWindow}
        onmousedown={(e) => e.stopPropagation()}
        aria-label="Close"
      >
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
          <button class="btn-primary" onclick={startSession} onmousedown={(e) => e.stopPropagation()}>
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
              <button class="link" onclick={() => activeSection = 'sessions'} onmousedown={(e) => e.stopPropagation()}>View all</button>
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
                <button class="session-row" onclick={() => openSession(session)} onmousedown={(e) => e.stopPropagation()}>
                  <span class="session-title">{getTitle(session)}</span>
                  <span class="session-time">{formatDate(session.started_at)}</span>
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
          <span class="count">{sessions.length}</span>
        </div>

        {#if isLoading}
          <div class="empty">
            <p>Loading...</p>
          </div>
        {:else if sessions.length === 0}
          <div class="empty">
            <p>No sessions yet</p>
            <span>Start a session to begin</span>
          </div>
        {:else}
          <div class="session-list full">
            {#each sessions as session}
              <button class="session-row" onclick={() => openSession(session)} onmousedown={(e) => e.stopPropagation()}>
                <span class="session-title">{getTitle(session)}</span>
                <span class="session-time">{formatDate(session.started_at)}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

    {:else if activeSection === 'mind'}
      <div class="view mind-view">
        <!-- Sub-tabs -->
        <div class="mind-tabs">
          <button
            class="mind-tab"
            class:active={mindTab === 'constellation'}
            onclick={() => mindTab = 'constellation'}
            onmousedown={(e) => e.stopPropagation()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="3"/>
              <circle cx="4" cy="6" r="2"/>
              <circle cx="20" cy="6" r="2"/>
              <circle cx="4" cy="18" r="2"/>
              <circle cx="20" cy="18" r="2"/>
            </svg>
            Knowledge Map
          </button>
          <button
            class="mind-tab"
            class:active={mindTab === 'profile'}
            onclick={() => mindTab = 'profile'}
            onmousedown={(e) => e.stopPropagation()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
            </svg>
            Learning Profile
          </button>
        </div>

        {#if mindTab === 'constellation'}
          <!-- Knowledge Map -->
          <div class="constellation-wrapper">
            <div class="constellation-controls">
              <span class="zoom-level">{Math.round(scale * 100)}%</span>
              <button class="ctrl-btn" onclick={() => { scale = Math.max(0.5, scale - 0.2); }} onmousedown={(e) => e.stopPropagation()} title="Zoom out">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              <button class="ctrl-btn" onclick={() => { scale = Math.min(3, scale + 0.2); }} onmousedown={(e) => e.stopPropagation()} title="Zoom in">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              <button class="ctrl-btn" onclick={resetView} onmousedown={(e) => e.stopPropagation()} title="Reset view">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
              </button>
            </div>

            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="constellation-canvas"
              onmousedown={startDragConstellation}
              onmousemove={onDragConstellation}
              onmouseup={endDragConstellation}
              onmouseleave={endDragConstellation}
              onwheel={handleWheel}
              style="cursor: {dragging ? 'grabbing' : 'grab'};"
            >
              <div
                class="constellation-inner"
                style="transform: translate({panX}px, {panY}px) scale({scale});"
              >
                <svg viewBox="0 0 100 100" class="constellation-svg" preserveAspectRatio="xMidYMid meet">
                  <!-- Connection lines -->
                  {#each allTopics as topic}
                    {#each topic.connections as connId}
                      {@const other = allTopics.find(t => t.id === connId)}
                      {#if other && positions[topic.id] && positions[connId]}
                        <line
                          x1={positions[topic.id].x}
                          y1={positions[topic.id].y}
                          x2={positions[connId].x}
                          y2={positions[connId].y}
                          class="conn-line"
                          class:recommended={topic.status === 'recommended' || other.status === 'recommended'}
                        />
                      {/if}
                    {/each}
                  {/each}

                  <!-- Nodes -->
                  {#each allTopics as topic}
                    {@const pos = positions[topic.id]}
                    {@const isRecommended = topic.status === 'recommended'}
                    {@const size = getNodeSize(topic.mastery, isRecommended)}
                    {#if pos}
                      <g class="topic-node" class:recommended={isRecommended}>
                        {#if !isRecommended}
                          <circle
                            cx={pos.x}
                            cy={pos.y}
                            r={size * 2.5}
                            class="node-glow"
                            style="opacity: {0.08 + topic.mastery * 0.12}"
                          />
                        {/if}
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={size}
                          class="node-circle"
                          class:mastered={topic.status === 'mastered'}
                          class:reviewing={topic.status === 'reviewing'}
                        />
                      </g>
                    {/if}
                  {/each}
                </svg>

                <!-- Labels -->
                {#each allTopics as topic}
                  {@const pos = positions[topic.id]}
                  {@const isRecommended = topic.status === 'recommended'}
                  {#if pos}
                    <div
                      class="topic-label"
                      class:recommended={isRecommended}
                      class:mastered={topic.status === 'mastered'}
                      style="left: {pos.x}%; top: {pos.y}%;"
                    >
                      <span class="topic-name">{topic.name}</span>
                      {#if !isRecommended}
                        <span class="topic-pct">{Math.round(topic.mastery * 100)}%</span>
                      {:else}
                        <span class="topic-rec">Suggested</span>
                      {/if}
                    </div>
                  {/if}
                {/each}
              </div>
              <div class="pan-hint">Drag to pan, scroll to zoom</div>
            </div>
          </div>

        {:else}
          <!-- Learning Profile (Radar) -->
          <div class="profile-wrapper">
            <div class="radar-container">
              <svg viewBox="0 0 200 200" class="radar-svg">
                <!-- Background rings -->
                {#each [0.25, 0.5, 0.75, 1] as ring}
                  <polygon
                    class="radar-ring"
                    points={learningProfile.map((_, i) => {
                      const angle = (i * 2 * Math.PI / learningProfile.length) - Math.PI / 2;
                      const r = 70 * ring;
                      return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
                    }).join(' ')}
                  />
                {/each}

                <!-- Axes -->
                {#each learningProfile as _, i}
                  <line
                    class="radar-axis"
                    x1="100"
                    y1="100"
                    x2={100 + 70 * Math.cos((i * 2 * Math.PI / learningProfile.length) - Math.PI / 2)}
                    y2={100 + 70 * Math.sin((i * 2 * Math.PI / learningProfile.length) - Math.PI / 2)}
                  />
                {/each}

                <!-- Data polygon -->
                <polygon
                  class="radar-data"
                  points={learningProfile.map((item, i) => {
                    const angle = (i * 2 * Math.PI / learningProfile.length) - Math.PI / 2;
                    const r = 70 * item.value;
                    return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
                  }).join(' ')}
                />

                <!-- Data points -->
                {#each learningProfile as item, i}
                  {@const angle = (i * 2 * Math.PI / learningProfile.length) - Math.PI / 2}
                  {@const r = 70 * item.value}
                  <circle
                    class="radar-point"
                    cx={100 + r * Math.cos(angle)}
                    cy={100 + r * Math.sin(angle)}
                    r="4"
                  />
                {/each}
              </svg>

              <!-- Labels -->
              {#each learningProfile as item, i}
                {@const angle = (i * 2 * Math.PI / learningProfile.length) - Math.PI / 2}
                <div
                  class="radar-label"
                  title={item.description}
                  style="left: {50 + 42 * Math.cos(angle)}%; top: {50 + 42 * Math.sin(angle)}%;"
                >
                  <span class="radar-name">{item.name}</span>
                  <span class="radar-value">{Math.round(item.value * 100)}%</span>
                </div>
              {/each}
            </div>
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
              onmousedown={(e) => e.stopPropagation()}
            />
            <button class="btn-icon" onclick={() => showApiKey = !showApiKey} onmousedown={(e) => e.stopPropagation()} aria-label="Toggle visibility">
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
              onmousedown={(e) => e.stopPropagation()}
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
    font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
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
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
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
    justify-content: flex-start;
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
    justify-content: flex-end;
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
    position: relative;
    z-index: 10;
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

  /* Mind Section */
  .mind-view {
    max-width: 700px;
  }

  .mind-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 24px;
  }

  .mind-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: rgba(250, 250, 250, 0.5);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mind-tab:hover {
    color: rgba(250, 250, 250, 0.8);
    border-color: rgba(255, 255, 255, 0.12);
  }

  .mind-tab.active {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
    color: #fafafa;
  }

  /* Constellation */
  .constellation-wrapper {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .constellation-controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }

  .zoom-level {
    font-size: 11px;
    color: rgba(250, 250, 250, 0.4);
    font-variant-numeric: tabular-nums;
    min-width: 32px;
    text-align: right;
    margin-right: 4px;
  }

  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 5px;
    color: rgba(250, 250, 250, 0.5);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .ctrl-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fafafa;
  }

  .constellation-canvas {
    position: relative;
    aspect-ratio: 16 / 10;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    overflow: hidden;
    user-select: none;
  }

  .constellation-inner {
    position: relative;
    width: 100%;
    height: 100%;
    transform-origin: center center;
    transition: transform 0.05s ease-out;
  }

  .constellation-svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .conn-line {
    stroke: rgba(255, 255, 255, 0.15);
    stroke-width: 0.4;
  }

  .conn-line.recommended {
    stroke: rgba(255, 255, 255, 0.08);
    stroke-dasharray: 1.5, 1.5;
  }

  .node-glow {
    fill: rgba(255, 255, 255, 0.2);
    filter: blur(4px);
  }

  .node-circle {
    fill: rgba(250, 250, 250, 0.7);
  }

  .node-circle.mastered {
    fill: #fafafa;
  }

  .node-circle.reviewing {
    fill: rgba(250, 250, 250, 0.85);
  }

  .topic-node.recommended .node-circle {
    fill: none;
    stroke: rgba(255, 255, 255, 0.25);
    stroke-width: 0.5;
    stroke-dasharray: 1.5, 1.5;
  }

  .topic-label {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px 8px;
    background: rgba(9, 9, 11, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 5px;
    white-space: nowrap;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transform: translate(8px, -50%);
    pointer-events: none;
  }

  .topic-label.recommended {
    background: rgba(9, 9, 11, 0.7);
    border-style: dashed;
    border-color: rgba(255, 255, 255, 0.08);
  }

  .topic-label.mastered {
    border-color: rgba(255, 255, 255, 0.2);
  }

  .topic-name {
    font-size: 10px;
    font-weight: 600;
    color: #fafafa;
    letter-spacing: -0.2px;
    line-height: 1.2;
  }

  .topic-label.recommended .topic-name {
    color: rgba(250, 250, 250, 0.5);
    font-weight: 500;
  }

  .topic-pct {
    font-size: 9px;
    color: rgba(250, 250, 250, 0.5);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }

  .topic-label.mastered .topic-pct {
    color: rgba(250, 250, 250, 0.7);
  }

  .topic-rec {
    font-size: 8px;
    color: rgba(250, 250, 250, 0.35);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    line-height: 1.2;
  }

  .pan-hint {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    padding: 5px 10px;
    background: rgba(9, 9, 11, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 5px;
    font-size: 9px;
    color: rgba(250, 250, 250, 0.35);
    pointer-events: none;
  }

  /* Radar Chart */
  .profile-wrapper {
    display: flex;
    justify-content: center;
  }

  .radar-container {
    position: relative;
    width: 100%;
    max-width: 360px;
    aspect-ratio: 1;
  }

  .radar-svg {
    width: 100%;
    height: 100%;
  }

  .radar-ring {
    fill: none;
    stroke: rgba(255, 255, 255, 0.06);
    stroke-width: 1;
  }

  .radar-axis {
    stroke: rgba(255, 255, 255, 0.08);
    stroke-width: 1;
  }

  .radar-data {
    fill: rgba(250, 250, 250, 0.08);
    stroke: rgba(250, 250, 250, 0.8);
    stroke-width: 2;
  }

  .radar-point {
    fill: #fafafa;
  }

  .radar-label {
    position: absolute;
    transform: translate(-50%, -50%);
    text-align: center;
    cursor: help;
    padding: 4px 8px;
    border-radius: 5px;
    transition: background 0.15s ease;
  }

  .radar-label:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .radar-name {
    display: block;
    font-size: 11px;
    font-weight: 500;
    color: rgba(250, 250, 250, 0.9);
  }

  .radar-value {
    font-size: 10px;
    color: rgba(250, 250, 250, 0.45);
  }
</style>
