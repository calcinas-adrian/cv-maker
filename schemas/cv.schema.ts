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

/**
 * One itemized bullet under an experience or a project. `id` is REACT
 * IDENTITY, not a database primary key — it is never persisted as-is; it
 * exists so a bullet row is addressable for reorder/edit/delete and for
 * "save to bank" without re-keying the whole list on every render. See
 * `persist-sections.ts`'s docstring: "client-supplied item ids are UI-only
 * and never persisted" applies here too.
 *
 * `sourceMaterialId` is the ACTUAL provenance pointer, persisted onto
 * `cv_bullet.source_material_id` (no FK — see `db/schema.ts`). Null means
 * "hand-written, never linked to the bank". It is nullable/optional/
 * defaulted so a freshly typed bullet, an imported one, and one hydrated
 * from the database all satisfy this schema without special-casing.
 */
export const cvBulletSchema = z.object({
  id: z.string(),
  content: z.string(),
  sourceMaterialId: z.string().nullable().optional().default(null),
})

export type CvBullet = z.infer<typeof cvBulletSchema>

export const experienceItemSchema = z.object({
  id: z.string(),
  company: z.string().optional(),
  role: z.string().optional(),
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  bullets: z.array(cvBulletSchema).optional().default([]),
})

export const projectItemSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  url: z.string().nullable().optional(),
  bullets: z.array(cvBulletSchema).optional().default([]),
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

// Certifications and awards, merged via `kind` — mirrors `bank_credential`
// (`db/schema.ts`). Replaces the old flat `achievementItemSchema`:
// `title` -> `name`, `date` -> `issuedAt`/`expiresAt`, plus `kind`,
// `credentialId`, `credentialUrl`.
export const credentialKinds = ["certification", "award"] as const
export const credentialKindSchema = z.enum(credentialKinds)
export type CredentialKind = z.infer<typeof credentialKindSchema>

export const credentialItemSchema = z.object({
  id: z.string(),
  kind: credentialKindSchema.optional(),
  name: z.string().optional(),
  issuer: z.string().nullable().optional(),
  issuedAt: dateStringSchema,
  expiresAt: dateStringSchema,
  credentialId: z.string().nullable().optional(),
  credentialUrl: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
})

export const languageItemSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  level: z.string().nullable().optional(),
})

export const referenceItemSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  role: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
})

export const cvDataSchema = z.object({
  fullName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedinUrl: z.string().nullable().optional(),
  websiteUrl: z.string().nullable().optional(),
  summary: z.string().optional(),
  experiences: z.array(experienceItemSchema).optional().default([]),
  projects: z.array(projectItemSchema).optional().default([]),
  education: z.array(educationItemSchema).optional().default([]),
  skills: z.array(skillItemSchema).optional().default([]),
  // `.default([])` is what makes these safe to add to an ALREADY-DEPLOYED
  // schema: `cv_version.snapshot` is a jsonb column typed as `CvData`, so
  // every snapshot written before these fields existed lacks both keys.
  // Any read path that PARSES the snapshot gets `[]` back; a raw cast does
  // not (see `restoreVersion` in `features/cv/actions.ts`, which returns
  // `versionRow.snapshot` unparsed — the store tolerates a missing key
  // because every section selector falls back to its `EMPTY_*` constant).
  // This restructure ships against an EMPTY database (see
  // `architecture/career-bank-migration-strategy`), so there are zero
  // pre-existing snapshots to worry about here in practice, but the
  // `.default([])` convention is kept for every future additive field.
  credentials: z.array(credentialItemSchema).optional().default([]),
  languages: z.array(languageItemSchema).optional().default([]),
  references: z.array(referenceItemSchema).optional().default([]),
})

// Alias used at the server-action boundary — same schema, name matches the
// "draft being persisted" intent at that call site.
export const cvDraftSchema = cvDataSchema

export type ExperienceItem = z.infer<typeof experienceItemSchema>
export type ProjectItem = z.infer<typeof projectItemSchema>
export type EducationItem = z.infer<typeof educationItemSchema>
export type SkillItem = z.infer<typeof skillItemSchema>
export type CredentialItem = z.infer<typeof credentialItemSchema>
export type LanguageItem = z.infer<typeof languageItemSchema>
export type ReferenceItem = z.infer<typeof referenceItemSchema>
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
