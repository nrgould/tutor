<script lang="ts">
  import { onMount } from 'svelte';

  let activeTab = $state<'constellation' | 'profile'>('constellation');
  let mounted = $state(false);
  let isFullscreen = $state(false);

  onMount(() => {
    mounted = true;
  });

  function toggleFullscreen() {
    isFullscreen = !isFullscreen;
  }

  // Sample topic data - current learning
  const currentTopics = [
    { id: 1, name: 'Hegel\'s Dialectics', mastery: 0.72, status: 'learning', connections: [2, 3, 5] },
    { id: 2, name: 'Phenomenology', mastery: 0.45, status: 'learning', connections: [1, 4] },
    { id: 3, name: 'Kant\'s Critique', mastery: 0.88, status: 'reviewing', connections: [1, 5, 6] },
    { id: 4, name: 'Existentialism', mastery: 0.95, status: 'mastered', connections: [2, 6] },
    { id: 5, name: 'Logic & Reasoning', mastery: 0.60, status: 'learning', connections: [1, 3] },
    { id: 6, name: 'Ethics', mastery: 0.33, status: 'learning', connections: [3, 4] },
  ];

  // AI-recommended topics (not yet started)
  const recommendedTopics = [
    { id: 101, name: 'Metaphysics', mastery: 0, status: 'recommended', connections: [3, 5] },
    { id: 102, name: 'Philosophy of Mind', mastery: 0, status: 'recommended', connections: [2, 4] },
    { id: 103, name: 'Nietzsche', mastery: 0, status: 'recommended', connections: [4, 6] },
  ];

  const allTopics = [...currentTopics, ...recommendedTopics];

  // Organic, web-like positions - tighter cluster in center
  const positions: Record<number, { x: number; y: number }> = {
    // Current topics - closer together, organic
    1: { x: 48, y: 28 },      // Hegel - upper
    2: { x: 25, y: 45 },      // Phenomenology - left
    3: { x: 72, y: 38 },      // Kant - right upper
    4: { x: 30, y: 70 },      // Existentialism - lower left
    5: { x: 50, y: 52 },      // Logic - center
    6: { x: 68, y: 65 },      // Ethics - lower right
    // Recommended - outer positions
    101: { x: 85, y: 25 },    // Metaphysics
    102: { x: 12, y: 32 },    // Philosophy of Mind
    103: { x: 50, y: 85 },    // Nietzsche
  };

  // Learning profile data (learning styles)
  const learningProfile = [
    { name: 'Visual', value: 0.85, description: 'Diagrams, charts, videos' },
    { name: 'Reading', value: 0.70, description: 'Texts, articles, books' },
    { name: 'Auditory', value: 0.45, description: 'Lectures, discussions' },
    { name: 'Kinesthetic', value: 0.55, description: 'Practice, hands-on' },
    { name: 'Social', value: 0.60, description: 'Group learning, debate' },
    { name: 'Solitary', value: 0.80, description: 'Self-study, reflection' },
  ];

  // Facts about the user
  const userFacts = [
    { key: 'Name', value: 'Sean' },
    { key: 'Focus', value: 'Continental Philosophy' },
    { key: 'Goal', value: 'Graduate Studies' },
    { key: 'Sessions', value: '47' },
  ];

  // Node sizes
  function getNodeSize(mastery: number, isRecommended: boolean): number {
    if (isRecommended) return 1.8;
    return 2 + mastery * 2;
  }

  // Fullscreen pan state
  let panX = $state(0);
  let panY = $state(0);
  let isDragging = $state(false);
  let dragStart = { x: 0, y: 0 };
  let scale = $state(1.5);

  function startDrag(e: MouseEvent) {
    isDragging = true;
    dragStart = { x: e.clientX - panX, y: e.clientY - panY };
  }

  function onDrag(e: MouseEvent) {
    if (!isDragging) return;
    panX = e.clientX - dragStart.x;
    panY = e.clientY - dragStart.y;
  }

  function endDrag() {
    isDragging = false;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    scale = Math.max(0.8, Math.min(3, scale + delta));
  }

  // Calculate label position based on node position (keeps labels outside center)
  function getLabelStyle(pos: { x: number; y: number }): string {
    const centerX = 50;
    const centerY = 50;

    // Direction from center to node
    const dx = pos.x - centerX;
    const dy = pos.y - centerY;

    // Small offset in that direction (3% = very close)
    const offsetX = dx > 0 ? 4 : dx < 0 ? -4 : 0;
    const offsetY = dy > 0 ? 4 : dy < 0 ? -4 : 0;

    // Transform based on quadrant
    let transform = 'translate(-50%, -50%)';
    if (dx > 5) transform = 'translate(0, -50%)';
    else if (dx < -5) transform = 'translate(-100%, -50%)';
    else if (dy > 5) transform = 'translate(-50%, 0)';
    else if (dy < -5) transform = 'translate(-50%, -100%)';

    return `left: calc(${pos.x}% + ${offsetX}px); top: calc(${pos.y}% + ${offsetY}px); transform: ${transform};`;
  }
</script>

<div class="memory-view">
  <!-- Header -->
  <header class="header">
    <div class="header-content">
      <h1>Your Learning Mind</h1>
      <p>How Eigen understands your knowledge</p>
    </div>
  </header>

  <!-- Tab Navigation -->
  <nav class="tabs">
    <button
      class="tab"
      class:active={activeTab === 'constellation'}
      onclick={() => activeTab = 'constellation'}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="3"/>
        <circle cx="4" cy="6" r="2"/>
        <circle cx="20" cy="6" r="2"/>
        <circle cx="4" cy="18" r="2"/>
        <circle cx="20" cy="18" r="2"/>
        <path d="M12 9V6M12 15v3M9 12H6M15 12h3"/>
      </svg>
      Knowledge Map
    </button>
    <button
      class="tab"
      class:active={activeTab === 'profile'}
      onclick={() => activeTab = 'profile'}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
      </svg>
      Learning Profile
    </button>
  </nav>

  <!-- Content -->
  <main class="content">
    {#if activeTab === 'constellation'}
      <!-- Constellation View -->
      <div class="constellation-container">
        <div class="constellation">
          <!-- Fullscreen toggle -->
          <button class="fullscreen-btn" onclick={toggleFullscreen} title="Toggle fullscreen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
          </button>

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
                    class="connection-line"
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
                <g class="node-group" class:recommended={isRecommended}>
                  <!-- Glow effect for non-recommended -->
                  {#if !isRecommended}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={size * 2.5}
                      class="node-glow"
                      style="opacity: {0.08 + topic.mastery * 0.12}"
                    />
                  {/if}
                  <!-- Main node - solid fill, no inner cutout -->
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={size}
                    class="node"
                    class:mastered={topic.status === 'mastered'}
                    class:reviewing={topic.status === 'reviewing'}
                  />
                </g>
              {/if}
            {/each}
          </svg>

          <!-- Labels overlay with pill style - positioned very close to nodes -->
          <div class="labels-overlay">
            {#each allTopics as topic}
              {@const pos = positions[topic.id]}
              {@const isRecommended = topic.status === 'recommended'}
              {#if pos}
                <div
                  class="node-label"
                  class:recommended={isRecommended}
                  class:mastered={topic.status === 'mastered'}
                  style={getLabelStyle(pos)}
                >
                  <span class="label-name">{topic.name}</span>
                  {#if !isRecommended}
                    <span class="label-mastery">{Math.round(topic.mastery * 100)}%</span>
                  {:else}
                    <span class="label-suggested">Suggested</span>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        </div>

        <!-- Legend -->
        <div class="constellation-legend">
          <div class="legend-section">
            <span class="legend-title">Progress</span>
            <div class="legend-items">
              <div class="legend-item">
                <span class="legend-dot learning"></span>
                <span>Learning</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot reviewing"></span>
                <span>Reviewing</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot mastered"></span>
                <span>Mastered</span>
              </div>
            </div>
          </div>
          <div class="legend-section">
            <span class="legend-title">Recommendations</span>
            <div class="legend-items">
              <div class="legend-item">
                <span class="legend-dot recommended"></span>
                <span>AI Suggested</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Stats summary -->
        <div class="constellation-stats">
          <div class="stat">
            <span class="stat-value">{currentTopics.length}</span>
            <span class="stat-label">Active Topics</span>
          </div>
          <div class="stat">
            <span class="stat-value">{currentTopics.filter(t => t.status === 'mastered').length}</span>
            <span class="stat-label">Mastered</span>
          </div>
          <div class="stat">
            <span class="stat-value">{recommendedTopics.length}</span>
            <span class="stat-label">Suggested</span>
          </div>
          <div class="stat">
            <span class="stat-value">{Math.round(currentTopics.reduce((a, t) => a + t.mastery, 0) / currentTopics.length * 100)}%</span>
            <span class="stat-label">Avg Mastery</span>
          </div>
        </div>
      </div>

    {:else}
      <!-- Learning Profile View -->
      <div class="profile-container">
        <!-- User info -->
        <div class="user-card">
          <div class="user-avatar">
            <span>{userFacts[0].value.charAt(0)}</span>
          </div>
          <div class="user-info">
            <h2>{userFacts[0].value}</h2>
            <p>{userFacts[1].value}</p>
          </div>
          <div class="user-stats">
            {#each userFacts.slice(2) as fact}
              <div class="user-stat">
                <span class="user-stat-value">{fact.value}</span>
                <span class="user-stat-label">{fact.key}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Radar Chart -->
        <div class="radar-section">
          <h3>Learning Style Profile</h3>
          <p class="radar-subtitle">Your cognitive strengths based on {userFacts[3].value} sessions</p>

          {#if mounted}
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
                style="
                  left: {50 + 42 * Math.cos(angle)}%;
                  top: {50 + 42 * Math.sin(angle)}%;
                "
              >
                <span class="radar-label-name">{item.name}</span>
                <span class="radar-label-value">{Math.round(item.value * 100)}%</span>
              </div>
            {/each}
          </div>
          {/if}
        </div>

        <!-- Learning style breakdown -->
        <div class="styles-breakdown">
          <h3>Style Breakdown</h3>
          <div class="styles-list">
            {#each learningProfile.sort((a, b) => b.value - a.value) as style}
              <div class="style-item">
                <div class="style-header">
                  <span class="style-name">{style.name}</span>
                  <span class="style-value">{Math.round(style.value * 100)}%</span>
                </div>
                <div class="style-bar">
                  <div class="style-fill" style="width: {style.value * 100}%"></div>
                </div>
                <span class="style-desc">{style.description}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </main>
</div>

<!-- Fullscreen Constellation Modal -->
{#if isFullscreen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fullscreen-overlay"
    onmousedown={startDrag}
    onmousemove={onDrag}
    onmouseup={endDrag}
    onmouseleave={endDrag}
    onwheel={handleWheel}
  >
    <div class="fullscreen-header">
      <h2>Knowledge Map</h2>
      <div class="fullscreen-controls">
        <span class="zoom-label">{Math.round(scale * 100)}%</span>
        <button class="control-btn" onclick={() => scale = Math.max(0.8, scale - 0.2)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button class="control-btn" onclick={() => scale = Math.min(3, scale + 0.2)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button class="control-btn" onclick={() => { panX = 0; panY = 0; scale = 1.5; }}>
          Reset
        </button>
        <button class="close-btn" onclick={toggleFullscreen}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="fullscreen-hint">Drag to pan, scroll to zoom</div>

    <div
      class="fullscreen-canvas"
      style="transform: translate({panX}px, {panY}px) scale({scale}); cursor: {isDragging ? 'grabbing' : 'grab'};"
    >
      <svg viewBox="0 0 100 100" class="fullscreen-svg" preserveAspectRatio="xMidYMid meet">
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
                class="connection-line"
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
            <g class="node-group" class:recommended={isRecommended}>
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
                class="node"
                class:mastered={topic.status === 'mastered'}
                class:reviewing={topic.status === 'reviewing'}
              />
            </g>
          {/if}
        {/each}
      </svg>

      <!-- Labels -->
      <div class="fullscreen-labels">
        {#each allTopics as topic}
          {@const pos = positions[topic.id]}
          {@const isRecommended = topic.status === 'recommended'}
          {#if pos}
            <div
              class="node-label"
              class:recommended={isRecommended}
              class:mastered={topic.status === 'mastered'}
              style={getLabelStyle(pos)}
            >
              <span class="label-name">{topic.name}</span>
              {#if !isRecommended}
                <span class="label-mastery">{Math.round(topic.mastery * 100)}%</span>
              {:else}
                <span class="label-suggested">Suggested</span>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .memory-view {
    min-height: 100vh;
    background: #09090b;
    color: #fafafa;
    font-family: 'Satoshi', -apple-system, system-ui, sans-serif;
    overflow-y: auto;
  }

  /* Header */
  .header {
    padding: 48px 40px 32px;
    text-align: center;
  }

  .header h1 {
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.5px;
    margin: 0 0 8px;
  }

  .header p {
    font-size: 14px;
    color: rgba(250, 250, 250, 0.5);
    margin: 0;
  }

  /* Tabs */
  .tabs {
    display: flex;
    justify-content: center;
    gap: 4px;
    padding: 0 40px 32px;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    color: rgba(250, 250, 250, 0.5);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab:hover {
    color: rgba(250, 250, 250, 0.8);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .tab.active {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
    color: #fafafa;
  }

  /* Content */
  .content {
    max-width: 900px;
    margin: 0 auto;
    padding: 0 40px 60px;
  }

  /* ========================== */
  /* Constellation View         */
  /* ========================== */
  .constellation-container {
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  .constellation {
    position: relative;
    aspect-ratio: 16 / 10;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    overflow: hidden;
  }

  .constellation-svg {
    width: 100%;
    height: 100%;
  }

  .connection-line {
    stroke: rgba(255, 255, 255, 0.12);
    stroke-width: 0.5;
  }

  .connection-line.recommended {
    stroke: rgba(255, 255, 255, 0.06);
    stroke-dasharray: 2, 2;
  }

  .node-glow {
    fill: rgba(255, 255, 255, 0.2);
    filter: blur(4px);
  }

  .node {
    fill: rgba(250, 250, 250, 0.7);
  }

  .node.mastered {
    fill: #fafafa;
  }

  .node.reviewing {
    fill: rgba(250, 250, 250, 0.85);
  }

  .node-group.recommended .node {
    fill: none;
    stroke: rgba(255, 255, 255, 0.25);
    stroke-width: 0.5;
    stroke-dasharray: 1.5, 1.5;
  }

  /* Fullscreen button */
  .fullscreen-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 10;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(9, 9, 11, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: all 0.15s ease;
    backdrop-filter: blur(8px);
  }

  .fullscreen-btn:hover {
    background: rgba(9, 9, 11, 0.9);
    color: #fafafa;
    border-color: rgba(255, 255, 255, 0.2);
  }

  /* Labels - Pill Style */
  .labels-overlay,
  .fullscreen-labels {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .node-label {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 5px 8px;
    background: rgba(9, 9, 11, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    white-space: nowrap;
  }

  .label-name {
    font-size: 11px;
    font-weight: 600;
    color: #fafafa;
    white-space: nowrap;
    letter-spacing: -0.2px;
  }

  .label-mastery {
    font-size: 10px;
    color: rgba(250, 250, 250, 0.5);
    font-variant-numeric: tabular-nums;
  }

  .node-label.mastered {
    border-color: rgba(255, 255, 255, 0.2);
  }

  .node-label.mastered .label-mastery {
    color: rgba(250, 250, 250, 0.7);
  }

  .node-label.recommended {
    background: rgba(9, 9, 11, 0.6);
    border-style: dashed;
    border-color: rgba(255, 255, 255, 0.08);
  }

  .node-label.recommended .label-name {
    color: rgba(250, 250, 250, 0.5);
    font-weight: 500;
  }

  .label-suggested {
    font-size: 9px;
    color: rgba(250, 250, 250, 0.35);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Legend */
  .constellation-legend {
    display: flex;
    justify-content: center;
    gap: 48px;
  }

  .legend-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .legend-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: rgba(250, 250, 250, 0.35);
  }

  .legend-items {
    display: flex;
    gap: 16px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: rgba(250, 250, 250, 0.6);
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #fafafa;
  }

  .legend-dot.learning {
    opacity: 0.5;
  }

  .legend-dot.reviewing {
    opacity: 0.75;
  }

  .legend-dot.mastered {
    opacity: 1;
    box-shadow: 0 0 8px rgba(250, 250, 250, 0.3);
  }

  .legend-dot.recommended {
    background: transparent;
    border: 1.5px dashed rgba(255, 255, 255, 0.4);
  }

  /* Stats */
  .constellation-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 20px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
  }

  .stat-value {
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.5px;
  }

  .stat-label {
    font-size: 12px;
    color: rgba(250, 250, 250, 0.45);
  }

  /* ========================== */
  /* Learning Profile View      */
  /* ========================== */
  .profile-container {
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  /* User Card */
  .user-card {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 24px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
  }

  .user-avatar {
    width: 56px;
    height: 56px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 600;
  }

  .user-info {
    flex: 1;
  }

  .user-info h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 4px;
  }

  .user-info p {
    font-size: 13px;
    color: rgba(250, 250, 250, 0.5);
    margin: 0;
  }

  .user-stats {
    display: flex;
    gap: 32px;
  }

  .user-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .user-stat-value {
    font-size: 18px;
    font-weight: 600;
  }

  .user-stat-label {
    font-size: 11px;
    color: rgba(250, 250, 250, 0.4);
  }

  /* Radar Section */
  .radar-section {
    padding: 32px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
  }

  .radar-section h3 {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 6px;
    text-align: center;
  }

  .radar-subtitle {
    font-size: 13px;
    color: rgba(250, 250, 250, 0.45);
    text-align: center;
    margin: 0 0 24px;
  }

  .radar-container {
    position: relative;
    width: 100%;
    max-width: 400px;
    margin: 0 auto;
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
    pointer-events: none;
  }

  .radar-label-name {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: rgba(250, 250, 250, 0.9);
  }

  .radar-label-value {
    font-size: 11px;
    color: rgba(250, 250, 250, 0.45);
  }

  /* Styles Breakdown */
  .styles-breakdown {
    padding: 24px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
  }

  .styles-breakdown h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 20px;
  }

  .styles-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }

  .style-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .style-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .style-name {
    font-size: 13px;
    font-weight: 500;
  }

  .style-value {
    font-size: 13px;
    color: rgba(250, 250, 250, 0.6);
    font-variant-numeric: tabular-nums;
  }

  .style-bar {
    height: 4px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    overflow: hidden;
  }

  .style-fill {
    height: 100%;
    background: #fafafa;
    border-radius: 2px;
    transition: width 0.5s ease;
  }

  .style-desc {
    font-size: 11px;
    color: rgba(250, 250, 250, 0.35);
  }

  /* ========================== */
  /* Fullscreen Overlay         */
  /* ========================== */
  .fullscreen-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: #09090b;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    user-select: none;
  }

  .fullscreen-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    background: rgba(9, 9, 11, 0.95);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    z-index: 10;
  }

  .fullscreen-header h2 {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
  }

  .fullscreen-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .zoom-label {
    font-size: 12px;
    color: rgba(250, 250, 250, 0.5);
    font-variant-numeric: tabular-nums;
    min-width: 48px;
    text-align: right;
    margin-right: 8px;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: rgba(250, 250, 250, 0.7);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .control-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fafafa;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: rgba(250, 250, 250, 0.6);
    cursor: pointer;
    transition: all 0.15s ease;
    margin-left: 8px;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fafafa;
  }

  .fullscreen-hint {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 16px;
    background: rgba(9, 9, 11, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    font-size: 12px;
    color: rgba(250, 250, 250, 0.5);
    pointer-events: none;
    z-index: 10;
  }

  .fullscreen-canvas {
    flex: 1;
    position: relative;
    transform-origin: center center;
    transition: transform 0.05s ease-out;
  }

  .fullscreen-svg {
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
  }

  .fullscreen-labels {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
</style>
