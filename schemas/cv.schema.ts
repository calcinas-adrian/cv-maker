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
