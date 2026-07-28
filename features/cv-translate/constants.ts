/**
 * Shared between `actions.ts` (a `"use server"` file, so directive-free
 * plain constants can't live there) and `use-translate.ts`/`translate-dialog.tsx`.
 */
import type { TranslationLanguage } from "@/lib/translate/types"

/**
 * Segment/char caps for a translation run, mirroring
 * `features/cv-adapt/constants.ts`'s `MIN/MAX_JOB_POSTING_CHARS`-style
 * bounds. Calibrated generously against a large CV: a CV with 400 distinct
 * translatable strings or 20k characters of prose is already far beyond
 * anything a single résumé realistically contains.
 */
export const MAX_TRANSLATE_SEGMENTS = 400
export const MAX_TRANSLATE_CHARS = 20_000

export const DEFAULT_TRANSLATED_CV_TITLE = "CV traducido"

export const TOO_MANY_SEGMENTS_ERROR = `El CV tiene demasiado contenido para traducir de una vez (máximo ${MAX_TRANSLATE_SEGMENTS} fragmentos).`

export const TOO_MANY_CHARS_ERROR = `El contenido a traducir supera los ${MAX_TRANSLATE_CHARS} caracteres.`

/**
 * Default review-step title, named for the TARGET language of this run —
 * shown as the editable starting point in the review step, not persisted
 * as-is unless the user leaves it untouched.
 */
export function defaultTranslatedTitle(
  sourceTitle: string,
  to: TranslationLanguage,
): string {
  const suffix = to === "en" ? "(EN)" : "(ES)"
  return `${sourceTitle} ${suffix}`.trim()
}
