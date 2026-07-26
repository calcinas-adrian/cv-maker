import { create } from "zustand"
import { temporal } from "zundo"
import { throttle } from "es-toolkit"
import {
  DEFAULT_THEME,
  type CvData,
  type CvTheme,
  type EducationItem,
  type ExperienceItem,
  type ProjectItem,
  type SkillItem,
} from "@/schemas/cv.schema"

type SectionKey = "experiences" | "projects" | "education" | "skills"

type Direction = "up" | "down"

type EditorState = {
  draft: CvData | null
  // The CV the current `draft` belongs to — `null` before the first
  // `hydrate`. `draft` truthiness alone isn't enough to know the draft is
  // safe to render for a given cvId: this singleton store is never reset
  // between CVs (see `hydrate`'s callers), so `draft` stays non-null and
  // stale for a frame or two right after a CV switch. Consumers that need
  // to render CV-specific data must check `activeCvId === cvId` too.
  activeCvId: string | null
  hydrate: (cv: CvData, cvId: string) => void
  updateSection: (patch: Partial<CvData>) => void
  // Coarse-grained write for the YAML commit path (5.4): one replacement of
  // the whole draft, as opposed to the granular per-field/per-item actions
  // below. Goes through the same undo-tracked `set` as everything else, so
  // a YAML commit is one undo step.
  replaceDraft: (data: CvData) => void

  // Presentation, not content — deliberately OUTSIDE `partialize` below, so
  // theme changes never enter the undo stack (see `sdd/cv-editor-panel/design`
  // Decision 2).
  theme: CvTheme
  setTheme: (theme: CvTheme) => void

  addExperience: (item: ExperienceItem) => void
  updateExperience: (id: string, patch: Partial<ExperienceItem>) => void
  removeExperience: (id: string) => void
  moveExperience: (id: string, direction: Direction) => void

  addProject: (item: ProjectItem) => void
  updateProject: (id: string, patch: Partial<ProjectItem>) => void
  removeProject: (id: string) => void
  moveProject: (id: string, direction: Direction) => void

  addEducation: (item: EducationItem) => void
  updateEducation: (id: string, patch: Partial<EducationItem>) => void
  removeEducation: (id: string) => void
  moveEducation: (id: string, direction: Direction) => void

  addSkill: (item: SkillItem) => void
  updateSkill: (id: string, patch: Partial<SkillItem>) => void
  removeSkill: (id: string) => void
  moveSkill: (id: string, direction: Direction) => void
}

// Stable references for "not hydrated yet" selector fallbacks. A literal
// `[] `inline in a selector (`s.draft?.experiences ?? []`) allocates a new
// array on every call, and `useSyncExternalStore` (which zustand's
// `useStore` is built on) compares snapshots with `Object.is` — a fresh
// array every time looks like a perpetual change and triggers React's
// "getSnapshot should be cached" loop-detection warning/error. Reusing
// these constants keeps the empty case referentially stable.
export const EMPTY_EXPERIENCES: ExperienceItem[] = []
export const EMPTY_PROJECTS: ProjectItem[] = []
export const EMPTY_EDUCATION: EducationItem[] = []
export const EMPTY_SKILLS: SkillItem[] = []

function withSection<K extends SectionKey>(
  draft: CvData,
  key: K,
  updater: (items: CvData[K]) => CvData[K],
): CvData {
  return { ...draft, [key]: updater(draft[key]) }
}

function moveItem<T extends { id: string }>(
  items: T[],
  id: string,
  direction: Direction,
): T[] {
  const index = items.findIndex((item) => item.id === id)
  if (index === -1) return items

  const swapWith = direction === "up" ? index - 1 : index + 1
  if (swapWith < 0 || swapWith >= items.length) return items

  const next = [...items]
  ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
  return next
}

export const useEditorStore = create<EditorState>()(
  temporal(
    (set) => ({
      draft: null,
      activeCvId: null,

      hydrate: (cv, cvId) => set({ draft: cv, activeCvId: cvId }),
      replaceDraft: (data) => set({ draft: data }),

      theme: DEFAULT_THEME,
      setTheme: (theme) => set({ theme }),

      updateSection: (patch) =>
        set((s) => ({ draft: { ...s.draft!, ...patch } })),

      addExperience: (item) =>
        set((s) => ({
          draft: withSection(s.draft!, "experiences", (items) => [
            ...items,
            item,
          ]),
        })),
      updateExperience: (id, patch) =>
        set((s) => ({
          draft: withSection(s.draft!, "experiences", (items) =>
            items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
          ),
        })),
      removeExperience: (id) =>
        set((s) => ({
          draft: withSection(s.draft!, "experiences", (items) =>
            items.filter((it) => it.id !== id),
          ),
        })),
      moveExperience: (id, direction) =>
        set((s) => ({
          draft: withSection(s.draft!, "experiences", (items) =>
            moveItem(items, id, direction),
          ),
        })),

      addProject: (item) =>
        set((s) => ({
          draft: withSection(s.draft!, "projects", (items) => [...items, item]),
        })),
      updateProject: (id, patch) =>
        set((s) => ({
          draft: withSection(s.draft!, "projects", (items) =>
            items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
          ),
        })),
      removeProject: (id) =>
        set((s) => ({
          draft: withSection(s.draft!, "projects", (items) =>
            items.filter((it) => it.id !== id),
          ),
        })),
      moveProject: (id, direction) =>
        set((s) => ({
          draft: withSection(s.draft!, "projects", (items) =>
            moveItem(items, id, direction),
          ),
        })),

      addEducation: (item) =>
        set((s) => ({
          draft: withSection(s.draft!, "education", (items) => [
            ...items,
            item,
          ]),
        })),
      updateEducation: (id, patch) =>
        set((s) => ({
          draft: withSection(s.draft!, "education", (items) =>
            items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
          ),
        })),
      removeEducation: (id) =>
        set((s) => ({
          draft: withSection(s.draft!, "education", (items) =>
            items.filter((it) => it.id !== id),
          ),
        })),
      moveEducation: (id, direction) =>
        set((s) => ({
          draft: withSection(s.draft!, "education", (items) =>
            moveItem(items, id, direction),
          ),
        })),

      addSkill: (item) =>
        set((s) => ({
          draft: withSection(s.draft!, "skills", (items) => [...items, item]),
        })),
      updateSkill: (id, patch) =>
        set((s) => ({
          draft: withSection(s.draft!, "skills", (items) =>
            items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
          ),
        })),
      removeSkill: (id) =>
        set((s) => ({
          draft: withSection(s.draft!, "skills", (items) =>
            items.filter((it) => it.id !== id),
          ),
        })),
      moveSkill: (id, direction) =>
        set((s) => ({
          draft: withSection(s.draft!, "skills", (items) =>
            moveItem(items, id, direction),
          ),
        })),
    }),
    {
      limit: 100,
      // Only the CV draft itself enters the undo stack — UI state (which
      // dialog is open, autosave status, etc.) never does.
      partialize: (s) => ({ draft: s.draft }),
      handleSet: (handleSet) => throttle(handleSet, 400),
    },
  ),
)
