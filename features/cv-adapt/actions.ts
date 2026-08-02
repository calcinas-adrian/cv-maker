"use server"

import { APICallError, type LanguageModel } from "ai"
import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import type { BatchItem } from "drizzle-orm/batch"
import { db } from "@/db"
import {
  adaptation,
  bankCredential,
  bankEducation,
  bankLanguage,
  cv,
  cvCredential,
  cvEducation,
  cvLanguage,
  cvReference,
} from "@/db/schema"
import { findPersonalBank } from "@/features/career-bank/ownership"
import { getSessionUserId, findOwnedCv } from "@/features/cv/ownership"
import { getCvDraft } from "@/features/cv/actions"
import {
  buildCvSectionQueries,
  flattenSectionBatch,
} from "@/features/cv/persist-sections"
import { resolveModelForUser } from "@/lib/ai/get-user-model"
import { inferCvLanguage } from "@/lib/ai/infer-language"
import { translateAiError, unwrapRetryError } from "@/lib/ai/errors"
import type { Result } from "@/lib/result"
import type {
  CredentialKind,
  CvData,
  EducationItem,
  LanguageItem,
} from "@/schemas/cv.schema"
import {
  bankAdaptReviewSchema,
  cvAdaptReviewSchema,
  type CvAdapt,
} from "@/schemas/cv-adapt.schema"
import {
  buildMaterialCorpus,
  type CorpusSummary,
} from "./build-material-corpus"
import { adaptCvForJobPosting } from "./ai-extract"
import {
  DEFAULT_ADAPTED_CV_TITLE,
  EMPTY_BANK_ERROR,
  MAX_ADAPTATION_NOTES_CHARS,
  JOB_POSTING_TOO_LONG_ERROR,
  JOB_POSTING_TOO_SHORT_ERROR,
  MAX_JOB_POSTING_CHARS,
  MIN_JOB_POSTING_CHARS,
} from "./constants"

/**
 * The job-posting length rule, in one place.
 *
 * Both origins (CV and bank) enforce it on BOTH of their calls — extract and
 * persist — because `jobPostingText` is client-owned data on each, so an
 * oversized blob must not reach the DB by skipping the extract action and
 * calling the create action directly. Four call sites, one rule; before this
 * helper existed the same twelve lines were pasted at each.
 *
 * Not exported: this file has a top-level `"use server"` directive, and
 * every export of such a module must be an async server action.
 */
function postingLengthError(
  posting: string,
): { ok: false; error: string; code: "invalid_input" } | null {
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
  return null
}

/**
 * The provider call plus its error discipline, shared by both adapt origins.
 *
 * The logging rule is the reason this is shared rather than duplicated: only
 * a minimal, safe subset is ever logged — never the raw error object (it can
 * carry `requestBodyValues`/`responseBody`) and never the api key. A second
 * copy of this block is a second chance to get that wrong. Same discipline
 * as `features/cv-import/actions.ts`'s `extractCvFromFile`.
 */
async function runAdaptation(
  model: LanguageModel,
  posting: string,
  careerMaterialText: string,
): Promise<Result<CvAdapt>> {
  try {
    const adapted = await adaptCvForJobPosting(
      model,
      { jobPostingText: posting, careerMaterialText },
      { cvLanguage: inferCvLanguage(posting) },
    )
    return { ok: true, data: adapted }
  } catch (err) {
    const cause = unwrapRetryError(err)
    console.error(
      "AI CV adaptation failed",
      typeof model === "string" ? model : model.provider,
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
  const lengthError = postingLengthError(posting)
  if (lengthError) return lengthError

  // `cvId` comes from the client and is never trusted alone.
  const owned = await findOwnedCv(cvId, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const draft = await getCvDraft(cvId)
  if (!draft.ok) return draft

  const corpus = await buildMaterialCorpus(userId, draft.data)

  const modelResult = await resolveModelForUser(userId, providerModelId)
  if (!modelResult.ok) return modelResult

  const adapted = await runAdaptation(
    modelResult.data.model,
    posting,
    corpus.text,
  )
  if (!adapted.ok) return adapted

  return {
    ok: true,
    data: {
      adapted: adapted.data,
      corpus: {
        includedCount: corpus.includedCount,
        totalCount: corpus.totalCount,
        capReached: corpus.capReached,
      },
      sourceEducation: draft.data.education,
    },
  }
}

/**
 * Runs the AI adaptation for a job posting against the BANK, with no source
 * CV at all — the AI half of `architecture/bank-produces-cv`.
 *
 * Persists nothing, same as `adaptCvForPosting`: the review dialog shows
 * this to the user, who edits and excludes before
 * `createCvFromBankAdaptation` touches the database.
 *
 * `bankEducation` is echoed back for exactly the reason `sourceEducation` is
 * on the CV path — per D14 `cvAdaptSchema` has no `education` field, so the
 * review dialog has no other way to render education as include/exclude
 * items. The ids travelling here are the real `bank_education` row ids,
 * because that is what the create action uses to decide which of the user's
 * own rows to carry through verbatim; it never trusts the row's textual
 * content from the client payload.
 *
 * An empty corpus is rejected BEFORE the provider call. A model asked to
 * tailor a CV from no material does not fail — it invents one, which is the
 * single worst thing this app could do. Structurally refusing to make the
 * call is the only reliable guard; a prompt instruction is a request.
 */
export async function adaptBankForPosting(
  jobPostingText: string,
  providerModelId?: string,
): Promise<
  Result<{
    adapted: CvAdapt
    corpus: CorpusSummary
    bankEducation: EducationItem[]
  }>
> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const posting = jobPostingText.trim()
  const lengthError = postingLengthError(posting)
  if (lengthError) return lengthError

  // Read-only: adapting must not mint a bank, for the same reason a file
  // upload must not (Decision 8). No bank means no material, which this
  // action cannot do anything useful with.
  const bankRow = await findPersonalBank(userId)
  if (!bankRow) {
    return { ok: false, error: EMPTY_BANK_ERROR, code: "not_found" }
  }

  const corpus = await buildMaterialCorpus(userId, null)
  if (corpus.totalCount === 0) {
    return { ok: false, error: EMPTY_BANK_ERROR, code: "invalid_input" }
  }

  const modelResult = await resolveModelForUser(userId, providerModelId)
  if (!modelResult.ok) return modelResult

  const adapted = await runAdaptation(
    modelResult.data.model,
    posting,
    corpus.text,
  )
  if (!adapted.ok) return adapted

  const educationRows = await db
    .select()
    .from(bankEducation)
    .where(
      and(
        eq(bankEducation.bankId, bankRow.id),
        isNull(bankEducation.deletedAt),
      ),
    )
    .orderBy(asc(bankEducation.sortOrder))

  return {
    ok: true,
    data: {
      adapted: adapted.data,
      corpus: {
        includedCount: corpus.includedCount,
        totalCount: corpus.totalCount,
        capReached: corpus.capReached,
      },
      bankEducation: educationRows.map((row) => ({
        id: row.id,
        institution: row.institution,
        degree: row.degree,
        startDate: row.startDate,
        endDate: row.endDate,
      })),
    },
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

  // Same caps as the extract path — see `postingLengthError`.
  const posting = jobPostingText.trim()
  const lengthError = postingLengthError(posting)
  if (lengthError) return lengthError

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
    .from(cvEducation)
    .where(eq(cvEducation.cvId, sourceCvId))
  const finalEducation: EducationItem[] = sourceEducationRows
    .filter((row) => includedEducationIds.has(row.id))
    .map((row) => ({
      id: row.id,
      institution: row.institution,
      degree: row.degree,
      startDate: row.startDate,
      endDate: row.endDate,
    }))

  // Credentials, languages and references get the D14 treatment too, but
  // stricter: they have no AI channel AND no review checklist, so nothing
  // about them is read from the client payload at all — not even which rows
  // to keep. Every source row is carried through verbatim.
  //
  // Carried rather than dropped because they are FACTS about the person
  // (an award you won, a language you speak, someone who vouches for you),
  // not job-posting-dependent content — the same reasoning that keeps
  // `education`. Dropping them would make "adapt this CV" silently destroy
  // data the user cannot get back from the new CV. `languages` was
  // discovered missing this treatment during batch 4 of the career-bank
  // restructure (the review dialog has no language channel either, so the
  // client always sends `languages: []`) — fixed here alongside the corpus
  // rebuild.
  const [sourceCredentialRows, sourceLanguageRows, sourceReferenceRows] =
    await Promise.all([
      db.select().from(cvCredential).where(eq(cvCredential.cvId, sourceCvId)),
      db.select().from(cvLanguage).where(eq(cvLanguage.cvId, sourceCvId)),
      db.select().from(cvReference).where(eq(cvReference.cvId, sourceCvId)),
    ])

  const finalDraft: CvData = {
    ...draft,
    education: finalEducation,
    credentials: sourceCredentialRows.map((row) => ({
      id: row.id,
      kind: row.kind as CredentialKind,
      name: row.name,
      issuer: row.issuer,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      credentialId: row.credentialId,
      credentialUrl: row.credentialUrl,
      description: row.description,
    })),
    languages: sourceLanguageRows.map((row): LanguageItem => ({
      id: row.id,
      name: row.name,
      level: row.level,
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
      linkedinUrl: owned.linkedinUrl,
      websiteUrl: owned.websiteUrl,
      summary: draft.summary ?? null, // D12: AI-tailored, user-editable
    }),
    ...flattenSectionBatch(buildCvSectionQueries(id, finalDraft)),
    // Last: FK `cvId` (the just-inserted row, guaranteed to exist by
    // statement order). `bankId` carries the SOURCE cv's own bank forward —
    // since the bank restructure, adaptation reads ONLY the bank (no
    // sibling-CV corpus), so there is no `sourceCvId` to record anymore;
    // see `architecture/adaptation-corpus-scope` and `db/schema.ts`'s note
    // on the `adaptation` table.
    db.insert(adaptation).values({
      id: createId(),
      cvId: id,
      bankId: owned.bankId,
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
 * Persists a reviewed bank-origin adaptation as a brand new `cv` row — the
 * counterpart to `createCvFromAdaptation` for the path that had no source CV
 * (`architecture/bank-produces-cv`).
 *
 * The guarantees are the same ones, re-anchored on the bank:
 *
 * - **D11 (contact fields)**: read from the resolved `bank` row, never from
 *   the model and never from the client payload. The `bank` table carries
 *   the same columns the `cv` row does precisely so this path does not have
 *   to weaken the rule (see `architecture/bank-multiplicity-ui` on why
 *   `full_name` was kept).
 * - **D14 (education)**: `draft.education` is trusted ONLY for WHICH ids the
 *   user left checked; the values are re-read from `bank_education`.
 * - **D14, stricter (credentials, languages)**: no AI channel and no review
 *   checklist, so nothing about them is read from the payload at all — every
 *   live bank row is carried through verbatim. They are facts about the
 *   person, not posting-dependent content.
 * - **References**: structurally none. `cv_reference` has no bank
 *   counterpart by design (resolution 8) — that is what keeps referees out
 *   of the AI corpus by construction. The user adds them in the editor.
 */
export async function createCvFromBankAdaptation(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = bankAdaptReviewSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de adaptación inválidos",
      code: "invalid_input",
    }
  }

  const { title, jobPostingText, adaptationNotes, draft } = parsed.data

  const posting = jobPostingText.trim()
  const lengthError = postingLengthError(posting)
  if (lengthError) return lengthError

  const bankRow = await findPersonalBank(userId)
  if (!bankRow) {
    return { ok: false, error: EMPTY_BANK_ERROR, code: "not_found" }
  }

  const includedEducationIds = draft.education.map((item) => item.id)

  const [educationRows, credentialRows, languageRows] = await Promise.all([
    includedEducationIds.length
      ? db
          .select()
          .from(bankEducation)
          .where(
            and(
              eq(bankEducation.bankId, bankRow.id),
              isNull(bankEducation.deletedAt),
              inArray(bankEducation.id, includedEducationIds),
            ),
          )
          .orderBy(asc(bankEducation.sortOrder))
      : Promise.resolve([]),
    db
      .select()
      .from(bankCredential)
      .where(
        and(
          eq(bankCredential.bankId, bankRow.id),
          isNull(bankCredential.deletedAt),
        ),
      )
      .orderBy(asc(bankCredential.sortOrder)),
    db
      .select()
      .from(bankLanguage)
      .where(
        and(
          eq(bankLanguage.bankId, bankRow.id),
          isNull(bankLanguage.deletedAt),
        ),
      )
      .orderBy(asc(bankLanguage.sortOrder)),
  ])

  const finalDraft: CvData = {
    ...draft,
    education: educationRows.map((row): EducationItem => ({
      id: row.id,
      institution: row.institution,
      degree: row.degree,
      startDate: row.startDate,
      endDate: row.endDate,
    })),
    credentials: credentialRows.map((row) => ({
      id: row.id,
      kind: row.kind as CredentialKind,
      name: row.name,
      issuer: row.issuer,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      credentialId: row.credentialId,
      credentialUrl: row.credentialUrl,
      description: row.description,
    })),
    languages: languageRows.map((row): LanguageItem => ({
      id: row.id,
      name: row.name,
      level: row.level,
    })),
    references: [],
  }

  const id = createId()
  const finalTitle = title.trim() || DEFAULT_ADAPTED_CV_TITLE

  const queries: BatchItem<"pg">[] = [
    db.insert(cv).values({
      id,
      userId,
      bankId: bankRow.id,
      title: finalTitle,
      // D11 — from the bank row. `fullName` falls back to `name` for the
      // implicit personal bank, where the two coincide and only `name` is
      // guaranteed non-null (`db/schema.ts`).
      fullName: bankRow.fullName ?? bankRow.name,
      email: bankRow.email,
      phone: bankRow.phone,
      location: bankRow.location,
      linkedinUrl: bankRow.linkedinUrl,
      websiteUrl: bankRow.websiteUrl,
      summary: draft.summary ?? null, // D12: AI-tailored, user-editable
    }),
    ...flattenSectionBatch(buildCvSectionQueries(id, finalDraft)),
    db.insert(adaptation).values({
      id: createId(),
      cvId: id,
      bankId: bankRow.id,
      jobPostingText: posting,
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
 * posting. Same rule `findOwnedCv` enforces for CVs; `adaptation` has no
 * `userId` of its own to check directly.
 */
export async function getAdaptationPosting(
  adaptationId: string,
): Promise<Result<{ jobPostingText: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const [row] = await db
    .select({ jobPostingText: adaptation.jobPostingText })
    .from(adaptation)
    .innerJoin(
      cv,
      and(
        eq(cv.id, adaptation.cvId),
        eq(cv.userId, userId),
        isNull(cv.deletedAt),
      ),
    )
    .where(eq(adaptation.id, adaptationId))
    .limit(1)

  if (!row) return { ok: false, error: "No encontrado", code: "not_found" }

  return { ok: true, data: { jobPostingText: row.jobPostingText } }
}
