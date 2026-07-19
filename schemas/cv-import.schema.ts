import { z } from "zod"

/**
 * AI-extraction output contract for the "import an existing CV file (PDF or
 * DOCX)" feature — mirrors how `projectExtractSchema` in
 * `schemas/github-import.schema.ts` shapes `project` extraction, but for
 * the full `CvData` shape (basic info + all four item sections).
 *
 * Same field-level choices as `projectExtractSchema`, deliberately NOT
 * reusing `cvDataSchema`/`cvDraftSchema` directly: this is passed as
 * `generateObject`'s `schema` option (`features/cv-import/ai-extract.ts`),
 * so every field is required — the model must explicitly emit
 * `""`/`null`/`[]` for "nothing found in the source document" rather than
 * omitting the key. `cvDataSchema`'s item schemas are optional/nullable
 * almost everywhere (that laxness is for a client draft mid-edit, not for
 * structured AI output, where deep optionality tends to produce worse
 * structured-output reliability — the same lesson already applied to
 * `projectExtractSchema`). Extracted items also have no `id` yet — one is
 * only assigned once the user confirms them in the review dialog and they
 * become real `CvData` items (see `features/cv-import/import-from-file-dialog.tsx`).
 */

export const experienceExtractSchema = z.object({
  company: z.string(),
  role: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  bullets: z.array(z.string()),
})

export const projectExtractItemSchema = z.object({
  name: z.string(),
  description: z.string(),
  url: z.string().nullable(),
  bullets: z.array(z.string()),
})

export const educationExtractSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
})

export const skillExtractSchema = z.object({
  name: z.string(),
  category: z.string().nullable(),
})

export const cvImportExtractSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  summary: z.string(),
  experiences: z.array(experienceExtractSchema),
  projects: z.array(projectExtractItemSchema),
  education: z.array(educationExtractSchema),
  skills: z.array(skillExtractSchema),
})

export type ExperienceExtract = z.infer<typeof experienceExtractSchema>
export type ProjectExtractItem = z.infer<typeof projectExtractItemSchema>
export type EducationExtract = z.infer<typeof educationExtractSchema>
export type SkillExtract = z.infer<typeof skillExtractSchema>
export type CvImportExtract = z.infer<typeof cvImportExtractSchema>
