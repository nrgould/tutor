<script lang="ts">
  // Sample data for mockups
  const facts = [
    { key: 'Name', value: 'Sean' },
    { key: 'Major', value: 'Philosophy' },
    { key: 'University', value: 'Stanford' },
    { key: 'Learning Style', value: 'Visual' },
    { key: 'Goal', value: 'Graduate Studies' },
  ];

  const topics = [
    { name: 'Hegel\'s Dialectics', mastery: 0.72, status: 'learning', lastPracticed: '2h ago' },
    { name: 'Phenomenology', mastery: 0.45, status: 'learning', lastPracticed: '1d ago' },
    { name: 'Kant\'s Critique', mastery: 0.88, status: 'reviewing', lastPracticed: '3d ago' },
    { name: 'Existentialism', mastery: 0.95, status: 'mastered', lastPracticed: '1w ago' },
    { name: 'Logic & Reasoning', mastery: 0.60, status: 'learning', lastPracticed: '5h ago' },
    { name: 'Ethics', mastery: 0.33, status: 'learning', lastPracticed: '2d ago' },
  ];

  const memories = [
    { content: 'Struggled with the master-slave dialectic concept', topic: 'Hegel\'s Dialectics', time: '2h ago' },
    { content: 'Prefers concrete examples over abstract theory', topic: 'General', time: '1d ago' },
    { content: 'Made connection between Kant and modern AI ethics', topic: 'Kant\'s Critique', time: '3d ago' },
    { content: 'Interested in applying philosophy to technology', topic: 'General', time: '5d ago' },
  ];

  // For constellation animation
  const nodes = topics.map((t, i) => ({
    ...t,
    x: 50 + Math.cos(i * Math.PI / 3) * 30 + Math.random() * 10,
    y: 50 + Math.sin(i * Math.PI / 3) * 30 + Math.random() * 10,
  }));
</script>

<div class="mockups">
  <header class="page-header">
    <h1>Memory Visualization Concepts</h1>
    <p>5 approaches to visualizing what Eigen knows about you</p>
  </header>

  <!-- Concept 1: Knowledge Profile -->
  <section class="concept">
    <div class="concept-header">
      <span class="concept-number">01</span>
      <h2>Knowledge Profile</h2>
      <p>Clean, minimal cards with progress rings</p>
    </div>

    <div class="mockup profile-mockup">
      <div class="profile-section">
        <h3>About You</h3>
        <div class="fact-chips">
          {#each facts as fact}
            <div class="fact-chip">
              <span class="fact-key">{fact.key}</span>
              <span class="fact-value">{fact.value}</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="profile-section">
        <h3>Topics</h3>
        <div class="topic-rings">
          {#each topics.slice(0, 4) as topic}
            <div class="topic-ring-card">
              <div class="ring" style="--progress: {topic.mastery}">
                <svg viewBox="0 0 36 36">
                  <path class="ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path class="ring-fill" stroke-dasharray="{topic.mastery * 100}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <span class="ring-value">{Math.round(topic.mastery * 100)}</span>
              </div>
              <span class="topic-name">{topic.name}</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="profile-section">
        <h3>Recent Memories</h3>
        <div class="memory-list">
          {#each memories.slice(0, 3) as memory}
            <div class="memory-item">
              <p>{memory.content}</p>
              <span class="memory-meta">{memory.topic} · {memory.time}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <!-- Concept 2: Learning Constellation -->
  <section class="concept">
    <div class="concept-header">
      <span class="concept-number">02</span>
      <h2>Learning Constellation</h2>
      <p>Abstract network graph with glowing nodes</p>
    </div>

    <div class="mockup constellation-mockup">
      <div class="constellation">
        <svg viewBox="0 0 100 100" class="constellation-svg">
          <!-- Connection lines -->
          {#each nodes as node, i}
            {#each nodes.slice(i + 1) as other}
              <line
                x1={node.x} y1={node.y}
                x2={other.x} y2={other.y}
                class="constellation-line"
                style="opacity: {0.1 + Math.random() * 0.2}"
              />
            {/each}
          {/each}

          <!-- Nodes -->
          {#each nodes as node}
            <g class="constellation-node">
              <circle
                cx={node.x} cy={node.y}
                r={3 + node.mastery * 4}
                class="node-glow"
              />
              <circle
                cx={node.x} cy={node.y}
                r={2 + node.mastery * 3}
                class="node-core"
                style="opacity: {0.5 + node.mastery * 0.5}"
              />
            </g>
          {/each}
        </svg>

        <div class="constellation-labels">
          {#each nodes as node}
            <div
              class="constellation-label"
              style="left: {node.x}%; top: {node.y}%"
            >
              <span class="label-name">{node.name}</span>
              <span class="label-mastery">{Math.round(node.mastery * 100)}%</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="constellation-legend">
        <div class="legend-item">
          <span class="legend-dot small"></span>
          <span>Learning</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot medium"></span>
          <span>Reviewing</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot large"></span>
          <span>Mastered</span>
        </div>
      </div>
    </div>
  </section>

  <!-- Concept 3: Topic Mastery Grid -->
  <section class="concept">
    <div class="concept-header">
      <span class="concept-number">03</span>
      <h2>Topic Mastery Grid</h2>
      <p>Bento-box style cards with progress bars</p>
    </div>

    <div class="mockup grid-mockup">
      <div class="bento-grid">
        {#each topics as topic, i}
          <div class="bento-card" class:large={i === 0} class:tall={i === 3}>
            <div class="bento-header">
              <span class="bento-status" class:mastered={topic.status === 'mastered'} class:reviewing={topic.status === 'reviewing'}>
                {topic.status}
              </span>
              <span class="bento-time">{topic.lastPracticed}</span>
            </div>
            <h4 class="bento-title">{topic.name}</h4>
            <div class="bento-progress">
              <div class="progress-bar">
                <div class="progress-fill" style="width: {topic.mastery * 100}%"></div>
              </div>
              <span class="progress-value">{Math.round(topic.mastery * 100)}%</span>
            </div>
            {#if i === 0}
              <div class="bento-memories">
                <p class="bento-memory">"Struggled with master-slave dialectic"</p>
                <p class="bento-memory">"Connected to modern power structures"</p>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Concept 4: Timeline Journey -->
  <section class="concept">
    <div class="concept-header">
      <span class="concept-number">04</span>
      <h2>Timeline Journey</h2>
      <p>Vertical learning timeline with milestones</p>
    </div>

    <div class="mockup timeline-mockup">
      <div class="timeline">
        <div class="timeline-line"></div>

        <div class="timeline-item">
          <div class="timeline-dot current"></div>
          <div class="timeline-content">
            <span class="timeline-date">Today</span>
            <h4>Hegel's Dialectics</h4>
            <p>Working on master-slave dialectic</p>
            <div class="timeline-progress">
              <div class="progress-mini" style="width: 72%"></div>
            </div>
          </div>
        </div>

        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <span class="timeline-date">Yesterday</span>
            <h4>Phenomenology</h4>
            <p>Introduction to Husserl</p>
            <div class="timeline-progress">
              <div class="progress-mini" style="width: 45%"></div>
            </div>
          </div>
        </div>

        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <span class="timeline-date">3 days ago</span>
            <h4>Kant's Critique</h4>
            <p>Completed categorical imperative</p>
            <div class="timeline-progress">
              <div class="progress-mini" style="width: 88%"></div>
            </div>
          </div>
        </div>

        <div class="timeline-item milestone">
          <div class="timeline-dot mastered"></div>
          <div class="timeline-content">
            <span class="timeline-date">1 week ago</span>
            <h4>Existentialism</h4>
            <span class="milestone-badge">Mastered</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Concept 5: Radar Chart -->
  <section class="concept">
    <div class="concept-header">
      <span class="concept-number">05</span>
      <h2>Radar Chart</h2>
      <p>Geometric spider chart visualization</p>
    </div>

    <div class="mockup radar-mockup">
      <div class="radar-container">
        <svg viewBox="0 0 200 200" class="radar-svg">
          <!-- Background rings -->
          {#each [0.25, 0.5, 0.75, 1] as ring}
            <polygon
              class="radar-ring"
              points={topics.map((_, i) => {
                const angle = (i * 2 * Math.PI / topics.length) - Math.PI / 2;
                const r = 80 * ring;
                return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
              }).join(' ')}
            />
          {/each}

          <!-- Axes -->
          {#each topics as _, i}
            <line
              class="radar-axis"
              x1="100" y1="100"
              x2={100 + 80 * Math.cos((i * 2 * Math.PI / topics.length) - Math.PI / 2)}
              y2={100 + 80 * Math.sin((i * 2 * Math.PI / topics.length) - Math.PI / 2)}
            />
          {/each}

          <!-- Data polygon -->
          <polygon
            class="radar-data"
            points={topics.map((topic, i) => {
              const angle = (i * 2 * Math.PI / topics.length) - Math.PI / 2;
              const r = 80 * topic.mastery;
              return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
            }).join(' ')}
          />

          <!-- Data points -->
          {#each topics as topic, i}
            {@const angle = (i * 2 * Math.PI / topics.length) - Math.PI / 2}
            {@const r = 80 * topic.mastery}
            <circle
              class="radar-point"
              cx={100 + r * Math.cos(angle)}
              cy={100 + r * Math.sin(angle)}
              r="4"
            />
          {/each}
        </svg>

        <!-- Labels -->
        <div class="radar-labels">
          {#each topics as topic, i}
            {@const angle = (i * 2 * Math.PI / topics.length) - Math.PI / 2}
            <div
              class="radar-label"
              style="
                left: {50 + 45 * Math.cos(angle)}%;
                top: {50 + 45 * Math.sin(angle)}%;
              "
            >
              <span class="radar-label-name">{topic.name}</span>
              <span class="radar-label-value">{Math.round(topic.mastery * 100)}%</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </section>
</div>

<style>
  .mockups {
    min-height: 100vh;
    background: #09090b;
    color: #fafafa;
    font-family: 'Satoshi', -apple-system, system-ui, sans-serif;
    padding: 60px 40px;
    overflow-y: auto;
  }

  .page-header {
    text-align: center;
    margin-bottom: 80px;
  }

  .page-header h1 {
    font-size: 36px;
    font-weight: 600;
    letter-spacing: -0.5px;
    margin: 0 0 12px;
  }

  .page-header p {
    font-size: 15px;
    color: rgba(250, 250, 250, 0.5);
    margin: 0;
  }

  /* Concept Section */
  .concept {
    max-width: 900px;
    margin: 0 auto 100px;
  }

  .concept-header {
    margin-bottom: 32px;
  }

  .concept-number {
    font-size: 12px;
    font-weight: 600;
    color: rgba(250, 250, 250, 0.3);
    letter-spacing: 0.5px;
    display: block;
    margin-bottom: 8px;
  }

  .concept-header h2 {
    font-size: 24px;
    font-weight: 600;
    margin: 0 0 8px;
    letter-spacing: -0.3px;
  }

  .concept-header p {
    font-size: 14px;
    color: rgba(250, 250, 250, 0.5);
    margin: 0;
  }

  /* Mockup Container */
  .mockup {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    padding: 32px;
  }

  /* ==================== */
  /* Concept 1: Profile   */
  /* ==================== */
  .profile-section {
    margin-bottom: 32px;
  }

  .profile-section:last-child {
    margin-bottom: 0;
  }

  .profile-section h3 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: rgba(250, 250, 250, 0.4);
    margin: 0 0 16px;
  }

  .fact-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .fact-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 20px;
    font-size: 13px;
  }

  .fact-key {
    color: rgba(250, 250, 250, 0.5);
  }

  .fact-value {
    color: #fafafa;
    font-weight: 500;
  }

  .topic-rings {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
  }

  .topic-ring-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .ring {
    width: 72px;
    height: 72px;
    position: relative;
  }

  .ring svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .ring-bg {
    fill: none;
    stroke: rgba(255, 255, 255, 0.06);
    stroke-width: 3;
  }

  .ring-fill {
    fill: none;
    stroke: #fafafa;
    stroke-width: 3;
    stroke-linecap: round;
    transition: stroke-dasharray 0.5s ease;
  }

  .ring-value {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 16px;
    font-weight: 600;
  }

  .topic-name {
    font-size: 12px;
    color: rgba(250, 250, 250, 0.7);
    text-align: center;
    max-width: 100px;
  }

  .memory-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .memory-item {
    padding: 14px 16px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 10px;
  }

  .memory-item p {
    margin: 0 0 6px;
    font-size: 14px;
    color: rgba(250, 250, 250, 0.9);
  }

  .memory-meta {
    font-size: 12px;
    color: rgba(250, 250, 250, 0.4);
  }

  /* ======================== */
  /* Concept 2: Constellation */
  /* ======================== */
  .constellation-mockup {
    padding: 40px;
  }

  .constellation {
    position: relative;
    height: 400px;
  }

  .constellation-svg {
    width: 100%;
    height: 100%;
  }

  .constellation-line {
    stroke: rgba(255, 255, 255, 0.1);
    stroke-width: 0.5;
  }

  .node-glow {
    fill: rgba(255, 255, 255, 0.1);
    filter: blur(4px);
  }

  .node-core {
    fill: #fafafa;
  }

  .constellation-labels {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  }

  .constellation-label {
    position: absolute;
    transform: translate(20px, -50%);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .label-name {
    font-size: 12px;
    font-weight: 500;
    color: rgba(250, 250, 250, 0.8);
    white-space: nowrap;
  }

  .label-mastery {
    font-size: 11px;
    color: rgba(250, 250, 250, 0.4);
  }

  .constellation-legend {
    display: flex;
    justify-content: center;
    gap: 24px;
    margin-top: 24px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: rgba(250, 250, 250, 0.5);
  }

  .legend-dot {
    border-radius: 50%;
    background: #fafafa;
  }

  .legend-dot.small { width: 6px; height: 6px; opacity: 0.5; }
  .legend-dot.medium { width: 8px; height: 8px; opacity: 0.7; }
  .legend-dot.large { width: 10px; height: 10px; opacity: 1; }

  /* ================== */
  /* Concept 3: Grid    */
  /* ================== */
  .bento-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: minmax(140px, auto);
    gap: 16px;
  }

  .bento-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 20px;
    display: flex;
    flex-direction: column;
  }

  .bento-card.large {
    grid-column: span 2;
    grid-row: span 2;
  }

  .bento-card.tall {
    grid-row: span 2;
  }

  .bento-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .bento-status {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 4px;
    color: rgba(250, 250, 250, 0.6);
  }

  .bento-status.mastered {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
  }

  .bento-status.reviewing {
    background: rgba(250, 250, 250, 0.1);
    color: rgba(250, 250, 250, 0.8);
  }

  .bento-time {
    font-size: 11px;
    color: rgba(250, 250, 250, 0.35);
  }

  .bento-title {
    font-size: 15px;
    font-weight: 500;
    margin: 0 0 auto;
    color: #fafafa;
  }

  .bento-progress {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
  }

  .progress-bar {
    flex: 1;
    height: 4px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #fafafa;
    border-radius: 2px;
    transition: width 0.5s ease;
  }

  .progress-value {
    font-size: 13px;
    font-weight: 500;
    color: rgba(250, 250, 250, 0.7);
    min-width: 36px;
    text-align: right;
  }

  .bento-memories {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .bento-memory {
    font-size: 12px;
    color: rgba(250, 250, 250, 0.5);
    margin: 0 0 8px;
    font-style: italic;
  }

  /* ==================== */
  /* Concept 4: Timeline  */
  /* ==================== */
  .timeline-mockup {
    padding: 40px 60px;
  }

  .timeline {
    position: relative;
    padding-left: 32px;
  }

  .timeline-line {
    position: absolute;
    left: 6px;
    top: 8px;
    bottom: 8px;
    width: 1px;
    background: linear-gradient(to bottom, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.05));
  }

  .timeline-item {
    position: relative;
    padding-bottom: 32px;
  }

  .timeline-item:last-child {
    padding-bottom: 0;
  }

  .timeline-dot {
    position: absolute;
    left: -32px;
    top: 4px;
    width: 13px;
    height: 13px;
    background: #09090b;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
  }

  .timeline-dot.current {
    border-color: #fafafa;
    background: #fafafa;
  }

  .timeline-dot.mastered {
    border-color: #22c55e;
    background: #22c55e;
  }

  .timeline-content {
    background: rgba(255, 255, 255, 0.03);
    border-radius: 10px;
    padding: 16px 20px;
  }

  .timeline-date {
    font-size: 11px;
    color: rgba(250, 250, 250, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .timeline-content h4 {
    font-size: 15px;
    font-weight: 500;
    margin: 6px 0 4px;
  }

  .timeline-content p {
    font-size: 13px;
    color: rgba(250, 250, 250, 0.6);
    margin: 0 0 12px;
  }

  .timeline-progress {
    height: 3px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-mini {
    height: 100%;
    background: #fafafa;
    border-radius: 2px;
  }

  .milestone .timeline-content {
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.15);
  }

  .milestone-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    color: #22c55e;
    background: rgba(34, 197, 94, 0.15);
    padding: 4px 10px;
    border-radius: 4px;
    margin-top: 4px;
  }

  /* ================== */
  /* Concept 5: Radar   */
  /* ================== */
  .radar-mockup {
    padding: 40px;
  }

  .radar-container {
    position: relative;
    width: 100%;
    max-width: 500px;
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
    fill: rgba(250, 250, 250, 0.1);
    stroke: #fafafa;
    stroke-width: 2;
  }

  .radar-point {
    fill: #fafafa;
  }

  .radar-labels {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  }

  .radar-label {
    position: absolute;
    transform: translate(-50%, -50%);
    text-align: center;
  }

  .radar-label-name {
    display: block;
    font-size: 11px;
    font-weight: 500;
    color: rgba(250, 250, 250, 0.8);
    white-space: nowrap;
  }

  .radar-label-value {
    font-size: 10px;
    color: rgba(250, 250, 250, 0.4);
  }
</style>
