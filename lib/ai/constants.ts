/**
 * Shared across every BYOK-consuming feature (GitHub import, CV file import,
 * …). Kept out of any single feature's `"use server"` actions file — those
 * may only export async functions, so a plain string constant can't live
 * there — and out of any one feature's `constants.ts` so a second feature
 * doesn't end up importing "github-import"'s file for an unrelated concern.
 */
export const NO_PROVIDER_CONFIGURED_ERROR =
  "Configurá una clave de IA en Ajustes antes de importar."
