"use server"

import { eq } from "drizzle-orm"
import { db } from "@/db"
import { cv } from "@/db/schema"
import { DEFAULT_THEME, themeSchema, type CvTheme } from "@/schemas/cv.schema"
import { getSessionUserId, findOwnedCv } from "@/features/cv/ownership"
import type { Result } from "@/lib/result"

/**
 * Sibling read to `features/cv/actions.ts`'s `getCvDraft`, kept separate
 * rather than folded into it: `renderCvPdf` needs BOTH the content draft
 * and the theme, but `getCvDraft`'s `Result<CvData>` contract (also used by
 * `saveVersion` to build content-only snapshots) has no room for theme —
 * and shouldn't, since theme is deliberately orthogonal to content (design
 * Decision 2).
 */
export async function getCvTheme(cvId: string): Promise<Result<CvTheme>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const owned = await findOwnedCv(cvId, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  return { ok: true, data: owned.theme ?? DEFAULT_THEME }
}

/**
 * Updates a CV's theme only — deliberately does NOT touch `cv.updatedAt`,
 * so a theme change never conflicts with `saveDraft`'s optimistic-
 * concurrency check on content (see `sdd/cv-editor-panel/design`
 * Decision 2 and the theme spec's "no forced migration" scenario).
 */
export async function saveTheme(
  cvId: string,
  input: unknown,
): Promise<Result<{ saved: true }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const owned = await findOwnedCv(cvId, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const parsed = themeSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Tema inválido", code: "invalid_input" }
  }

  await db.update(cv).set({ theme: parsed.data }).where(eq(cv.id, cvId))

  return { ok: true, data: { saved: true } }
}
