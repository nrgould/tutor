import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import type { Note, CreateNoteInput, UpdateNoteInput, NotesState } from '$lib/types';

function createNotesStore() {
  const { subscribe, set, update } = writable<NotesState>({
    notes: [],
    selectedNote: null,
    isLoading: false,
    searchQuery: '',
  });

  return {
    subscribe,

    async loadNotes(options?: { sessionId?: string; topicId?: string; pinnedOnly?: boolean }) {
      update((state) => ({ ...state, isLoading: true }));
      try {
        const notes = await invoke<Note[]>('get_notes', {
          limit: 100,
          sessionId: options?.sessionId,
          topicId: options?.topicId,
          pinnedOnly: options?.pinnedOnly,
        });
        update((state) => ({ ...state, notes, isLoading: false }));
        return notes;
      } catch (e) {
        console.error('Failed to load notes:', e);
        update((state) => ({ ...state, isLoading: false }));
        throw e;
      }
    },

    async createNote(input: CreateNoteInput) {
      update((state) => ({ ...state, isLoading: true }));
      try {
        const note = await invoke<Note>('create_note', { input });
        update((state) => ({
          ...state,
          notes: [note, ...state.notes],
          selectedNote: note,
          isLoading: false,
        }));
        return note;
      } catch (e) {
        console.error('Failed to create note:', e);
        update((state) => ({ ...state, isLoading: false }));
        throw e;
      }
    },

    async updateNote(noteId: string, input: UpdateNoteInput) {
      try {
        const note = await invoke<Note>('update_note', { noteId, input });
        update((state) => ({
          ...state,
          notes: state.notes.map((n) => (n.id === noteId ? note : n)),
          selectedNote: state.selectedNote?.id === noteId ? note : state.selectedNote,
        }));
        return note;
      } catch (e) {
        console.error('Failed to update note:', e);
        throw e;
      }
    },

    async deleteNote(noteId: string) {
      try {
        await invoke('delete_note', { noteId });
        update((state) => ({
          ...state,
          notes: state.notes.filter((n) => n.id !== noteId),
          selectedNote: state.selectedNote?.id === noteId ? null : state.selectedNote,
        }));
      } catch (e) {
        console.error('Failed to delete note:', e);
        throw e;
      }
    },

    async togglePin(noteId: string) {
      try {
        const note = await invoke<Note>('toggle_note_pin', { noteId });
        update((state) => ({
          ...state,
          notes: state.notes.map((n) => (n.id === noteId ? note : n)),
          selectedNote: state.selectedNote?.id === noteId ? note : state.selectedNote,
        }));
        return note;
      } catch (e) {
        console.error('Failed to toggle pin:', e);
        throw e;
      }
    },

    async searchNotes(query: string) {
      if (!query.trim()) {
        update((state) => ({ ...state, searchQuery: '' }));
        return this.loadNotes();
      }

      update((state) => ({ ...state, isLoading: true, searchQuery: query }));
      try {
        const notes = await invoke<Note[]>('search_notes', { query, limit: 50 });
        update((state) => ({ ...state, notes, isLoading: false }));
        return notes;
      } catch (e) {
        console.error('Failed to search notes:', e);
        update((state) => ({ ...state, isLoading: false }));
        throw e;
      }
    },

    selectNote(note: Note | null) {
      update((state) => ({ ...state, selectedNote: note }));
    },

    setSearchQuery(query: string) {
      update((state) => ({ ...state, searchQuery: query }));
    },

    clear() {
      set({
        notes: [],
        selectedNote: null,
        isLoading: false,
        searchQuery: '',
      });
    },
  };
}

export const notesStore = createNotesStore();
