/**
 * Shared between `actions.ts`/`ai-extract.ts` (both eventually consumed by
 * `"use server"` files, so directive-free plain constants can't live
 * there) and `adapt-dialog.tsx`.
 */

export const MAX_JOB_POSTING_CHARS = 12_000
export const MIN_JOB_POSTING_CHARS = 200
export const MAX_MATERIAL_CHARS = 40_000

/**
 * Storage cap for `adaptation.adaptation_notes`. The prompt asks for 2-3
 * sentences, so this is roughly ten times the expected size — it exists to
 * bound what a client can push into the column, not to shape the copy.
 *
 * Enforced by TRUNCATION in `createCvFromAdaptation`, deliberately unlike
 * `jobPostingText` which is REJECTED past its cap. The difference is who
 * can fix it: the user pasted the posting and can trim it, but nobody can
 * make the model write shorter notes on demand. Failing the whole CV
 * creation over an explanatory footnote would destroy the reviewed work for
 * the least important field on the payload.
 */
export const MAX_ADAPTATION_NOTES_CHARS = 2_000

export const DEFAULT_ADAPTED_CV_TITLE = "CV adaptado"

/**
 * Refusal message for a bank-origin adaptation with nothing to adapt FROM.
 * Deliberately actionable rather than apologetic: the fix is always the same
 * one gesture, so the message names it.
 */
export const EMPTY_BANK_ERROR =
  "Tu banco todavía no tiene material para adaptar. Importá tu CV en PDF o conectá GitHub y probá de nuevo."

export const JOB_POSTING_TOO_LONG_ERROR = `El aviso supera los ${MAX_JOB_POSTING_CHARS} caracteres. Pegá solo la descripción del puesto y los requisitos.`

export const JOB_POSTING_TOO_SHORT_ERROR = `Pegá el aviso completo — necesitamos al menos ${MIN_JOB_POSTING_CHARS} caracteres para adaptar el CV.`
