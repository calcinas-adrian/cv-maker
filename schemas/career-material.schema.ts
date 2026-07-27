import { z } from "zod"

/**
 * `career_material` bank contract — validated at the `features/career-material`
 * server-action boundary. Lives in `schemas/` per repo convention (mirrors
 * `schemas/cv-import.schema.ts`, `schemas/cv.schema.ts`).
 */

export const careerMaterialKinds = [
  "experience_bullet",
  "project_bullet",
  "skill",
  "summary_note",
] as const

export const careerMaterialKindSchema = z.enum(careerMaterialKinds)

export type CareerMaterialKind = z.infer<typeof careerMaterialKindSchema>

export const careerMaterialInputSchema = z.object({
  kind: careerMaterialKindSchema,
  company: z.string().max(200).nullable(),
  role: z.string().max(200).nullable(),
  projectName: z.string().max(200).nullable(),
  content: z.string().trim().min(3).max(2000),
  tags: z.array(z.string().max(40)).max(20),
})

export type CareerMaterialInput = z.infer<typeof careerMaterialInputSchema>
