import { z } from "zod"

/**
 * Shared CV data contract — used by the client draft editor (RHF forms,
 * the zustand store, autosave) and, in later phases, by AI-generated CV
 * output.
 *
 * Kept intentionally lax: a draft can be incomplete while the user is
 * mid-edit (per the plan, "un borrador puede estar incompleto; la
 * validación estricta ocurre al renderizar, no al autoguardar"). Nested
 * item fields are optional/nullable so a half-filled row never breaks
 * autosave. Strict "ready to render" validation is a separate, stricter
 * schema below — not consumed until the Typst render phase.
 */

const dateStringSchema = z.string().nullable().optional()

export const experienceItemSchema = z.object({
  id: z.string(),
  company: z.string().optional(),
  role: z.string().optional(),
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  bullets: z.array(z.string()).optional().default([]),
})

export const projectItemSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  url: z.string().nullable().optional(),
  bullets: z.array(z.string()).optional().default([]),
})

export const educationItemSchema = z.object({
  id: z.string(),
  institution: z.string().optional(),
  degree: z.string().optional(),
  startDate: dateStringSchema,
  endDate: dateStringSchema,
})

export const skillItemSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  category: z.string().nullable().optional(),
})

export const cvDataSchema = z.object({
  fullName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  summary: z.string().optional(),
  experiences: z.array(experienceItemSchema).optional().default([]),
  projects: z.array(projectItemSchema).optional().default([]),
  education: z.array(educationItemSchema).optional().default([]),
  skills: z.array(skillItemSchema).optional().default([]),
})

// Alias used at the server-action boundary — same schema, name matches the
// "draft being persisted" intent at that call site.
export const cvDraftSchema = cvDataSchema

export type ExperienceItem = z.infer<typeof experienceItemSchema>
export type ProjectItem = z.infer<typeof projectItemSchema>
export type EducationItem = z.infer<typeof educationItemSchema>
export type SkillItem = z.infer<typeof skillItemSchema>
export type CvData = z.infer<typeof cvDataSchema>

/**
 * Stricter "ready to render" contract. Not consumed anywhere yet — this is
 * a forward-looking export for the future Typst-render phase, which will
 * validate a draft against this before generating output.
 */
export const cvRenderSchema = cvDataSchema.extend({
  fullName: z.string().min(1),
  email: z.email(),
  summary: z.string().min(1),
  experiences: z.array(
    experienceItemSchema.extend({
      company: z.string().min(1),
      role: z.string().min(1),
    }),
  ),
})

export type CvRenderData = z.infer<typeof cvRenderSchema>

/**
 * CV presentation theme — kept as a SIBLING schema, deliberately not folded
 * into `cvDataSchema`.
 *
 * Theme is presentation, orthogonal to content: extending `cvDataSchema`
 * would ride `saveDraft`'s cv-row update path AND land in `cv_version`
 * snapshots, so theme changes would wrongly capture as content versions.
 * See `sdd/cv-editor-panel/design` Decision 2.
 *
 * Every field has a zod `.default(...)` so `DEFAULT_THEME` is always fully
 * concrete — this is what pre-existing CVs (whose `cv.theme` column is
 * `NULL`) fall back to, and its values equal today's hardcoded
 * `templates/classic.typ` literals so existing rows render unchanged.
 */
// Exported so UI-side bounds (e.g. `<input min/max>` in the theme picker)
// derive from the same numbers the schema validates against, instead of a
// second hand-copied set of magic numbers that can silently drift out of
// sync with what `saveTheme` actually accepts.
export const THEME_FONT_SIZE_MIN = 8
export const THEME_FONT_SIZE_MAX = 12
export const THEME_LINE_HEIGHT_MIN = 0.4
export const THEME_LINE_HEIGHT_MAX = 0.8

export const themeSchema = z.object({
  // Must stay a subset of `features/render/font-manifest.ts` (added in
  // Phase 2) — the client and server must only ever offer fonts bundled on
  // both sides.
  fontFamily: z.enum(["New Computer Modern"]).default("New Computer Modern"),
  fontSize: z
    .number()
    .min(THEME_FONT_SIZE_MIN)
    .max(THEME_FONT_SIZE_MAX)
    .default(10), // pt
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#000000"),
  margin: z.enum(["compact", "normal", "relaxed"]).default("normal"),
  lineHeight: z
    .number()
    .min(THEME_LINE_HEIGHT_MIN)
    .max(THEME_LINE_HEIGHT_MAX)
    .default(0.55), // em leading
})

export type CvTheme = z.infer<typeof themeSchema>

export const DEFAULT_THEME: CvTheme = themeSchema.parse({})
