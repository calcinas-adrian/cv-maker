"use server"

import { eq } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import type { BatchItem } from "drizzle-orm/batch"
import { db } from "@/db"
import { achievement, cv, education, reference } from "@/db/schema"
import { getSessionUserId, findOwnedCv } from "@/features/cv/ownership"
import { buildCvSectionQueries } from "@/features/cv/persist-sections"
import { resolveModelForUser } from "@/lib/ai/get-user-model"
import { translateAiError } from "@/lib/ai/errors"
import { TranslationError } from "@/lib/translate/errors"
import { createLlmTranslationProvider } from "@/lib/translate/providers/llm.provider"
import type { Result } from "@/lib/result"
import type { CvData, EducationItem } from "@/schemas/cv.schema"
import {
  cvTranslationReviewSchema,
  translateSegmentsInputSchema,
} from "@/schemas/cv-translate.schema"
import {
  DEFAULT_TRANSLATED_CV_TITLE,
  MAX_TRANSLATE_CHARS,
  MAX_TRANSLATE_SEGMENTS,
  TOO_MANY_CHARS_ERROR,
  TOO_MANY_SEGMENTS_ERROR,
} from "./constants"

/**
 * Runs the LLM fallback translation for a batch of segments already
 * extracted CLIENT-SIDE from the live editor draft
 * (`lib/translate/cv-segments.ts`'s `collectCvSegments`). This action never
 * re-derives segments from `cvId` (design D4): if autosave has not
 * flushed, a server-side re-extraction could silently differ in length or
 * order from what the client is about to reassemble against — exactly the
 * defect this design exists to prevent. `cvId` exists ONLY as the
 * ownership anchor, mirroring `adaptCvForPosting`.
 *
 * Order of operations mirrors `adaptCvForPosting` exactly: auth -> zod
 * parse -> caps BEFORE any DB lookup or provider call (rejecting late
 * wastes a round trip and, worse, a paid call) -> `findOwnedCv` as the
 * authorization anchor -> `resolveModelForUser` -> the provider call.
 */
export async function translateCvSegments(
  cvId: string,
  input: unknown,
): Promise<Result<{ segments: string[] }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = translateSegmentsInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de traducción inválidos",
      code: "invalid_input",
    }
  }
  const { segments, from, to, providerModelId } = parsed.data

  if (segments.length > MAX_TRANSLATE_SEGMENTS) {
    return { ok: false, error: TOO_MANY_SEGMENTS_ERROR, code: "invalid_input" }
  }
  const totalChars = segments.reduce((sum, segment) => sum + segment.length, 0)
  if (totalChars > MAX_TRANSLATE_CHARS) {
    return { ok: false, error: TOO_MANY_CHARS_ERROR, code: "invalid_input" }
  }

  // `cvId` comes from the client and is never trusted alone.
  const owned = await findOwnedCv(cvId, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const modelResult = await resolveModelForUser(userId, providerModelId)
  if (!modelResult.ok) return modelResult

  try {
    const translated = await createLlmTranslationProvider(
      modelResult.data.model,
    ).translate(segments, { from, to })
    return { ok: true, data: { segments: translated } }
  } catch (err) {
    // A `TranslationError` here is our own `invalid_result` (length
    // mismatch) — its message is already final Spanish copy, so it's
    // returned as-is rather than re-translated by `translateAiError`
    // (which only knows about `ai` SDK error shapes).
    if (err instanceof TranslationError) {
      return { ok: false, error: err.userMessage, code: "provider_error" }
    }
    return {
      ok: false,
      error: translateAiError(err, {
        logLabel: "AI CV translation failed",
        fallback: "No se pudo traducir el CV con IA. Probá de nuevo.",
      }),
      code: "provider_error",
    }
  }
}

/**
 * Persists a reviewed-and-confirmed translation as a brand new `cv` row, in
 * one `db.batch` (same FK/atomicity rationale as `createCvFromAdaptation` —
 * `neon-http` has no real transaction support, so `db.batch` is the only
 * atomic unit available).
 *
 * Deliberately NOT a wrapper around `createCvFromAdaptation` (design D6):
 * that action demands a 100+ char `jobPostingText` and writes a
 * `cv_adaptation` row, which has no meaning for a translation and would
 * poison `/applications`. Structurally this is `createCvFromImport` +
 * adapt's D11/D14 source-of-truth rules, minus the satellite-table insert —
 * translation has no provenance table of its own by design (no "job
 * posting" equivalent to store).
 */
export async function createCvFromTranslation(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = cvTranslationReviewSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de traducción inválidos",
      code: "invalid_input",
    }
  }
  const { sourceCvId, title, draft } = parsed.data

  // `sourceCvId` comes from the client and is never trusted alone.
  const owned = await findOwnedCv(sourceCvId, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  // D14-style guarantee, same as `createCvFromAdaptation`: `SegmentPath`
  // structurally cannot reach `education`, so there is no translation
  // channel for it at all — it is re-read straight from the source CV's
  // own rows, never trusted from the client payload.
  const sourceEducationRows = await db
    .select()
    .from(education)
    .where(eq(education.cvId, sourceCvId))
  const finalEducation: EducationItem[] = sourceEducationRows.map((row) => ({
    id: row.id,
    institution: row.institution,
    degree: row.degree,
    startDate: row.startDate,
    endDate: row.endDate,
  }))

  // Achievements and references: no translation channel and no review UI,
  // so every source row is carried through verbatim — same reasoning as
  // `createCvFromAdaptation`.
  const [sourceAchievementRows, sourceReferenceRows] = await Promise.all([
    db.select().from(achievement).where(eq(achievement.cvId, sourceCvId)),
    db.select().from(reference).where(eq(reference.cvId, sourceCvId)),
  ])

  const finalDraft: CvData = {
    ...draft,
    education: finalEducation,
    achievements: sourceAchievementRows.map((row) => ({
      id: row.id,
      title: row.title,
      issuer: row.issuer,
      date: row.date,
      description: row.description,
    })),
    references: sourceReferenceRows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      company: row.company,
      email: row.email,
      phone: row.phone,
    })),
  }

  const id = createId()
  const finalTitle = title.trim() || DEFAULT_TRANSLATED_CV_TITLE

  const queries: BatchItem<"pg">[] = [
    db.insert(cv).values({
      id,
      userId,
      title: finalTitle,
      // D11: contact fields come from the ownership-verified source row,
      // never from the client payload — translation never touches PII
      // (spec: excluded fields).
      fullName: owned.fullName,
      email: owned.email,
      phone: owned.phone,
      location: owned.location,
      summary: draft.summary ?? null,
    }),
    ...buildCvSectionQueries(id, finalDraft),
  ]

  await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]])

  return { ok: true, data: { id } }
}
