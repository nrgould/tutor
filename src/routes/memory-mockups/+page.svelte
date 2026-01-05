<script lang="ts">
  import { onMount } from 'svelte';

  let activeTab = $state<'constellation' | 'profile'>('constellation');

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

  // Calculated positions for constellation (circular layout with center cluster)
  const positions: Record<number, { x: number; y: number }> = {
    // Current topics - inner circle
    1: { x: 50, y: 35 },      // Hegel - top center
    2: { x: 28, y: 50 },      // Phenomenology - left
    3: { x: 72, y: 50 },      // Kant - right
    4: { x: 28, y: 72 },      // Existentialism - bottom left
    5: { x: 50, y: 58 },      // Logic - center
    6: { x: 72, y: 72 },      // Ethics - bottom right
    // Recommended - outer ring (dimmer)
    101: { x: 85, y: 35 },    // Metaphysics
    102: { x: 15, y: 35 },    // Philosophy of Mind
    103: { x: 50, y: 88 },    // Nietzsche
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

  function getNodeSize(mastery: number, isRecommended: boolean): number {
    if (isRecommended) return 8;
    return 12 + mastery * 16;
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
                  <!-- Glow effect -->
                  {#if !isRecommended}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={size + 4}
                      class="node-glow"
                      style="opacity: {0.15 + topic.mastery * 0.2}"
                    />
                  {/if}
                  <!-- Main node -->
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={size / 2}
                    class="node"
                    class:mastered={topic.status === 'mastered'}
                    class:reviewing={topic.status === 'reviewing'}
                    style="opacity: {isRecommended ? 0.4 : 0.6 + topic.mastery * 0.4}"
                  />
                  <!-- Inner dot for mastered -->
                  {#if topic.status === 'mastered'}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={size / 6}
                      class="node-inner"
                    />
                  {/if}
                </g>
              {/if}
            {/each}
          </svg>

          <!-- Labels overlay -->
          <div class="labels-overlay">
            {#each allTopics as topic}
              {@const pos = positions[topic.id]}
              {@const isRecommended = topic.status === 'recommended'}
              {#if pos}
                <div
                  class="node-label"
                  class:recommended={isRecommended}
                  style="left: {pos.x}%; top: {pos.y}%;"
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
    fill: rgba(255, 255, 255, 0.15);
    filter: blur(3px);
  }

  .node {
    fill: #fafafa;
  }

  .node.mastered {
    fill: #fafafa;
  }

  .node-inner {
    fill: #09090b;
  }

  .node-group.recommended .node {
    fill: none;
    stroke: rgba(255, 255, 255, 0.3);
    stroke-width: 1;
    stroke-dasharray: 2, 2;
  }

  /* Labels */
  .labels-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .node-label {
    position: absolute;
    transform: translate(16px, -50%);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .label-name {
    font-size: 12px;
    font-weight: 500;
    color: rgba(250, 250, 250, 0.9);
    white-space: nowrap;
  }

  .label-mastery {
    font-size: 11px;
    color: rgba(250, 250, 250, 0.5);
    font-variant-numeric: tabular-nums;
  }

  .node-label.recommended .label-name {
    color: rgba(250, 250, 250, 0.4);
  }

  .label-suggested {
    font-size: 10px;
    color: rgba(250, 250, 250, 0.3);
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
</style>
