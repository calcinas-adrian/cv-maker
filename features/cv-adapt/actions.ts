"use server"

import { APICallError } from "ai"
import { and, eq, isNull } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import type { BatchItem } from "drizzle-orm/batch"
import { db } from "@/db"
import {
  achievement,
  cv,
  cvAdaptation,
  education,
  reference,
} from "@/db/schema"
import { getSessionUserId, findOwnedCv } from "@/features/cv/ownership"
import { getCvDraft } from "@/features/cv/actions"
import { buildCvSectionQueries } from "@/features/cv/persist-sections"
import { resolveModelForUser } from "@/lib/ai/get-user-model"
import { inferCvLanguage } from "@/lib/ai/infer-language"
import { translateAiError, unwrapRetryError } from "@/lib/ai/errors"
import type { Result } from "@/lib/result"
import type { CvData, EducationItem } from "@/schemas/cv.schema"
import { cvAdaptReviewSchema, type CvAdapt } from "@/schemas/cv-adapt.schema"
import {
  buildMaterialCorpus,
  type CorpusSummary,
} from "./build-material-corpus"
import { adaptCvForJobPosting } from "./ai-extract"
import {
  DEFAULT_ADAPTED_CV_TITLE,
  MAX_ADAPTATION_NOTES_CHARS,
  JOB_POSTING_TOO_LONG_ERROR,
  JOB_POSTING_TOO_SHORT_ERROR,
  MAX_JOB_POSTING_CHARS,
  MIN_JOB_POSTING_CHARS,
} from "./constants"

/**
 * Runs the AI adaptation for a job posting against one of the user's own
 * CVs. Persists NOTHING — the caller (the review dialog) shows this result
 * to the user, who edits/excludes items before `createCvFromAdaptation`
 * ever touches the database. Mirrors `features/cv-import/actions.ts`'s
 * `extractCvFromFile`.
 *
 * `sourceEducation` is echoed back alongside the AI output (a deliberate,
 * necessary addition to the shape sketched in the design): per D14,
 * `cvAdaptSchema` has no `education` field at all, so the review dialog has
 * no other way to get the source CV's own education rows to render as
 * include/exclude items. This is safe to echo — it's the user's own
 * already-persisted data, not model output, so there's no fabrication risk
 * in sending it back to them.
 */
export async function adaptCvForPosting(
  cvId: string,
  jobPostingText: string,
  // Optional: the model the user picked in the dialog for THIS run. Omitted
  // means "use my default". Ownership is enforced inside
  // `resolveModelForUser` by joining the model back to its credential's
  // `userId`, so a tampered id resolves to nothing rather than running
  // against someone else's key.
  providerModelId?: string,
): Promise<
  Result<{
    adapted: CvAdapt
    corpus: CorpusSummary
    sourceEducation: EducationItem[]
  }>
> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  // Caps enforced BEFORE any ownership lookup or provider call — the user
  // pasted this text and can trim it themselves; rejecting late would waste
  // a DB round trip and, worse, a paid provider call.
  const posting = jobPostingText.trim()
  if (posting.length < MIN_JOB_POSTING_CHARS) {
    return {
      ok: false,
      error: JOB_POSTING_TOO_SHORT_ERROR,
      code: "invalid_input",
    }
  }
  if (posting.length > MAX_JOB_POSTING_CHARS) {
    return {
      ok: false,
      error: JOB_POSTING_TOO_LONG_ERROR,
      code: "invalid_input",
    }
  }

  // `cvId` comes from the client and is never trusted alone.
  const owned = await findOwnedCv(cvId, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const draft = await getCvDraft(cvId)
  if (!draft.ok) return draft

  const corpus = await buildMaterialCorpus(userId, cvId, draft.data)

  const modelResult = await resolveModelForUser(userId, providerModelId)
  if (!modelResult.ok) return modelResult

  try {
    const adapted = await adaptCvForJobPosting(
      modelResult.data.model,
      { jobPostingText: posting, careerMaterialText: corpus.text },
      { cvLanguage: inferCvLanguage(posting) },
    )
    return {
      ok: true,
      data: {
        adapted,
        corpus: {
          includedCount: corpus.includedCount,
          totalCount: corpus.totalCount,
          capReached: corpus.capReached,
        },
        sourceEducation: draft.data.education,
      },
    }
  } catch (err) {
    // Log only a minimal, safe subset — never the raw error object (it can
    // carry `requestBodyValues`/`responseBody`) and never the api key. Same
    // discipline as `features/cv-import/actions.ts`'s `extractCvFromFile`.
    const cause = unwrapRetryError(err)
    console.error(
      "AI CV adaptation failed",
      typeof modelResult.data.model === "string"
        ? modelResult.data.model
        : modelResult.data.model.provider,
      APICallError.isInstance(cause)
        ? cause.statusCode
        : cause instanceof Error
          ? cause.message
          : "unknown error",
    )
    return {
      ok: false,
      error: translateAiError(err, {
        logLabel: "AI CV adaptation failed",
        fallback: "No se pudo adaptar el CV con IA. Probá de nuevo.",
      }),
      code: "provider_error",
    }
  }
}

/**
 * Persists a reviewed-and-confirmed adaptation as a brand new `cv` row, in
 * one `db.batch` (see design section 6 for the full FK-ordering rationale;
 * `neon-http` has no real transaction support — `db.transaction` throws —
 * so `db.batch`, executed by Neon as a single implicit transaction over one
 * HTTP round trip, is the only atomic unit available).
 */
export async function createCvFromAdaptation(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = cvAdaptReviewSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de adaptación inválidos",
      code: "invalid_input",
    }
  }

  const { sourceCvId, title, jobPostingText, adaptationNotes, draft } =
    parsed.data

  // Same caps as the extract path: `jobPostingText` is client-owned data on
  // BOTH calls, so an oversized blob must not reach the DB by skipping the
  // extract action and calling this one directly.
  const posting = jobPostingText.trim()
  if (posting.length < MIN_JOB_POSTING_CHARS) {
    return {
      ok: false,
      error: JOB_POSTING_TOO_SHORT_ERROR,
      code: "invalid_input",
    }
  }
  if (posting.length > MAX_JOB_POSTING_CHARS) {
    return {
      ok: false,
      error: JOB_POSTING_TOO_LONG_ERROR,
      code: "invalid_input",
    }
  }

  // `sourceCvId` comes from the client and is never trusted alone.
  const owned = await findOwnedCv(sourceCvId, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  // D14: `education` has no AI output channel, so `draft.education` as sent
  // by the client is trusted ONLY for WHICH rows (`id`) the user chose to
  // keep — the actual field values (institution/degree/dates) are re-read
  // straight from the source CV's own rows below, never from the client
  // payload. Same structural guarantee D11 applies to contact fields: a
  // missing/overridden channel is a guarantee, a prompt instruction is only
  // a request.
  const includedEducationIds = new Set(draft.education.map((e) => e.id))
  const sourceEducationRows = await db
    .select()
    .from(education)
    .where(eq(education.cvId, sourceCvId))
  const finalEducation: EducationItem[] = sourceEducationRows
    .filter((row) => includedEducationIds.has(row.id))
    .map((row) => ({
      id: row.id,
      institution: row.institution,
      degree: row.degree,
      startDate: row.startDate,
      endDate: row.endDate,
    }))

  // Achievements and references get the D14 treatment too, but stricter:
  // they have no AI channel AND no review checklist, so nothing about them
  // is read from the client payload at all — not even which rows to keep.
  // Every source row is carried through verbatim.
  //
  // Carried rather than dropped because they are FACTS about the person
  // (an award you won, someone who vouches for you), not job-posting-
  // dependent content — the same reasoning that keeps `education`. Dropping
  // them would make "adapt this CV" silently destroy data the user cannot
  // get back from the new CV.
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
  const finalTitle = title.trim() || DEFAULT_ADAPTED_CV_TITLE

  const queries: BatchItem<"pg">[] = [
    db.insert(cv).values({
      id,
      userId,
      title: finalTitle,
      // D11: contact fields come from the source row, never from the model
      // and never from the client payload.
      fullName: owned.fullName,
      email: owned.email,
      phone: owned.phone,
      location: owned.location,
      summary: draft.summary ?? null, // D12: AI-tailored, user-editable
    }),
    ...buildCvSectionQueries(id, finalDraft),
    // Last: FKs `cvId` (the just-inserted row, guaranteed to exist by
    // statement order) and `sourceCvId` (already proven to exist via
    // `findOwnedCv` above). Provenance can never outlive a failed content
    // write.
    db.insert(cvAdaptation).values({
      id: createId(),
      cvId: id,
      sourceCvId,
      jobPostingText: posting,
      // Truncated, never rejected — see `MAX_ADAPTATION_NOTES_CHARS`. Empty
      // notes are stored as NULL rather than `''`: the column means "what
      // the model explained about this adaptation", and having nothing to
      // say is genuinely the absence of a value.
      adaptationNotes:
        adaptationNotes.trim().slice(0, MAX_ADAPTATION_NOTES_CHARS) || null,
    }),
  ]

  await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]])

  return { ok: true, data: { id } }
}

/**
 * Fetches ONE stored job posting in full, for the application-history page's
 * expand affordance.
 *
 * Exists so `listUserAdaptations` can ship a short preview instead of every
 * posting in full: at 12k characters each, a person with fifty adaptations
 * would otherwise download most of a megabyte of text to read the handful of
 * lines the page actually renders. The trade is one round trip per expand,
 * paid only by the rows someone opens.
 *
 * `adaptationId` comes from the client and is never trusted alone — the join
 * to `cv` scopes the row to the session's own, still-live CVs, so an id
 * belonging to somebody else resolves to nothing rather than to their
 * posting. Same rule `findOwnedCv` enforces for CVs; `cv_adaptation` has no
 * `userId` of its own to check directly.
 */
export async function getAdaptationPosting(
  adaptationId: string,
): Promise<Result<{ jobPostingText: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const [row] = await db
    .select({ jobPostingText: cvAdaptation.jobPostingText })
    .from(cvAdaptation)
    .innerJoin(
      cv,
      and(
        eq(cv.id, cvAdaptation.cvId),
        eq(cv.userId, userId),
        isNull(cv.deletedAt),
      ),
    )
    .where(eq(cvAdaptation.id, adaptationId))
    .limit(1)

  if (!row) return { ok: false, error: "No encontrado", code: "not_found" }

  return { ok: true, data: { jobPostingText: row.jobPostingText } }
}
