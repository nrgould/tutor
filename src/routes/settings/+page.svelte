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

<div class="min-h-screen bg-[var(--gray-1)]">
  <!-- Gradient background -->
  <div class="fixed inset-0 overflow-hidden pointer-events-none">
    <div class="absolute -top-[40%] -left-[20%] w-[70%] h-[70%] rounded-full bg-[var(--accent-9)] opacity-[0.03] blur-[100px]"></div>
  </div>

  <!-- Header -->
  <header class="relative z-10 border-b border-[var(--gray-3)] bg-[var(--gray-1)]/80 backdrop-blur-xl">
    <div class="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <a href="/" class="flex items-center gap-3 group">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent-8)] to-[var(--accent-9)] flex items-center justify-center shadow-lg shadow-[var(--accent-9)]/20">
            <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
            </svg>
          </div>
          <span class="font-semibold text-[var(--gray-12)] group-hover:text-[var(--accent-11)] transition-colors">Tutor</span>
        </a>
        <span class="text-[var(--gray-7)]">/</span>
        <span class="text-[var(--gray-11)]">Settings</span>
      </div>

      <a
        href="/"
        class="px-4 py-2 text-sm font-medium rounded-xl bg-[var(--gray-3)] border border-[var(--gray-4)] text-[var(--gray-11)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
      >
        Back to Chat
      </a>
    </div>
  </header>

  <!-- Content -->
  <main class="relative z-10 max-w-3xl mx-auto px-6 py-8">
    <div class="space-y-6">
      <!-- API Keys Section -->
      <div class="p-6 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-xl bg-[var(--accent-9)]/15 flex items-center justify-center">
            <svg class="w-5 h-5 text-[var(--accent-11)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-[var(--gray-12)]">API Keys</h2>
            <p class="text-sm text-[var(--gray-9)]">Configure your API access for AI features</p>
          </div>
        </div>

        <div class="space-y-5">
          <div>
            <label for="anthropic-key" class="block text-sm font-medium text-[var(--gray-12)] mb-2">
              Anthropic API Key
              {#if settings.anthropic_api_key}
                <span class="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-[var(--success)]/15 text-[var(--success)] text-xs font-medium">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Configured
                </span>
              {/if}
            </label>
            <input
              id="anthropic-key"
              type="password"
              bind:value={anthropicKeyInput}
              placeholder={settings.anthropic_api_key ? '••••••••••••••••' : 'sk-ant-...'}
              class="w-full px-4 py-3 text-sm rounded-xl border border-[var(--gray-4)] bg-[var(--gray-3)] text-[var(--gray-12)]
                placeholder:text-[var(--gray-8)]
                focus:outline-none focus:border-[var(--accent-7)] focus:ring-1 focus:ring-[var(--accent-8)]/30 transition-colors"
            />
            <p class="mt-2 text-xs text-[var(--gray-9)]">
              Required for tutoring. Get from <a href="https://console.anthropic.com" target="_blank" class="text-[var(--accent-11)] hover:text-[var(--accent-12)]">console.anthropic.com</a>
            </p>
          </div>

          <div>
            <label for="openai-key" class="block text-sm font-medium text-[var(--gray-12)] mb-2">
              OpenAI API Key
              {#if settings.openai_api_key}
                <span class="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-[var(--success)]/15 text-[var(--success)] text-xs font-medium">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Configured
                </span>
              {/if}
            </label>
            <input
              id="openai-key"
              type="password"
              bind:value={openaiKeyInput}
              placeholder={settings.openai_api_key ? '••••••••••••••••' : 'sk-...'}
              class="w-full px-4 py-3 text-sm rounded-xl border border-[var(--gray-4)] bg-[var(--gray-3)] text-[var(--gray-12)]
                placeholder:text-[var(--gray-8)]
                focus:outline-none focus:border-[var(--accent-7)] focus:ring-1 focus:ring-[var(--accent-8)]/30 transition-colors"
            />
            <p class="mt-2 text-xs text-[var(--gray-9)]">
              Enables memory features. Get from <a href="https://platform.openai.com/api-keys" target="_blank" class="text-[var(--accent-11)] hover:text-[var(--accent-12)]">platform.openai.com</a>
            </p>
          </div>

          <div class="flex items-center gap-3 pt-2">
            <button
              onclick={saveApiKeys}
              class="px-5 py-2.5 text-sm font-medium rounded-xl bg-[var(--accent-9)] text-white hover:bg-[var(--accent-10)] transition-colors shadow-lg shadow-[var(--accent-9)]/20"
            >
              Save API Keys
            </button>
            {#if saveSuccess}
              <span class="text-sm font-medium text-[var(--success)]">Saved successfully!</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Data Management Section -->
      <div class="p-6 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-xl bg-[var(--info)]/15 flex items-center justify-center">
            <svg class="w-5 h-5 text-[var(--info)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-[var(--gray-12)]">Data Management</h2>
            <p class="text-sm text-[var(--gray-9)]">Export or import your learning data</p>
          </div>
        </div>

        <div class="space-y-4">
          <!-- Export -->
          <div class="p-4 rounded-xl bg-[var(--gray-3)] border border-[var(--gray-4)]">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-medium text-[var(--gray-12)]">Export Data</h3>
                <p class="text-xs text-[var(--gray-9)] mt-1">
                  Download all your conversations, topics, memories, and facts
                </p>
              </div>
              <button
                onclick={handleExport}
                disabled={isExporting}
                class="inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl bg-[var(--gray-4)] border border-[var(--gray-5)] text-[var(--gray-11)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-5)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {#if isExporting}
                  <svg class="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Exporting...
                {:else}
                  <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Export
                {/if}
              </button>
            </div>
            {#if exportSuccess}
              <p class="mt-3 text-xs font-medium text-[var(--success)]">Export downloaded successfully!</p>
            {/if}
            {#if exportError}
              <p class="mt-3 text-xs font-medium text-[var(--error)]">{exportError}</p>
            {/if}
          </div>

          <!-- Import -->
          <div class="p-4 rounded-xl bg-[var(--gray-3)] border border-[var(--gray-4)]">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-medium text-[var(--gray-12)]">Import Data</h3>
                <p class="text-xs text-[var(--gray-9)] mt-1">
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
                <span class="inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl bg-[var(--gray-4)] border border-[var(--gray-5)] text-[var(--gray-11)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-5)] transition-colors {isImporting ? 'opacity-50 cursor-not-allowed' : ''}">
                  {#if isImporting}
                    <svg class="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Importing...
                  {:else}
                    <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                    </svg>
                    Import
                  {/if}
                </span>
              </label>
            </div>

            {#if importStats}
              <div class="mt-4 p-4 rounded-xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
                <p class="text-sm font-medium text-[var(--gray-12)] mb-3">Import Results</p>
                <div class="grid grid-cols-2 gap-3 text-sm">
                  <div class="flex justify-between">
                    <span class="text-[var(--gray-9)]">Conversations</span>
                    <span class="font-medium text-[var(--gray-12)]">{importStats.conversations}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-[var(--gray-9)]">Messages</span>
                    <span class="font-medium text-[var(--gray-12)]">{importStats.messages}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-[var(--gray-9)]">Topics</span>
                    <span class="font-medium text-[var(--gray-12)]">{importStats.topics}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-[var(--gray-9)]">Memories</span>
                    <span class="font-medium text-[var(--gray-12)]">{importStats.memories}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-[var(--gray-9)]">Facts</span>
                    <span class="font-medium text-[var(--gray-12)]">{importStats.facts}</span>
                  </div>
                </div>
                {#if importStats.errors.length > 0}
                  <p class="mt-3 text-sm font-medium text-[var(--warning)]">
                    {importStats.errors.length} error{importStats.errors.length > 1 ? 's' : ''} occurred
                  </p>
                {/if}
              </div>
            {/if}

            {#if importError}
              <p class="mt-3 text-xs font-medium text-[var(--error)]">{importError}</p>
            {/if}
          </div>
        </div>
      </div>

      <!-- About Section -->
      <div class="p-6 rounded-2xl bg-[var(--gray-2)] border border-[var(--gray-4)]">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent-8)] to-[var(--accent-9)] flex items-center justify-center shadow-lg shadow-[var(--accent-9)]/20">
            <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-[var(--gray-12)]">About Tutor</h2>
            <p class="text-xs text-[var(--gray-9)]">Version 0.1.0</p>
          </div>
        </div>
        <p class="text-sm text-[var(--gray-11)] leading-relaxed">
          An AI-powered learning companion that understands your screen, remembers your learning journey, and adapts to your unique needs. Built with Tauri, Svelte, and Claude.
        </p>
      </div>
    </div>
  </main>
</div>
