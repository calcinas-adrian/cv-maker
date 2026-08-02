"use server"

import { headers } from "next/headers"
import { APICallError } from "ai"
import { createId } from "@paralleldrive/cuid2"
import type { BatchItem } from "drizzle-orm/batch"
import { auth } from "@/lib/auth"
import { db } from "@/db"
import { cv } from "@/db/schema"
import { getConfiguredModelForUser } from "@/lib/ai/get-user-model"
import { inferCvLanguage } from "@/lib/ai/infer-language"
import { translateAiError, unwrapRetryError } from "@/lib/ai/errors"
import type { Result } from "@/lib/result"
import {
  buildCvSectionQueries,
  flattenSectionBatch,
} from "@/features/cv/persist-sections"
import { findPersonalBank } from "@/features/career-bank/ownership"
import {
  buildBankMaterialQueries,
  flattenBankImportBatch,
} from "@/features/career-bank/build-bank-queries"
import { importDestinationSchema } from "@/schemas/bank.schema"
import { cvDraftSchema, type CvData, type CvBullet } from "@/schemas/cv.schema"
import type { CvImportExtract } from "@/schemas/cv-import.schema"
import { extractTextFromFile } from "./parse-document"
import { extractCvFromDocumentText } from "./ai-extract"
import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_MIME_TYPES,
  FILE_TOO_LARGE_ERROR,
  MAX_FILE_SIZE_BYTES,
  UNSUPPORTED_FILE_TYPE_ERROR,
} from "./constants"

async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user.id ?? null
}

function hasAcceptedExtension(filename: string): boolean {
  const lower = filename.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function hasAcceptedMimeType(mimeType: string): boolean {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType)
}

/**
 * Extracts a full CV draft from an uploaded resume file (PDF or DOCX) via
 * the user's own configured AI provider key. Nothing is persisted here —
 * mirrors `features/github-import/actions.ts`'s `extractFromRepo` (né
 * `extractProjectFromRepo`): the caller (the review dialog) only shows
 * this to the user, who edits/
 * excludes items before `createCvFromImport` ever touches the database.
 *
 * Next.js Server Actions accept a `File` inside `FormData` args directly
 * (confirmed still true for the installed `next@16.2.10` — Server Actions'
 * action-handler multipart-parses the request body and hands back real
 * `File`/`Blob` values for file fields, not just strings), so this takes
 * `FormData` rather than a plain object the way every other action here
 * does — there is no other way to get file bytes across the server-action
 * boundary.
 */
export async function extractCvFromFile(
  formData: FormData,
): Promise<Result<CvImportExtract>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const file = formData.get("file")
  if (!(file instanceof File)) {
    return {
      ok: false,
      error: "No se recibió ningún archivo.",
      code: "file_error",
    }
  }

  if (!hasAcceptedMimeType(file.type) && !hasAcceptedExtension(file.name)) {
    return { ok: false, error: UNSUPPORTED_FILE_TYPE_ERROR, code: "file_error" }
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: FILE_TOO_LARGE_ERROR, code: "file_error" }
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const textResult = await extractTextFromFile(buffer, file.type, file.name)
  if (!textResult.ok) return textResult

  const modelResult = await getConfiguredModelForUser(userId)
  if (!modelResult.ok) return modelResult

  try {
    const extracted = await extractCvFromDocumentText(
      modelResult.data.model,
      textResult.data,
      { cvLanguage: inferCvLanguage(textResult.data) },
    )
    return { ok: true, data: extracted }
  } catch (err) {
    // Log only a minimal, safe subset — never the raw error object (it can
    // carry `requestBodyValues`/`responseBody`) and never the api key. Same
    // discipline as `features/ai-providers/actions.ts`'s
    // `validateProviderKey`.
    const cause = unwrapRetryError(err)
    console.error(
      "AI CV extraction from file failed",
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
        logLabel: "AI CV extraction failed",
        fallback: "No se pudo extraer el CV con IA. Probá de nuevo.",
      }),
      code: "provider_error",
    }
  }
}

/**
 * The reviewed-and-confirmed shape `createCvFromImport` accepts: the same
 * `CvData` contract every other cv action reads/writes, produced by the
 * review dialog after the user edits the extracted basic info and
 * checks/unchecks which extracted items to keep (see
 * `features/cv-import/import-from-file-dialog.tsx`). Item ids are assigned
 * client-side (`crypto.randomUUID()`, same as the GitHub-import dialog's
 * `addProject` call) purely so the dialog's checkbox list has stable React
 * keys — `buildCvSectionQueries` below always mints its own fresh ids on
 * insert, so those client-side ids are never actually persisted.
 */
export type CvImportReview = CvData

/**
 * Mints bank rows for every experience/project with bullets — one
 * `bank_engagement` (reused if a live one matches) + one `bank_material` +
 * default `bank_material_variant` per bullet, labeled `importado:
 * {fileName}` — and returns a NEW `CvData` with each promoted bullet's
 * `sourceMaterialId` stamped in, plus the flattened bank batch to fold into
 * the SAME `db.batch` the cv insert below runs in. Unlike the GitHub import
 * path (which cannot be atomic — see `features/github-import/actions.ts`),
 * PDF import writes everything in one implicit transaction, so there is no
 * separate "promote" server action here: this is inlined directly into
 * `createCvFromImport`.
 */
async function stampBankProvenance(
  bankId: string,
  data: CvData,
  fileName: string,
): Promise<{ data: CvData; queries: BatchItem<"pg">[] }> {
  const label = `importado: ${fileName}`
  const queries: BatchItem<"pg">[] = []

  const experiences: CvData["experiences"] = []
  for (const experience of data.experiences) {
    if (experience.bullets.length === 0) {
      experiences.push(experience)
      continue
    }
    const { batch, materialIds } = await buildBankMaterialQueries({
      bankId,
      engagement: {
        kind: "job",
        organization: experience.company ?? "",
        role: experience.role ?? "",
        startDate: experience.startDate ?? null,
        endDate: experience.endDate ?? null,
      },
      bullets: experience.bullets.map((bullet) => ({
        content: bullet.content,
        label,
      })),
    })
    queries.push(...flattenBankImportBatch(batch))
    experiences.push({
      ...experience,
      bullets: experience.bullets.map((bullet, index): CvBullet => ({
        ...bullet,
        sourceMaterialId: materialIds[index] ?? null,
      })),
    })
  }

  const projects: CvData["projects"] = []
  for (const project of data.projects) {
    if (project.bullets.length === 0) {
      projects.push(project)
      continue
    }
    const { batch, materialIds } = await buildBankMaterialQueries({
      bankId,
      engagement: {
        kind: "project",
        name: project.name ?? "",
        url: project.url ?? null,
        description: project.description ?? null,
      },
      bullets: project.bullets.map((bullet) => ({
        content: bullet.content,
        label,
      })),
    })
    queries.push(...flattenBankImportBatch(batch))
    projects.push({
      ...project,
      bullets: project.bullets.map((bullet, index): CvBullet => ({
        ...bullet,
        sourceMaterialId: materialIds[index] ?? null,
      })),
    })
  }

  return { data: { ...data, experiences, projects }, queries }
}

/**
 * Creates a brand new `cv` row from a reviewed AI extraction and seeds its
 * child sections in the same batched insert `saveDraft` uses
 * (`buildCvSectionQueries` in `features/cv/actions.ts`) — no second copy of
 * that upsert logic lives here.
 *
 * `reviewed` is typed `unknown` at the boundary and re-validated with
 * `cvDraftSchema` here, same discipline as `saveDraft`'s own `input:
 * unknown` — a value crossing the server-action wire from a client
 * component is never trusted just because the client-side TypeScript type
 * (`CvImportReview`) says it's shaped correctly. `destination` is `unknown`
 * for the same reason.
 *
 * `fileName` is ONLY used for the bank branch's variant label (`importado:
 * {fileName}`, mirroring GitHub import's `importado: github:{owner}/
 * {repo}`) — never persisted anywhere else, never trusted for anything
 * beyond a human-readable provenance note.
 *
 * Bank branch (Decision 8): resolves the caller's live personal bank via
 * `findPersonalBank` (read-only — a file upload MUST NOT silently mint a
 * bank the user never asked to create, spec: "CV with no bank"). No live
 * bank ⇒ falls back to CV-only exactly as if the user had picked it
 * explicitly; `cv.bank_id` stays null.
 */
export async function createCvFromImport(
  reviewed: unknown,
  destination: unknown,
  fileName: string,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = cvDraftSchema.safeParse(reviewed)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de importación inválidos",
      code: "invalid_input",
    }
  }
  let data = parsed.data

  // Fail-safe default: an unparseable destination never silently writes to
  // the bank.
  const destinationParsed = importDestinationSchema.safeParse(destination)
  const wantsBank =
    destinationParsed.success && destinationParsed.data === "bank"

  const id = createId()
  const title = data.fullName?.trim()
    ? `CV de ${data.fullName.trim()}`
    : "CV importado"

  let bankId: string | null = null
  let bankQueries: BatchItem<"pg">[] = []

  if (wantsBank) {
    const personalBank = await findPersonalBank(userId)
    if (personalBank) {
      bankId = personalBank.id
      const stamped = await stampBankProvenance(
        personalBank.id,
        data,
        fileName.trim() || "archivo",
      )
      data = stamped.data
      bankQueries = stamped.queries
    }
  }

  const queries: BatchItem<"pg">[] = [
    db.insert(cv).values({
      id,
      userId,
      bankId,
      title,
      fullName: data.fullName ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      location: data.location ?? null,
      linkedinUrl: data.linkedinUrl ?? null,
      websiteUrl: data.websiteUrl ?? null,
      summary: data.summary ?? null,
    }),
    ...bankQueries,
    ...flattenSectionBatch(buildCvSectionQueries(id, data)),
  ]

  await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]])

  return { ok: true, data: { id } }
}
