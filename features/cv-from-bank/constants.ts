/**
 * Shared between `actions.ts` (a `"use server"` module, which cannot export
 * plain constants) and the client picker — same split as
 * `features/cv-adapt/constants.ts`.
 */

export const DEFAULT_BANK_CV_TITLE = "CV desde el banco"

export const NO_BANK_ERROR =
  "Todavía no tenés material en tu banco. Importá tu CV o conectá GitHub para empezar."
