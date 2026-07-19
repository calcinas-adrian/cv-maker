/**
 * Very small, deliberately-not-a-real-language-detector heuristic (per the
 * GitHub-import plan: "don't over-build a language-detection system").
 * Spanish diacritics/punctuation are a cheap, reliable signal; failing
 * that, a couple of common English CV words; otherwise this project's
 * primary language (Spanish) wins.
 *
 * Extracted out of `features/github-import/actions.ts` (its original home)
 * so `features/cv-import/actions.ts` can reuse the exact same heuristic
 * against extracted document text instead of forking a second copy.
 */
export function inferCvLanguage(
  sampleText: string | null | undefined,
): "es" | "en" {
  if (!sampleText || sampleText.trim().length < 12) return "es"
  if (/[áéíóúñ¿¡]/i.test(sampleText)) return "es"
  const englishHits =
    sampleText.match(/\b(the|and|with|for|experience|developer|team)\b/gi)
      ?.length ?? 0
  return englishHits >= 2 ? "en" : "es"
}
