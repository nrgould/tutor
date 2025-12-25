<script lang="ts">
  import { onMount } from 'svelte';
  import { notesStore } from '$lib/stores/notes';
  import type { Note } from '$lib/types';

  const notes = $derived($notesStore);

  let isCreating = $state(false);
  let isEditing = $state(false);
  let editingNote = $state<Note | null>(null);
  let newNoteTitle = $state('');
  let newNoteContent = $state('');
  let searchInput = $state('');
  let searchTimeout: ReturnType<typeof setTimeout>;

  onMount(async () => {
    await notesStore.loadNotes();
  });

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'Z');
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  async function handleCreateNote() {
    if (!newNoteContent.trim()) return;

    try {
      await notesStore.createNote({
        title: newNoteTitle.trim() || undefined,
        content: newNoteContent.trim(),
      });
      newNoteTitle = '';
      newNoteContent = '';
      isCreating = false;
    } catch (e) {
      console.error('Failed to create note:', e);
    }
  }

  function startEditing(note: Note) {
    editingNote = note;
    newNoteTitle = note.title || '';
    newNoteContent = note.content;
    isEditing = true;
  }

  async function handleUpdateNote() {
    if (!editingNote || !newNoteContent.trim()) return;

    try {
      await notesStore.updateNote(editingNote.id, {
        title: newNoteTitle.trim() || undefined,
        content: newNoteContent.trim(),
      });
      editingNote = null;
      newNoteTitle = '';
      newNoteContent = '';
      isEditing = false;
    } catch (e) {
      console.error('Failed to update note:', e);
    }
  }

  async function handleDeleteNote(noteId: string) {
    if (!confirm('Delete this note?')) return;

    try {
      await notesStore.deleteNote(noteId);
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  }

  async function handleTogglePin(noteId: string) {
    try {
      await notesStore.togglePin(noteId);
    } catch (e) {
      console.error('Failed to toggle pin:', e);
    }
  }

  function handleSearchInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    searchInput = value;

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      notesStore.searchNotes(value);
    }, 300);
  }

  function cancelEdit() {
    isCreating = false;
    isEditing = false;
    editingNote = null;
    newNoteTitle = '';
    newNoteContent = '';
  }
</script>

<div class="h-full flex flex-col bg-[var(--gray-1)]">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--gray-4)] bg-[var(--gray-2)]">
    <div class="flex items-center gap-3">
      <a
        href="/"
        class="p-1.5 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
        aria-label="Back to home"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </a>
      <h1 class="text-sm font-semibold text-[var(--gray-12)]">Notes</h1>
    </div>
    <button
      class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
      onclick={() => (isCreating = true)}
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      New Note
    </button>
  </div>

  <!-- Search -->
  <div class="px-4 py-2 border-b border-[var(--gray-4)]">
    <div class="relative">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--gray-8)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
      <input
        type="text"
        placeholder="Search notes..."
        value={searchInput}
        oninput={handleSearchInput}
        class="w-full pl-9 pr-3 py-2 text-sm bg-[var(--gray-3)] border border-[var(--gray-4)] rounded-lg text-[var(--gray-12)] placeholder-[var(--gray-8)] focus:outline-none focus:border-[var(--accent)]"
      />
    </div>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto">
    {#if isCreating || isEditing}
      <!-- Note Editor -->
      <div class="p-4 space-y-3">
        <input
          type="text"
          placeholder="Title (optional)"
          bind:value={newNoteTitle}
          class="w-full px-3 py-2 text-sm bg-[var(--gray-3)] border border-[var(--gray-4)] rounded-lg text-[var(--gray-12)] placeholder-[var(--gray-8)] focus:outline-none focus:border-[var(--accent)]"
        />
        <textarea
          placeholder="Write your note..."
          bind:value={newNoteContent}
          class="w-full h-48 px-3 py-2 text-sm bg-[var(--gray-3)] border border-[var(--gray-4)] rounded-lg text-[var(--gray-12)] placeholder-[var(--gray-8)] focus:outline-none focus:border-[var(--accent)] resize-none"
        ></textarea>
        <div class="flex items-center justify-end gap-2">
          <button
            class="px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--gray-11)] hover:bg-[var(--gray-4)] transition-colors"
            onclick={cancelEdit}
          >
            Cancel
          </button>
          <button
            class="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            onclick={isEditing ? handleUpdateNote : handleCreateNote}
            disabled={!newNoteContent.trim()}
          >
            {isEditing ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    {:else if notes.isLoading}
      <div class="flex items-center justify-center py-12">
        <div class="animate-spin w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full"></div>
      </div>
    {:else if notes.notes.length === 0}
      <div class="text-center py-12">
        <svg class="w-12 h-12 mx-auto mb-3 text-[var(--gray-6)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <p class="text-sm text-[var(--gray-10)]">
          {notes.searchQuery ? 'No notes found' : 'No notes yet'}
        </p>
        <p class="text-xs text-[var(--gray-9)] mt-1">
          {notes.searchQuery ? 'Try a different search term' : 'Create your first note to get started'}
        </p>
      </div>
    {:else}
      <div class="divide-y divide-[var(--gray-4)]">
        {#each notes.notes as note (note.id)}
          <div class="group px-4 py-3 hover:bg-[var(--gray-3)] transition-colors">
            <div class="flex items-start gap-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  {#if note.is_pinned}
                    <svg class="w-3 h-3 text-[var(--accent)]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                    </svg>
                  {/if}
                  <span class="text-sm font-medium text-[var(--gray-12)] truncate">
                    {note.title || 'Untitled'}
                  </span>
                </div>
                <p class="mt-0.5 text-xs text-[var(--gray-10)] line-clamp-2">
                  {truncate(note.content, 120)}
                </p>
                <div class="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--gray-9)]">
                  <span>{formatDate(note.updated_at)}</span>
                  {#if note.summary}
                    <span class="px-1.5 py-0.5 rounded bg-[var(--gray-4)] text-[var(--gray-10)]">
                      Summary
                    </span>
                  {/if}
                </div>
              </div>
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  class="p-1.5 rounded-lg text-[var(--gray-8)] hover:text-[var(--accent)] hover:bg-[var(--gray-4)] transition-colors"
                  onclick={() => handleTogglePin(note.id)}
                  title={note.is_pinned ? 'Unpin' : 'Pin'}
                >
                  <svg class="w-4 h-4" fill={note.is_pinned ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                  </svg>
                </button>
                <button
                  class="p-1.5 rounded-lg text-[var(--gray-8)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
                  onclick={() => startEditing(note)}
                  title="Edit"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                  </svg>
                </button>
                <button
                  class="p-1.5 rounded-lg text-[var(--gray-8)] hover:text-[var(--error)] hover:bg-[var(--gray-4)] transition-colors"
                  onclick={() => handleDeleteNote(note.id)}
                  title="Delete"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
