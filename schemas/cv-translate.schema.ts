import { z } from "zod"
import { cvDraftSchema } from "@/schemas/cv.schema"

export const translationLanguageSchema = z.enum(["es", "en"])

/**
 * Input contract for `translateCvSegments`. `segments` is client-owned,
 * untrusted data — it came from `collectCvSegments` run against the LIVE
 * editor draft, never re-derived server-side (design D4).
 */
export const translateSegmentsInputSchema = z.object({
  segments: z.array(z.string()),
  from: translationLanguageSchema,
  to: translationLanguageSchema,
  providerModelId: z.string().optional(),
})

export type TranslateSegmentsInput = z.infer<
  typeof translateSegmentsInputSchema
>

/**
 * The reviewed-and-confirmed shape `createCvFromTranslation` accepts.
 * Mirrors `cvAdaptReviewSchema`'s shape minus the job-posting-specific
 * fields — translation has no adaptation-notes / posting-text equivalent.
 */
export const cvTranslationReviewSchema = z.object({
  sourceCvId: z.string().min(1),
  title: z.string(),
  draft: cvDraftSchema,
})

export type CvTranslationReview = z.infer<typeof cvTranslationReviewSchema>
