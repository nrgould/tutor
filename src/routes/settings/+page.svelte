<script lang="ts">
  import { settingsStore } from '$lib/stores/settings';
  import {
    exportAllData,
    downloadExportFile,
    readFileAsJson,
    validateImportData,
    importData,
    type ImportStats,
  } from '$lib/utils/dataExport';
  import Button from '$lib/components/shared/Button.svelte';

  const settings = $derived($settingsStore);

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
      input.value = ''; // Reset file input
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
</script>

<div class="h-screen flex flex-col bg-tutor-bg">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-tutor-border bg-tutor-surface">
    <div class="flex items-center gap-2">
      <a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <div class="w-8 h-8 rounded-lg bg-tutor-accent flex items-center justify-center">
          <span class="text-white font-bold text-sm">T</span>
        </div>
        <span class="font-semibold text-tutor-text">Tutor</span>
      </a>
      <span class="text-tutor-text-secondary">/</span>
      <span class="text-tutor-text">Settings</span>
    </div>

    <a
      href="/"
      class="px-3 py-1.5 text-sm rounded-lg bg-tutor-border text-tutor-text hover:bg-tutor-border/80 transition-colors"
    >
      Back to Chat
    </a>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-4">
    <div class="max-w-xl mx-auto space-y-6">
      <!-- API Keys Section -->
      <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
        <h2 class="text-lg font-semibold text-tutor-text mb-4">API Keys</h2>

        <div class="space-y-4">
          <div>
            <label for="anthropic-key" class="block text-sm font-medium text-tutor-text mb-1">
              Anthropic API Key
              {#if settings.anthropic_api_key}
                <span class="text-green-400 text-xs ml-2">✓ Configured</span>
              {/if}
            </label>
            <input
              id="anthropic-key"
              type="password"
              bind:value={anthropicKeyInput}
              placeholder={settings.anthropic_api_key ? '••••••••••••••••' : 'sk-ant-...'}
              class="w-full px-3 py-2 text-sm rounded-lg border border-tutor-border bg-tutor-bg text-tutor-text
                placeholder:text-tutor-text-secondary
                focus:outline-none focus:ring-2 focus:ring-tutor-accent focus:border-transparent"
            />
            <p class="mt-1 text-xs text-tutor-text-secondary">
              Required for tutoring. Get from <a href="https://console.anthropic.com" target="_blank" class="text-tutor-accent hover:underline">console.anthropic.com</a>
            </p>
          </div>

          <div>
            <label for="openai-key" class="block text-sm font-medium text-tutor-text mb-1">
              OpenAI API Key
              {#if settings.openai_api_key}
                <span class="text-green-400 text-xs ml-2">✓ Configured</span>
              {/if}
            </label>
            <input
              id="openai-key"
              type="password"
              bind:value={openaiKeyInput}
              placeholder={settings.openai_api_key ? '••••••••••••••••' : 'sk-...'}
              class="w-full px-3 py-2 text-sm rounded-lg border border-tutor-border bg-tutor-bg text-tutor-text
                placeholder:text-tutor-text-secondary
                focus:outline-none focus:ring-2 focus:ring-tutor-accent focus:border-transparent"
            />
            <p class="mt-1 text-xs text-tutor-text-secondary">
              Enables memory features. Get from <a href="https://platform.openai.com/api-keys" target="_blank" class="text-tutor-accent hover:underline">platform.openai.com</a>
            </p>
          </div>

          <div class="flex items-center gap-3">
            <Button onclick={saveApiKeys}>Save API Keys</Button>
            {#if saveSuccess}
              <span class="text-sm text-green-400">Saved!</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Data Management Section -->
      <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
        <h2 class="text-lg font-semibold text-tutor-text mb-4">Data Management</h2>

        <div class="space-y-4">
          <!-- Export -->
          <div class="p-3 rounded-lg bg-tutor-bg border border-tutor-border">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-medium text-tutor-text">Export Data</h3>
                <p class="text-xs text-tutor-text-secondary mt-0.5">
                  Download all your conversations, topics, memories, and facts
                </p>
              </div>
              <Button variant="secondary" onclick={handleExport} disabled={isExporting}>
                {#if isExporting}
                  <svg class="w-4 h-4 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Exporting...
                {:else}
                  <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export
                {/if}
              </Button>
            </div>
            {#if exportSuccess}
              <p class="mt-2 text-xs text-green-400">Export downloaded successfully!</p>
            {/if}
            {#if exportError}
              <p class="mt-2 text-xs text-red-400">{exportError}</p>
            {/if}
          </div>

          <!-- Import -->
          <div class="p-3 rounded-lg bg-tutor-bg border border-tutor-border">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-medium text-tutor-text">Import Data</h3>
                <p class="text-xs text-tutor-text-secondary mt-0.5">
                  Restore from a backup file
                </p>
              </div>
              <label class="cursor-pointer">
                <input
                  type="file"
                  accept=".json"
                  class="hidden"
                  onchange={handleImport}
                  disabled={isImporting}
                />
                <span class="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-tutor-border text-tutor-text hover:bg-tutor-border/80 transition-colors {isImporting ? 'opacity-50 cursor-not-allowed' : ''}">
                  {#if isImporting}
                    <svg class="w-4 h-4 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Importing...
                  {:else}
                    <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Import
                  {/if}
                </span>
              </label>
            </div>

            {#if importStats}
              <div class="mt-3 p-2 rounded bg-tutor-surface text-xs">
                <p class="text-tutor-text font-medium mb-1">Import Results:</p>
                <ul class="text-tutor-text-secondary space-y-0.5">
                  <li>Conversations: {importStats.conversations}</li>
                  <li>Messages: {importStats.messages}</li>
                  <li>Topics: {importStats.topics}</li>
                  <li>Memories: {importStats.memories}</li>
                  <li>Facts: {importStats.facts}</li>
                </ul>
                {#if importStats.errors.length > 0}
                  <p class="mt-2 text-orange-400">Errors: {importStats.errors.length}</p>
                {/if}
              </div>
            {/if}

            {#if importError}
              <p class="mt-2 text-xs text-red-400">{importError}</p>
            {/if}
          </div>
        </div>
      </div>

      <!-- About Section -->
      <div class="p-4 rounded-xl bg-tutor-surface border border-tutor-border">
        <h2 class="text-lg font-semibold text-tutor-text mb-2">About Tutor</h2>
        <p class="text-sm text-tutor-text-secondary">
          An AI-powered learning companion that understands your screen, remembers your learning journey, and adapts to your needs.
        </p>
        <p class="text-xs text-tutor-text-secondary mt-2">Version 0.1.0</p>
      </div>
    </div>
  </div>
</div>
