import { create } from "zustand"
import { temporal } from "zundo"
import { throttle } from "es-toolkit"
import {
  DEFAULT_THEME,
  type AchievementItem,
  type CvData,
  type CvTheme,
  type EducationItem,
  type ExperienceItem,
  type ProjectItem,
  type ReferenceItem,
  type SkillItem,
} from "@/schemas/cv.schema"

type SectionKey =
  | "experiences"
  | "projects"
  | "education"
  | "skills"
  | "achievements"
  | "references"

/** The item type stored in a given list section, e.g. `"skills"` -> `SkillItem`. */
type SectionItem<K extends SectionKey> = CvData[K][number]

type Direction = "up" | "down"

/**
 * The list-manipulation actions every CV section gets, before they are
 * bound to their section-specific names on `EditorState` below.
 *
 * These behave identically for every section — the only thing that varies
 * is which `CvData` key they write to — so they are produced once by
 * `createSectionActions` instead of being hand-written per section. Adding
 * a new action (or a new section) is then a single change, not six copies
 * of the same `set(...)` shape.
 */
type SectionActions<K extends SectionKey> = {
  add: (item: SectionItem<K>) => void
  update: (id: string, patch: Partial<SectionItem<K>>) => void
  remove: (id: string) => void
  move: (id: string, direction: Direction) => void
  /**
   * Inserts a copy of `sourceId` directly below it, carrying `newId`.
   *
   * IDEMPOTENT BY OPERATION KEY: `newId` is supplied by the caller and acts
   * as the idempotency key, so re-applying the same call — a retry, a
   * replayed event, an effect that fires twice — is a no-op instead of a
   * second copy. Note this does NOT mean "two clicks make one copy": the UI
   * mints a fresh `newId` per click, so two deliberate clicks still give
   * two copies, which is the intended semantic of a duplicate button.
   */
  duplicate: (sourceId: string, newId: string) => void
}

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

  // Per-section names are kept flat and explicit (rather than exposing a
  // nested `sections.experiences.add`) so every existing selector —
  // `useEditorStore((s) => s.addExperience)` — keeps working unchanged, and
  // so each one stays a stable function reference across renders.
  addExperience: (item: ExperienceItem) => void
  updateExperience: (id: string, patch: Partial<ExperienceItem>) => void
  removeExperience: (id: string) => void
  moveExperience: (id: string, direction: Direction) => void
  duplicateExperience: (sourceId: string, newId: string) => void

  addProject: (item: ProjectItem) => void
  updateProject: (id: string, patch: Partial<ProjectItem>) => void
  removeProject: (id: string) => void
  moveProject: (id: string, direction: Direction) => void
  duplicateProject: (sourceId: string, newId: string) => void

  addEducation: (item: EducationItem) => void
  updateEducation: (id: string, patch: Partial<EducationItem>) => void
  removeEducation: (id: string) => void
  moveEducation: (id: string, direction: Direction) => void
  duplicateEducation: (sourceId: string, newId: string) => void

  addSkill: (item: SkillItem) => void
  updateSkill: (id: string, patch: Partial<SkillItem>) => void
  removeSkill: (id: string) => void
  moveSkill: (id: string, direction: Direction) => void
  duplicateSkill: (sourceId: string, newId: string) => void

  addAchievement: (item: AchievementItem) => void
  updateAchievement: (id: string, patch: Partial<AchievementItem>) => void
  removeAchievement: (id: string) => void
  moveAchievement: (id: string, direction: Direction) => void
  duplicateAchievement: (sourceId: string, newId: string) => void

  addReference: (item: ReferenceItem) => void
  updateReference: (id: string, patch: Partial<ReferenceItem>) => void
  removeReference: (id: string) => void
  moveReference: (id: string, direction: Direction) => void
  duplicateReference: (sourceId: string, newId: string) => void
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
export const EMPTY_ACHIEVEMENTS: AchievementItem[] = []
export const EMPTY_REFERENCES: ReferenceItem[] = []

/**
 * The single cast in this module. `draft[key]` is a deferred indexed access
 * (`CvData[K]`) that TypeScript cannot prove equals `SectionItem<K>[]` while
 * `K` is still an unresolved type parameter, even though every concrete `K`
 * makes the two identical. Confining the assertion here means the callers —
 * `createSectionActions` and the updaters it builds — stay fully typed
 * against the section's real item type.
 *
 * The `?? []` covers snapshots restored from `cv_version`, whose jsonb was
 * written before a section existed and therefore has no key at all.
 */
function sectionItems<K extends SectionKey>(
  draft: CvData,
  key: K,
): SectionItem<K>[] {
  return (draft[key] ?? []) as SectionItem<K>[]
}

function withSection<K extends SectionKey>(
  draft: CvData,
  key: K,
  updater: (items: SectionItem<K>[]) => SectionItem<K>[],
): CvData {
  return { ...draft, [key]: updater(sectionItems(draft, key)) }
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

/**
 * Deep copy under a new id. `structuredClone` rather than a `{ ...item }`
 * spread on purpose: `ExperienceItem`/`ProjectItem` carry a `bullets: string[]`,
 * and a shallow copy would leave the clone and the original sharing that one
 * array. It works today only because every edit path replaces `bullets`
 * wholesale — a single future in-place `bullets.push` would silently mutate
 * both rows. Deep-copying here means no section has to remember that rule.
 */
function cloneItem<T extends { id: string }>(item: T, newId: string): T {
  return { ...structuredClone(item), id: newId }
}

export const useEditorStore = create<EditorState>()(
  temporal(
    (set, get) => {
      /**
       * Builds one section's list actions over `set`/`get`. Defined inside
       * the store creator purely so it closes over zustand's `set`/`get` and
       * inherits their inferred types, instead of having to restate those
       * signatures.
       */
      function createSectionActions<K extends SectionKey>(
        key: K,
      ): SectionActions<K> {
        return {
          add: (item) =>
            set((s) => ({
              draft: withSection(s.draft!, key, (items) => [...items, item]),
            })),
          update: (id, patch) =>
            set((s) => ({
              draft: withSection(s.draft!, key, (items) =>
                items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
              ),
            })),
          remove: (id) =>
            set((s) => ({
              draft: withSection(s.draft!, key, (items) =>
                items.filter((it) => it.id !== id),
              ),
            })),
          move: (id, direction) =>
            set((s) => ({
              draft: withSection(s.draft!, key, (items) =>
                moveItem(items, id, direction),
              ),
            })),
          // Reads through `get()` and returns WITHOUT calling `set` on a
          // no-op, rather than calling `set` and returning the unchanged
          // state. That distinction is load-bearing: zundo (v2.3.0) wraps
          // `set` unconditionally — it snapshots, calls through, then pushes
          // to `pastStates` with no equality check, since this store
          // configures neither `diff` nor `equality`. A no-op that still
          // called `set` would therefore leave a phantom undo entry that
          // "undoes" nothing. Skipping `set` entirely also means zustand
          // never notifies subscribers, so `useAutosave`'s draft-identity
          // listener stays quiet and no save is queued.
          duplicate: (sourceId, newId) => {
            const draft = get().draft
            if (!draft) return

            const items = sectionItems(draft, key)
            // The idempotency check: this exact operation already landed.
            if (items.some((it) => it.id === newId)) return

            const index = items.findIndex((it) => it.id === sourceId)
            if (index === -1) return

            const next = [...items]
            next.splice(index + 1, 0, cloneItem(items[index], newId))
            set({ draft: withSection(draft, key, () => next) })
          },
        }
      }

      const experiences = createSectionActions("experiences")
      const projects = createSectionActions("projects")
      const education = createSectionActions("education")
      const skills = createSectionActions("skills")
      const achievements = createSectionActions("achievements")
      const references = createSectionActions("references")

      return {
        draft: null,
        activeCvId: null,

        hydrate: (cv, cvId) => set({ draft: cv, activeCvId: cvId }),
        replaceDraft: (data) => set({ draft: data }),

        theme: DEFAULT_THEME,
        setTheme: (theme) => set({ theme }),

        updateSection: (patch) =>
          set((s) => ({ draft: { ...s.draft!, ...patch } })),

        addExperience: experiences.add,
        updateExperience: experiences.update,
        removeExperience: experiences.remove,
        moveExperience: experiences.move,
        duplicateExperience: experiences.duplicate,

        addProject: projects.add,
        updateProject: projects.update,
        removeProject: projects.remove,
        moveProject: projects.move,
        duplicateProject: projects.duplicate,

        addEducation: education.add,
        updateEducation: education.update,
        removeEducation: education.remove,
        moveEducation: education.move,
        duplicateEducation: education.duplicate,

        addSkill: skills.add,
        updateSkill: skills.update,
        removeSkill: skills.remove,
        moveSkill: skills.move,
        duplicateSkill: skills.duplicate,

        addAchievement: achievements.add,
        updateAchievement: achievements.update,
        removeAchievement: achievements.remove,
        moveAchievement: achievements.move,
        duplicateAchievement: achievements.duplicate,

        addReference: references.add,
        updateReference: references.update,
        removeReference: references.remove,
        moveReference: references.move,
        duplicateReference: references.duplicate,
      }
    },
    {
      limit: 100,
      // Only the CV draft itself enters the undo stack — UI state (which
      // dialog is open, autosave status, etc.) never does.
      partialize: (s) => ({ draft: s.draft }),
      handleSet: (handleSet) => throttle(handleSet, 400),
    },
  ),
)
