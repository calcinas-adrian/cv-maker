import { z } from "zod"
import { cvDraftSchema } from "@/schemas/cv.schema"

/**
 * AI-extraction output contract for "adapt an existing CV to a job
 * posting" — mirrors `schemas/cv-import.schema.ts`'s shape (every field
 * required, no `id`, item schemas defined separately, `cvDataSchema`
 * deliberately not reused for the AI-output boundary).
 *
 * Per D14 (`sdd/adapt-cv-to-job-posting/decisions-addendum`): NO
 * `adaptedEducationSchema` and NO `education` field on `cvAdaptSchema`.
 * A degree and an institution are facts of exactly the same kind as a
 * contact email — there is zero tailoring value in letting a model reword
 * them, and the downside (a fabricated credential) is the most damaging
 * category of CV lie there is. The adapt action instead carries the
 * source CV's own `education` rows through verbatim; the corpus builder
 * still renders education in the source-CV block so the model can read it
 * for context, it just has no output channel.
 *
 * Per D11: NO `fullName`, `email`, `phone`, `location` anywhere in this
 * file — structurally absent, not merely discouraged. The action supplies
 * those from the ownership-verified source `cv` row, never from the model
 * and never from the client payload.
 */

export const adaptedExperienceSchema = z.object({
  company: z.string(),
  role: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  bullets: z.array(z.string()),
})

export const adaptedProjectSchema = z.object({
  name: z.string(),
  description: z.string(),
  url: z.string().nullable(),
  bullets: z.array(z.string()),
})

export const adaptedSkillSchema = z.object({
  name: z.string(),
  category: z.string().nullable(),
})

export const cvAdaptSchema = z.object({
  title: z.string(), // cv.title is not part of CvData
  summary: z.string(), // D12 — the AI DOES tailor this
  adaptationNotes: z.string(), // 2-3 sentences, review-enabling
  experiences: z.array(adaptedExperienceSchema),
  projects: z.array(adaptedProjectSchema),
  skills: z.array(adaptedSkillSchema),
})

export type AdaptedExperience = z.infer<typeof adaptedExperienceSchema>
export type AdaptedProject = z.infer<typeof adaptedProjectSchema>
export type AdaptedSkill = z.infer<typeof adaptedSkillSchema>
export type CvAdapt = z.infer<typeof cvAdaptSchema>

/**
 * The reviewed-and-confirmed shape `createCvFromAdaptation` accepts.
 * `jobPostingText` is re-checked against the char caps at persistence time
 * too — it is client-owned data on BOTH calls (extract and create), so an
 * oversized blob must not reach the DB by skipping the extract action.
 */
export const cvAdaptReviewSchema = z.object({
  sourceCvId: z.string().min(1),
  title: z.string(),
  jobPostingText: z.string(),
  // Carried through review so it can be PERSISTED alongside the posting:
  // these notes say what the model prioritised and — more valuable — which
  // requirements it could NOT cover with the person's material. That is the
  // single most useful thing to reread months later when the same company
  // reappears, and before this field existed it lived only in the review
  // dialog's local state and died the moment the sheet closed. No `.max()`
  // here on purpose: the cap is applied by truncation in the action (see
  // `MAX_ADAPTATION_NOTES_CHARS`), because rejecting the payload would throw
  // away the whole reviewed CV over a footnote.
  adaptationNotes: z.string(),
  draft: cvDraftSchema,
})

export type CvAdaptReview = z.infer<typeof cvAdaptReviewSchema>

/**
 * The same reviewed-and-confirmed shape, for an adaptation that started from
 * the BANK with no source CV at all (`architecture/bank-produces-cv`).
 *
 * Identical to `cvAdaptReviewSchema` minus `sourceCvId` — and that single
 * missing field is the whole difference between the two paths. With no
 * source CV, `createCvFromBankAdaptation` reads the contact fields (D11) and
 * the education/credential/language rows (D14) from the caller's `bank`
 * instead, which the `bank` table already carries the columns for. Every
 * other rule — the posting caps re-checked at persistence, notes truncated
 * rather than rejected, education trusted only for WHICH ids — is the same,
 * deliberately: two review contracts that drift apart would mean two
 * different definitions of what an adaptation is allowed to put on a CV.
 */
export const bankAdaptReviewSchema = cvAdaptReviewSchema.omit({
  sourceCvId: true,
})

export type BankAdaptReview = z.infer<typeof bankAdaptReviewSchema>
