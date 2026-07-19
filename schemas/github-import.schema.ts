import { z } from "zod"

/**
 * AI-extraction output contract for the GitHub repo → CV `project` import
 * (Phase 5). Deliberately mirrors `projectItemSchema` in
 * `schemas/cv.schema.ts` minus `id` — an extracted draft has no id yet; one
 * is assigned only once the user confirms it and it's applied to the
 * editor draft (see `features/github-import/import-dialog.tsx`).
 *
 * This schema is passed as `generateObject`'s `schema` option
 * (`features/github-import/ai-extract.ts`), so every field is required —
 * the model must explicitly emit `""`/`null`/`[]` for "nothing found"
 * rather than omitting the key, which keeps the shape predictable for the
 * review form that consumes it.
 */
export const projectExtractSchema = z.object({
  name: z.string(),
  description: z.string(),
  url: z.string().nullable(),
  bullets: z.array(z.string()),
})

export type ProjectExtract = z.infer<typeof projectExtractSchema>

/**
 * AI-extraction output contract for the GitHub repo → CV `experience` import
 * (the target-choice extension of Phase 5). Deliberately has NO
 * `company`/`startDate`/`endDate` — a repo's code (or its README) doesn't
 * reliably tell you what company employed the person or when they worked
 * there, so those stay blank for the user to fill in manually during review,
 * same spirit as the cv-import feature's review-and-edit gate. Only `role`
 * (inferred from the nature of the work) and `bullets` (technical
 * achievements) are things the AI can actually ground in the source.
 */
export const experienceExtractSchema = z.object({
  role: z.string(),
  bullets: z.array(z.string()),
})

export type ExperienceExtract = z.infer<typeof experienceExtractSchema>
