import { z } from "zod"

/**
 * The payload for building a CV directly from the bank, with NO AI and no
 * source CV (see `architecture/bank-produces-cv`).
 *
 * IDS ONLY — never content. The client picks WHICH bank rows go into the CV;
 * `createCvFromBank` re-reads every one of them from the database, scoped to
 * the caller's own bank, and builds the CV from those rows. This is the same
 * structural guarantee D11/D14 give the adaptation path (contact fields and
 * education are read from owned rows, never from the wire), applied to the
 * whole document: there is no channel through which a client could put text
 * on a CV that is not already in their bank.
 *
 * It also keeps the payload tiny, which is the point of the picker being
 * fully client-side: selecting, deselecting and reordering are local state,
 * and exactly one request crosses the wire — the confirm.
 *
 * Every array is capped. These are not product limits (nobody has 100 jobs);
 * they bound what a hand-crafted request can make the server read and hold.
 */

const idSchema = z.string().min(1).max(64)

export const MAX_BANK_CV_TITLE_CHARS = 200

export const bankCvSelectionSchema = z.object({
  title: z.string().max(MAX_BANK_CV_TITLE_CHARS),
  /**
   * The `bank_material_variant` whose content becomes `cv.summary`. Null
   * means "no summary" — a legitimate choice, not a missing value. Validated
   * server-side to belong to a material of `kind: "summary"`.
   */
  summaryVariantId: idSchema.nullable().default(null),
  /**
   * Engagements in the order the user arranged them, each with the specific
   * variants (wordings) chosen for its bullets. A variant is accepted only
   * if its material actually hangs off THAT engagement — otherwise the
   * resulting `cv_bullet.source_material_id` would point at a claim that
   * belongs to a different job, and provenance that lies is worse than no
   * provenance.
   */
  engagements: z
    .array(
      z.object({
        engagementId: idSchema,
        variantIds: z.array(idSchema).max(200).default([]),
      }),
    )
    .max(100)
    .default([]),
  educationIds: z.array(idSchema).max(100).default([]),
  credentialIds: z.array(idSchema).max(200).default([]),
  languageIds: z.array(idSchema).max(50).default([]),
  skillIds: z.array(idSchema).max(300).default([]),
})

export type BankCvSelection = z.infer<typeof bankCvSelectionSchema>
