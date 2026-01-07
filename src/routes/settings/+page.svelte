<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { settingsStore } from '$lib/stores/settings';
  import { MODEL_OPTIONS, type ModelId } from '$lib/types';
  import {
    exportAllData,
    downloadExportFile,
    readFileAsJson,
    validateImportData,
    importData,
    type ImportStats,
  } from '$lib/utils/dataExport';

  const settings = $derived($settingsStore);

  // Model settings
  async function handleModelChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    await settingsStore.save('model', target.value);
  }

  async function handleThinkingToggle() {
    await settingsStore.save('extended_thinking', (!settings.extended_thinking).toString());
  }

  async function handleThinkingBudgetChange(e: Event) {
    const target = e.target as HTMLInputElement;
    await settingsStore.save('thinking_budget', target.value);
  }

  // Export state
  let isExporting = $state(false);
  let exportError = $state('');
  let exportSuccess = $state(false);

  // Import state
  let isImporting = $state(false);
  let importError = $state('');
  let importStats = $state<ImportStats | null>(null);

  // API key inputs
  let anthropicKeyInput = $state('');
  let openaiKeyInput = $state('');
  let saveSuccess = $state(false);

  onMount(async () => {
    await settingsStore.load();
  });

  async function handleExport() {
    isExporting = true;
    exportError = '';
    exportSuccess = false;

    try {
      const data = await exportAllData();
      downloadExportFile(data);
      exportSuccess = true;
      setTimeout(() => (exportSuccess = false), 3000);
    } catch (e) {
      exportError = e instanceof Error ? e.message : 'Export failed';
    } finally {
      isExporting = false;
    }
  }

  async function handleImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    isImporting = true;
    importError = '';
    importStats = null;

    try {
      const data = await readFileAsJson(file);

      if (!validateImportData(data)) {
        throw new Error('Invalid backup file format');
      }

      const result = await importData(data);
      importStats = result.stats;

      if (!result.success) {
        importError = `Import completed with ${result.stats.errors.length} errors`;
      }
    } catch (e) {
      importError = e instanceof Error ? e.message : 'Import failed';
    } finally {
      isImporting = false;
      input.value = '';
    }
  }

  async function saveApiKeys() {
    try {
      if (anthropicKeyInput.trim()) {
        await settingsStore.setApiKey('anthropic_api_key', anthropicKeyInput.trim());
        anthropicKeyInput = '';
      }
      if (openaiKeyInput.trim()) {
        await settingsStore.setApiKey('openai_api_key', openaiKeyInput.trim());
        openaiKeyInput = '';
      }
      saveSuccess = true;
      setTimeout(() => (saveSuccess = false), 3000);
    } catch (e) {
      console.error('Failed to save API keys:', e);
    }
  }

  async function startDrag(e: MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('a')) return;

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
</script>

<div class="settings-window">
  <!-- Titlebar -->
  <div class="titlebar" onmousedown={startDrag} role="toolbar" aria-label="Window controls" tabindex="0">
    <div class="titlebar-left">
      <button class="close-btn" onclick={closeWindow} title="Close" aria-label="Close"></button>
    </div>
    <div class="titlebar-center">
      <h1>Settings</h1>
    </div>
    <div class="titlebar-right"></div>
  </div>

  <!-- Content -->
  <div class="content">
    <!-- API Keys -->
    <section class="section">
      <div class="section-header">
        <div class="section-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
          </svg>
        </div>
        <div>
          <h2>API Keys</h2>
          <p>Configure your API access for AI features</p>
        </div>
      </div>

      <div class="field">
        <label for="anthropic-key">
          Anthropic API Key
          {#if settings.anthropic_api_key}
            <span class="badge success">Configured</span>
          {/if}
        </label>
        <input
          id="anthropic-key"
          type="password"
          bind:value={anthropicKeyInput}
          placeholder={settings.anthropic_api_key ? '••••••••••••••••' : 'sk-ant-...'}
        />
        <span class="hint">
          Required for tutoring. Get from <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>
        </span>
      </div>

      <div class="field">
        <label for="openai-key">
          OpenAI API Key
          {#if settings.openai_api_key}
            <span class="badge success">Configured</span>
          {/if}
        </label>
        <input
          id="openai-key"
          type="password"
          bind:value={openaiKeyInput}
          placeholder={settings.openai_api_key ? '••••••••••••••••' : 'sk-...'}
        />
        <span class="hint">
          Enables memory features. Get from <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>
        </span>
      </div>

      <div class="actions">
        <button class="btn primary" onclick={saveApiKeys}>Save API Keys</button>
        {#if saveSuccess}
          <span class="success-text">Saved!</span>
        {/if}
      </div>
    </section>

    <!-- AI Model -->
    <section class="section">
      <div class="section-header">
        <div class="section-icon model">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
        </div>
        <div>
          <h2>AI Model</h2>
          <p>Choose your AI model and reasoning settings</p>
        </div>
      </div>

      <div class="field">
        <label for="model-select">Model</label>
        <select id="model-select" value={settings.model} onchange={handleModelChange}>
          {#each MODEL_OPTIONS as option}
            <option value={option.id}>{option.name} - {option.description}</option>
          {/each}
        </select>
        <span class="hint">
          Opus 4.5 is the most capable but slower. Sonnet 4.5 is a good balance of capability and speed.
        </span>
      </div>

      <div class="toggle-row">
        <div class="toggle-info">
          <h3>Extended Thinking</h3>
          <p>Enable deep reasoning for complex questions</p>
        </div>
        <button
          class="toggle {settings.extended_thinking ? 'active' : ''}"
          onclick={handleThinkingToggle}
          aria-label="Toggle extended thinking"
        >
          <span class="toggle-slider"></span>
        </button>
      </div>

      {#if settings.extended_thinking}
        <div class="field">
          <label for="thinking-budget">Thinking Budget (tokens)</label>
          <input
            id="thinking-budget"
            type="number"
            min="1000"
            max="50000"
            step="1000"
            value={settings.thinking_budget}
            onchange={handleThinkingBudgetChange}
          />
          <span class="hint">
            More tokens = deeper reasoning. Recommended: 10000 for most tasks, 30000+ for complex problems.
          </span>
        </div>
      {/if}
    </section>

    <!-- Data Management -->
    <section class="section">
      <div class="section-header">
        <div class="section-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
          </svg>
        </div>
        <div>
          <h2>Data Management</h2>
          <p>Export or import your learning data</p>
        </div>
      </div>

      <div class="data-row">
        <div class="data-info">
          <h3>Export Data</h3>
          <p>Download all conversations and memories</p>
        </div>
        <button class="btn secondary" onclick={handleExport} disabled={isExporting}>
          {#if isExporting}
            Exporting...
          {:else}
            Export
          {/if}
        </button>
      </div>
      {#if exportSuccess}
        <p class="feedback success">Export downloaded!</p>
      {/if}
      {#if exportError}
        <p class="feedback error">{exportError}</p>
      {/if}

      <div class="data-row">
        <div class="data-info">
          <h3>Import Data</h3>
          <p>Restore from a backup file</p>
        </div>
        <label class="btn secondary {isImporting ? 'disabled' : ''}">
          <input
            type="file"
            accept=".json"
            onchange={handleImport}
            disabled={isImporting}
            hidden
          />
          {#if isImporting}
            Importing...
          {:else}
            Import
          {/if}
        </label>
      </div>
      {#if importStats}
        <div class="import-results">
          <p class="results-title">Import Results</p>
          <div class="results-grid">
            <span>Conversations: {importStats.conversations}</span>
            <span>Messages: {importStats.messages}</span>
            <span>Memories: {importStats.memories}</span>
            <span>Facts: {importStats.facts}</span>
          </div>
        </div>
      {/if}
      {#if importError}
        <p class="feedback error">{importError}</p>
      {/if}
    </section>

    <!-- About -->
    <section class="section about">
      <div class="about-content">
        <div class="about-logo">E</div>
        <div>
          <h2>Eigen</h2>
          <p>Version 0.1.0</p>
        </div>
      </div>
      <p class="about-description">
        AI-powered learning companion that watches your screen and adapts to your needs.
      </p>
    </section>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
  }

  .settings-window {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: rgba(28, 28, 30, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    overflow: hidden;
  }

  /* Titlebar */
  .titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    cursor: grab;
  }

  .titlebar:active {
    cursor: grabbing;
  }

  .titlebar-left,
  .titlebar-right {
    width: 60px;
  }

  .titlebar-center h1 {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    margin: 0;
  }

  .close-btn {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: none;
    background: #ff5f57;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .close-btn:hover {
    opacity: 0.8;
  }

  /* Content */
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Sections */
  .section {
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .section-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 132, 255, 0.15);
    border-radius: 10px;
    color: #0a84ff;
  }

  .section-icon svg {
    width: 18px;
    height: 18px;
  }

  .section-header h2 {
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    margin: 0;
  }

  .section-header p {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    margin: 2px 0 0 0;
  }

  /* Fields */
  .field {
    margin-bottom: 14px;
  }

  .field label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 6px;
  }

  .badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .badge.success {
    background: rgba(48, 209, 88, 0.15);
    color: #30d158;
  }

  .field input {
    width: 100%;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: white;
    font-size: 13px;
    outline: none;
    transition: all 0.15s;
    box-sizing: border-box;
  }

  .field input::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .field input:focus {
    border-color: rgba(10, 132, 255, 0.5);
    box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.1);
  }

  .hint {
    display: block;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    margin-top: 6px;
  }

  .hint a {
    color: #0a84ff;
    text-decoration: none;
  }

  .hint a:hover {
    text-decoration: underline;
  }

  /* Actions */
  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 4px;
  }

  .btn {
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn.primary {
    background: #0a84ff;
    color: white;
  }

  .btn.primary:hover {
    background: #409cff;
  }

  .btn.secondary {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
  }

  .btn.secondary:hover {
    background: rgba(255, 255, 255, 0.12);
    color: white;
  }

  .btn.disabled,
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .success-text {
    font-size: 12px;
    font-weight: 500;
    color: #30d158;
  }

  /* Data rows */
  .data-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .data-info h3 {
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    margin: 0;
  }

  .data-info p {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    margin: 2px 0 0 0;
  }

  .feedback {
    font-size: 11px;
    font-weight: 500;
    margin: 4px 0 0 0;
    padding-left: 12px;
  }

  .feedback.success {
    color: #30d158;
  }

  .feedback.error {
    color: #ff453a;
  }

  .import-results {
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    margin-top: 8px;
  }

  .results-title {
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
    margin: 0 0 8px 0;
  }

  .results-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
  }

  /* About */
  .about {
    text-align: center;
    padding: 20px;
  }

  .about-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .about-logo {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0a84ff;
    border-radius: 10px;
    color: white;
    font-weight: 700;
    font-size: 18px;
  }

  .about h2 {
    font-size: 16px;
    font-weight: 600;
    color: white;
    margin: 0;
    text-align: left;
  }

  .about-content p {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    margin: 2px 0 0 0;
    text-align: left;
  }

  .about-description {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    line-height: 1.5;
    margin: 0;
  }

  /* Model section icon */
  .section-icon.model {
    background: rgba(147, 112, 219, 0.15);
    color: #9370db;
  }

  /* Select dropdown */
  .field select {
    width: 100%;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: white;
    font-size: 13px;
    outline: none;
    transition: all 0.15s;
    box-sizing: border-box;
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 36px;
  }

  .field select:focus {
    border-color: rgba(10, 132, 255, 0.5);
    box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.1);
  }

  .field select option {
    background: #1c1c1e;
    color: white;
    padding: 8px;
  }

  /* Toggle row */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    margin-bottom: 14px;
  }

  .toggle-info h3 {
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    margin: 0;
  }

  .toggle-info p {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    margin: 2px 0 0 0;
  }

  /* Toggle switch */
  .toggle {
    position: relative;
    width: 44px;
    height: 24px;
    background: rgba(255, 255, 255, 0.15);
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
    padding: 0;
  }

  .toggle:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .toggle.active {
    background: #9370db;
  }

  .toggle-slider {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .toggle.active .toggle-slider {
    transform: translateX(20px);
  }
</style>
