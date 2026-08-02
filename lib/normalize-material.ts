/**
 * Pure normalization for "is this the same claim, wording aside" comparisons:
 * trim, collapse internal whitespace, lowercase, strip trailing sentence
 * punctuation. Deliberately NOT a fuzzy/semantic match — a byte-for-byte-
 * after-normalization miss just costs one duplicated prompt line or one lost
 * provenance link, a much smaller downside than a false-positive match
 * silently conflating two distinct claims.
 *
 * Shared by two call sites that must never drift apart (career-bank-
 * restructure Decision 4/5):
 * - `features/cv-adapt/build-material-corpus.ts` — read-time dedup of the
 *   adaptation corpus.
 * - `features/cv/yaml/projection.ts` (Phase 7) — matching a hand-edited YAML
 *   bullet back to its original `id`/`sourceMaterialId`.
 *
 * Lives outside any `"server-only"` module specifically so the client-side
 * YAML path can import it too.
 */
export function normalizeMaterial(text: string): string {
  return text
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase()
    .replace(/[.,;:!?…]+$/u, "")
}
