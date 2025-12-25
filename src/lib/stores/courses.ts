import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import type { Course, CourseMaterial, CreateCourseInput, CreateMaterialInput, CoursesState } from '$lib/types';

function createCoursesStore() {
  const { subscribe, set, update } = writable<CoursesState>({
    courses: [],
    selectedCourse: null,
    materials: [],
    isLoading: false,
  });

  return {
    subscribe,

    async loadCourses(activeOnly: boolean = true) {
      update((state) => ({ ...state, isLoading: true }));
      try {
        const courses = await invoke<Course[]>('get_courses', { activeOnly });
        update((state) => ({ ...state, courses, isLoading: false }));
        return courses;
      } catch (e) {
        console.error('Failed to load courses:', e);
        update((state) => ({ ...state, isLoading: false }));
        throw e;
      }
    },

    async createCourse(input: CreateCourseInput) {
      try {
        const course = await invoke<Course>('create_course', { input });
        update((state) => ({
          ...state,
          courses: [...state.courses, course],
        }));
        return course;
      } catch (e) {
        console.error('Failed to create course:', e);
        throw e;
      }
    },

    async updateCourse(courseId: string, updates: Partial<Course>) {
      try {
        const course = await invoke<Course>('update_course', { courseId, ...updates });
        update((state) => ({
          ...state,
          courses: state.courses.map((c) => (c.id === courseId ? course : c)),
          selectedCourse: state.selectedCourse?.id === courseId ? course : state.selectedCourse,
        }));
        return course;
      } catch (e) {
        console.error('Failed to update course:', e);
        throw e;
      }
    },

    async deleteCourse(courseId: string) {
      try {
        await invoke('delete_course', { courseId });
        update((state) => ({
          ...state,
          courses: state.courses.filter((c) => c.id !== courseId),
          selectedCourse: state.selectedCourse?.id === courseId ? null : state.selectedCourse,
          materials: state.selectedCourse?.id === courseId ? [] : state.materials,
        }));
      } catch (e) {
        console.error('Failed to delete course:', e);
        throw e;
      }
    },

    async selectCourse(course: Course | null) {
      update((state) => ({ ...state, selectedCourse: course, materials: [] }));
      if (course) {
        await this.loadMaterials(course.id);
      }
    },

    async loadMaterials(courseId: string, materialType?: string) {
      try {
        const materials = await invoke<CourseMaterial[]>('get_course_materials', {
          courseId,
          materialType,
        });
        update((state) => ({ ...state, materials }));
        return materials;
      } catch (e) {
        console.error('Failed to load materials:', e);
        throw e;
      }
    },

    async addMaterial(input: CreateMaterialInput) {
      try {
        const material = await invoke<CourseMaterial>('add_course_material', { input });
        update((state) => ({
          ...state,
          materials: [...state.materials, material],
        }));
        return material;
      } catch (e) {
        console.error('Failed to add material:', e);
        throw e;
      }
    },

    async toggleMaterialCompleted(materialId: string) {
      try {
        const material = await invoke<CourseMaterial>('toggle_material_completed', { materialId });
        update((state) => ({
          ...state,
          materials: state.materials.map((m) => (m.id === materialId ? material : m)),
        }));
        return material;
      } catch (e) {
        console.error('Failed to toggle completion:', e);
        throw e;
      }
    },

    async deleteMaterial(materialId: string) {
      try {
        await invoke('delete_material', { materialId });
        update((state) => ({
          ...state,
          materials: state.materials.filter((m) => m.id !== materialId),
        }));
      } catch (e) {
        console.error('Failed to delete material:', e);
        throw e;
      }
    },

    async getUpcomingAssignments(days: number = 7) {
      try {
        return await invoke<CourseMaterial[]>('get_upcoming_assignments', { days });
      } catch (e) {
        console.error('Failed to get upcoming assignments:', e);
        throw e;
      }
    },

    clear() {
      set({
        courses: [],
        selectedCourse: null,
        materials: [],
        isLoading: false,
      });
    },
  };
}

export const coursesStore = createCoursesStore();
