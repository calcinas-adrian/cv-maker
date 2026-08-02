import { z } from "zod"

/**
 * Career bank contract — validated at the `features/career-bank` server-
 * action boundary. Replaces `schemas/career-material.schema.ts`.
 *
 * Lives in `schemas/` per repo convention (mirrors `schemas/cv.schema.ts`,
 * `schemas/cv-import.schema.ts`).
 *
 * `kind` collapses from the old four-way `career_material.kind`
 * (`experience_bullet` | `project_bullet` | `skill` | `summary_note`) down
 * to two, because context now comes from the schema shape rather than a
 * string tag: which engagement a bullet belongs to (if any) is
 * `bank_material.engagement_id`, and skills live in their own
 * `bank_skill` table entirely (`db/schema.ts`, Decision 1 resolution 6).
 * What is left for `kind` to distinguish is genuinely just "an itemized
 * claim" vs. "a paragraph" — bullet vs. summary.
 */

export const bankMaterialKinds = ["bullet", "summary"] as const

export const bankMaterialKindSchema = z.enum(bankMaterialKinds)

export type BankMaterialKind = z.infer<typeof bankMaterialKindSchema>

/**
 * Input for creating/updating a `bank_material` together with its first
 * (or only) `bank_material_variant`. Multiple variants of the same material
 * are managed separately — see `bankMaterialVariantInputSchema` below —
 * because adding a variant never re-validates or touches the material's own
 * fields (tags, engagement, kind).
 */
export const bankMaterialInputSchema = z.object({
  id: z.string().optional(),
  engagementId: z.string().nullable(),
  kind: bankMaterialKindSchema,
  techTags: z.array(z.string().max(40)).max(20),
  skillTags: z.array(z.string().max(40)).max(20),
  content: z.string().trim().min(3).max(2000),
})

export type BankMaterialInput = z.infer<typeof bankMaterialInputSchema>

/**
 * Input for adding an alternate wording to an EXISTING material. `label`
 * carries a human-readable note about where a variant came from — a manual
 * rewrite, or an importer marker such as `importado: github:{owner}/{repo}`
 * (material-import destination picker, Decision 8).
 */
export const bankMaterialVariantInputSchema = z.object({
  id: z.string().optional(),
  materialId: z.string(),
  content: z.string().trim().min(3).max(2000),
  label: z.string().max(200).nullable().optional(),
  isDefault: z.boolean().optional().default(false),
})

export type BankMaterialVariantInput = z.infer<
  typeof bankMaterialVariantInputSchema
>

export const bankEngagementKinds = ["job", "project"] as const
export const bankEngagementKindSchema = z.enum(bankEngagementKinds)
export type BankEngagementKind = z.infer<typeof bankEngagementKindSchema>

export const bankEngagementInputSchema = z.object({
  id: z.string().optional(),
  kind: bankEngagementKindSchema,
  organization: z.string().max(200).nullable().optional(),
  role: z.string().max(200).nullable().optional(),
  name: z.string().max(200).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
})

export type BankEngagementInput = z.infer<typeof bankEngagementInputSchema>

export const bankEducationInputSchema = z.object({
  id: z.string().optional(),
  institution: z.string().trim().min(1).max(200),
  degree: z.string().trim().min(1).max(200),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
})

export type BankEducationInput = z.infer<typeof bankEducationInputSchema>

export const bankCredentialKinds = ["certification", "award"] as const
export const bankCredentialKindSchema = z.enum(bankCredentialKinds)
export type BankCredentialKind = z.infer<typeof bankCredentialKindSchema>

export const bankCredentialInputSchema = z.object({
  id: z.string().optional(),
  kind: bankCredentialKindSchema,
  name: z.string().trim().min(1).max(200),
  issuer: z.string().max(200).nullable().optional(),
  issuedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  credentialId: z.string().max(200).nullable().optional(),
  credentialUrl: z.string().max(2000).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
})

export type BankCredentialInput = z.infer<typeof bankCredentialInputSchema>

export const bankLanguageInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(100),
  level: z.string().max(100).nullable().optional(),
})

export type BankLanguageInput = z.infer<typeof bankLanguageInputSchema>

export const bankSkillInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(100),
  category: z.string().max(100).nullable().optional(),
})

export type BankSkillInput = z.infer<typeof bankSkillInputSchema>

/**
 * Input for creating/updating the `bank` root row itself. There is
 * deliberately no `isPersonal`/multiplicity flag here — the single implicit
 * personal bank is a UI convention (one bank, auto-created, no switcher),
 * not a schema constraint. See `architecture/bank-multiplicity-ui`.
 *
 * `fullName` was added to `db/schema.ts`'s `bank` table AFTER this schema was
 * first drafted (see `architecture/bank-multiplicity-ui`) and was missing
 * here — added now since the bank profile screen edits it directly.
 */
export const bankInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200),
  fullName: z.string().max(200).nullable().optional(),
  headline: z.string().max(200).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  linkedinUrl: z.string().max(2000).nullable().optional(),
  websiteUrl: z.string().max(2000).nullable().optional(),
  githubUrl: z.string().max(2000).nullable().optional(),
})

export type BankInput = z.infer<typeof bankInputSchema>

/**
 * The material-import destination picker (Decision 8) — both importers
 * (GitHub + PDF/DOCX) default to `"bank"`. Shared here rather than defined
 * inside `features/career-bank/import-destination-picker.tsx` (a `"use
 * client"` component) so `"use server"` action files can import the runtime
 * schema, not just the type, without crossing the client/server component
 * boundary for a plain enum.
 */
export const importDestinations = ["bank", "cv_only"] as const
export const importDestinationSchema = z.enum(importDestinations)
export type ImportDestination = z.infer<typeof importDestinationSchema>
