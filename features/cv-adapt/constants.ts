/**
 * Shared between `actions.ts`/`ai-extract.ts` (both eventually consumed by
 * `"use server"` files, so directive-free plain constants can't live
 * there) and `adapt-dialog.tsx`.
 */

export const MAX_JOB_POSTING_CHARS = 12_000
export const MIN_JOB_POSTING_CHARS = 200
export const MAX_MATERIAL_CHARS = 40_000

export const DEFAULT_ADAPTED_CV_TITLE = "CV adaptado"

export const JOB_POSTING_TOO_LONG_ERROR = `El aviso supera los ${MAX_JOB_POSTING_CHARS} caracteres. Pegá solo la descripción del puesto y los requisitos.`

export const JOB_POSTING_TOO_SHORT_ERROR = `Pegá el aviso completo — necesitamos al menos ${MIN_JOB_POSTING_CHARS} caracteres para adaptar el CV.`
