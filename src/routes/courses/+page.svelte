<script lang="ts">
  import { onMount } from 'svelte';
  import { coursesStore } from '$lib/stores/courses';
  import type { Course, CourseMaterial, MaterialType } from '$lib/types';

  const store = $derived($coursesStore);

  let isAddingCourse = $state(false);
  let isAddingMaterial = $state(false);
  let newCourseName = $state('');
  let newCourseCode = $state('');
  let newMaterialTitle = $state('');
  let newMaterialType = $state<MaterialType>('reading');
  let newMaterialContent = $state('');
  let newMaterialDueDate = $state('');

  const materialTypes: { value: MaterialType; label: string }[] = [
    { value: 'syllabus', label: 'Syllabus' },
    { value: 'reading', label: 'Reading' },
    { value: 'assignment', label: 'Assignment' },
    { value: 'lecture', label: 'Lecture' },
    { value: 'resource', label: 'Resource' },
    { value: 'other', label: 'Other' },
  ];

  const courseColors = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  ];

  onMount(async () => {
    await coursesStore.loadCourses();
  });

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  async function handleCreateCourse() {
    if (!newCourseName.trim()) return;

    try {
      await coursesStore.createCourse({
        name: newCourseName.trim(),
        code: newCourseCode.trim() || undefined,
        color: courseColors[Math.floor(Math.random() * courseColors.length)],
      });
      newCourseName = '';
      newCourseCode = '';
      isAddingCourse = false;
    } catch (e) {
      console.error('Failed to create course:', e);
    }
  }

  async function handleAddMaterial() {
    if (!newMaterialTitle.trim() || !store.selectedCourse) return;

    try {
      await coursesStore.addMaterial({
        course_id: store.selectedCourse.id,
        title: newMaterialTitle.trim(),
        material_type: newMaterialType,
        content: newMaterialContent.trim() || undefined,
        due_date: newMaterialDueDate || undefined,
      });
      newMaterialTitle = '';
      newMaterialContent = '';
      newMaterialDueDate = '';
      newMaterialType = 'reading';
      isAddingMaterial = false;
    } catch (e) {
      console.error('Failed to add material:', e);
    }
  }

  async function handleDeleteCourse(course: Course) {
    if (!confirm(`Delete "${course.name}" and all its materials?`)) return;
    await coursesStore.deleteCourse(course.id);
  }

  async function handleToggleComplete(material: CourseMaterial) {
    await coursesStore.toggleMaterialCompleted(material.id);
  }

  async function handleDeleteMaterial(material: CourseMaterial) {
    if (!confirm(`Delete "${material.title}"?`)) return;
    await coursesStore.deleteMaterial(material.id);
  }

  function getMaterialTypeIcon(type: MaterialType): string {
    const icons: Record<MaterialType, string> = {
      syllabus: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z',
      reading: 'M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25',
      assignment: 'M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75',
      lecture: 'M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125',
      resource: 'M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244',
      other: 'M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z',
    };
    return icons[type];
  }
</script>

<div class="h-full flex bg-[var(--gray-1)]">
  <!-- Sidebar: Course List -->
  <div class="w-64 flex-shrink-0 border-r border-[var(--gray-4)] flex flex-col bg-[var(--gray-2)]">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--gray-4)]">
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
        <h1 class="text-sm font-semibold text-[var(--gray-12)]">Courses</h1>
      </div>
      <button
        class="p-1.5 rounded-lg text-[var(--gray-9)] hover:text-[var(--gray-12)] hover:bg-[var(--gray-4)] transition-colors"
        onclick={() => (isAddingCourse = true)}
        title="Add course"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
    </div>

    <!-- Course List -->
    <div class="flex-1 overflow-y-auto">
      {#if isAddingCourse}
        <div class="p-3 border-b border-[var(--gray-4)]">
          <input
            type="text"
            placeholder="Course name"
            bind:value={newCourseName}
            class="w-full px-2 py-1.5 text-sm bg-[var(--gray-3)] border border-[var(--gray-4)] rounded-lg text-[var(--gray-12)] placeholder-[var(--gray-8)] focus:outline-none focus:border-[var(--accent)]"
          />
          <input
            type="text"
            placeholder="Code (optional)"
            bind:value={newCourseCode}
            class="w-full mt-2 px-2 py-1.5 text-sm bg-[var(--gray-3)] border border-[var(--gray-4)] rounded-lg text-[var(--gray-12)] placeholder-[var(--gray-8)] focus:outline-none focus:border-[var(--accent)]"
          />
          <div class="flex items-center gap-2 mt-2">
            <button
              class="flex-1 px-2 py-1 text-xs font-medium rounded-lg text-[var(--gray-11)] hover:bg-[var(--gray-4)]"
              onclick={() => (isAddingCourse = false)}
            >
              Cancel
            </button>
            <button
              class="flex-1 px-2 py-1 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              onclick={handleCreateCourse}
              disabled={!newCourseName.trim()}
            >
              Add
            </button>
          </div>
        </div>
      {/if}

      {#if store.isLoading}
        <div class="flex items-center justify-center py-8">
          <div class="animate-spin w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full"></div>
        </div>
      {:else if store.courses.length === 0}
        <div class="text-center py-8 px-4">
          <p class="text-xs text-[var(--gray-10)]">No courses yet</p>
        </div>
      {:else}
        {#each store.courses as course (course.id)}
          <button
            class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--gray-3)] transition-colors {store.selectedCourse?.id === course.id ? 'bg-[var(--gray-3)]' : ''}"
            onclick={() => coursesStore.selectCourse(course)}
          >
            <div
              class="w-3 h-3 rounded-full flex-shrink-0"
              style="background-color: {course.color}"
            ></div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-[var(--gray-12)] truncate">{course.name}</div>
              {#if course.code}
                <div class="text-[10px] text-[var(--gray-9)]">{course.code}</div>
              {/if}
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Main Content -->
  <div class="flex-1 flex flex-col overflow-hidden">
    {#if store.selectedCourse}
      <!-- Course Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--gray-4)] bg-[var(--gray-2)]">
        <div class="flex items-center gap-3">
          <div
            class="w-4 h-4 rounded-full"
            style="background-color: {store.selectedCourse.color}"
          ></div>
          <div>
            <h2 class="text-sm font-semibold text-[var(--gray-12)]">{store.selectedCourse.name}</h2>
            {#if store.selectedCourse.code}
              <p class="text-[10px] text-[var(--gray-9)]">{store.selectedCourse.code}</p>
            {/if}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
            onclick={() => (isAddingMaterial = true)}
          >
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Material
          </button>
          <button
            class="p-1.5 rounded-lg text-[var(--gray-8)] hover:text-[var(--error)] hover:bg-[var(--gray-4)] transition-colors"
            onclick={() => handleDeleteCourse(store.selectedCourse!)}
            title="Delete course"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Add Material Form -->
      {#if isAddingMaterial}
        <div class="p-4 border-b border-[var(--gray-4)] bg-[var(--gray-2)]">
          <div class="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Title"
              bind:value={newMaterialTitle}
              class="col-span-2 px-3 py-2 text-sm bg-[var(--gray-3)] border border-[var(--gray-4)] rounded-lg text-[var(--gray-12)] placeholder-[var(--gray-8)] focus:outline-none focus:border-[var(--accent)]"
            />
            <select
              bind:value={newMaterialType}
              class="px-3 py-2 text-sm bg-[var(--gray-3)] border border-[var(--gray-4)] rounded-lg text-[var(--gray-12)] focus:outline-none focus:border-[var(--accent)]"
            >
              {#each materialTypes as type}
                <option value={type.value}>{type.label}</option>
              {/each}
            </select>
            <input
              type="date"
              placeholder="Due date (optional)"
              bind:value={newMaterialDueDate}
              class="px-3 py-2 text-sm bg-[var(--gray-3)] border border-[var(--gray-4)] rounded-lg text-[var(--gray-12)] focus:outline-none focus:border-[var(--accent)]"
            />
            <textarea
              placeholder="Notes or content (optional)"
              bind:value={newMaterialContent}
              class="col-span-2 px-3 py-2 text-sm bg-[var(--gray-3)] border border-[var(--gray-4)] rounded-lg text-[var(--gray-12)] placeholder-[var(--gray-8)] focus:outline-none focus:border-[var(--accent)] resize-none h-20"
            ></textarea>
          </div>
          <div class="flex items-center justify-end gap-2 mt-3">
            <button
              class="px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--gray-11)] hover:bg-[var(--gray-4)]"
              onclick={() => (isAddingMaterial = false)}
            >
              Cancel
            </button>
            <button
              class="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              onclick={handleAddMaterial}
              disabled={!newMaterialTitle.trim()}
            >
              Add Material
            </button>
          </div>
        </div>
      {/if}

      <!-- Materials List -->
      <div class="flex-1 overflow-y-auto">
        {#if store.materials.length === 0}
          <div class="text-center py-12">
            <svg class="w-12 h-12 mx-auto mb-3 text-[var(--gray-6)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <p class="text-sm text-[var(--gray-10)]">No materials yet</p>
            <p class="text-xs text-[var(--gray-9)] mt-1">Add readings, assignments, and more</p>
          </div>
        {:else}
          <div class="divide-y divide-[var(--gray-4)]">
            {#each store.materials as material (material.id)}
              <div class="flex items-start gap-3 px-4 py-3 hover:bg-[var(--gray-3)] transition-colors">
                <button
                  class="mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors {material.is_completed ? 'bg-[var(--success)] border-[var(--success)]' : 'border-[var(--gray-6)] hover:border-[var(--gray-8)]'}"
                  onclick={() => handleToggleComplete(material)}
                >
                  {#if material.is_completed}
                    <svg class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  {/if}
                </button>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <svg class="w-4 h-4 text-[var(--gray-9)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d={getMaterialTypeIcon(material.material_type)} />
                    </svg>
                    <span class="text-sm font-medium text-[var(--gray-12)] truncate {material.is_completed ? 'line-through opacity-60' : ''}">
                      {material.title}
                    </span>
                  </div>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--gray-4)] text-[var(--gray-10)]">
                      {materialTypes.find((t) => t.value === material.material_type)?.label}
                    </span>
                    {#if material.due_date}
                      <span class="text-[10px] text-[var(--gray-9)]">
                        Due {formatDate(material.due_date)}
                      </span>
                    {/if}
                  </div>
                  {#if material.content}
                    <p class="mt-1 text-xs text-[var(--gray-10)] line-clamp-2">{material.content}</p>
                  {/if}
                </div>
                <button
                  class="p-1.5 rounded-lg text-[var(--gray-8)] hover:text-[var(--error)] hover:bg-[var(--gray-4)] transition-colors opacity-0 group-hover:opacity-100"
                  onclick={() => handleDeleteMaterial(material)}
                  title="Delete"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <!-- No Course Selected -->
      <div class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <svg class="w-16 h-16 mx-auto mb-4 text-[var(--gray-6)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
          </svg>
          <h2 class="text-lg font-semibold text-[var(--gray-12)] mb-1">Select a Course</h2>
          <p class="text-sm text-[var(--gray-10)]">Choose a course to view materials</p>
        </div>
      </div>
    {/if}
  </div>
</div>
