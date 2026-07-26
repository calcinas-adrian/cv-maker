"use server"

import { headers } from "next/headers"
import { APICallError, NoObjectGeneratedError, RetryError } from "ai"
import { createId } from "@paralleldrive/cuid2"
import type { BatchItem } from "drizzle-orm/batch"
import { auth } from "@/lib/auth"
import { db } from "@/db"
import { cv } from "@/db/schema"
import { getConfiguredModelForUser } from "@/lib/ai/get-user-model"
import { inferCvLanguage } from "@/lib/ai/infer-language"
import type { Result } from "@/lib/result"
import { buildCvSectionQueries } from "@/features/cv/persist-sections"
import { cvDraftSchema, type CvData } from "@/schemas/cv.schema"
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

/**
 * Same fix as `features/ai-providers/actions.ts`'s `unwrapRetryError` /
 * `features/github-import/actions.ts`'s copy of it: `generateObject`'s
 * `maxRetries` wraps the real provider failure in a `RetryError` once
 * retries are exhausted, so `APICallError.isInstance` must be checked
 * against the unwrapped `.lastError` — checking it against the raw caught
 * error would silently fall through to the generic message below for
 * every retried failure.
 */
function unwrapRetryError(err: unknown): unknown {
  return RetryError.isInstance(err) ? err.lastError : err
}

function translateAiError(err: unknown): string {
  const cause = unwrapRetryError(err)
  if (APICallError.isInstance(cause)) {
    if (cause.statusCode === 401 || cause.statusCode === 403) {
      return "El proveedor de IA rechazó la clave configurada: revisala en Ajustes."
    }
    if (cause.statusCode === 429) {
      return "El proveedor de IA devolvió un límite de uso (429). Probá de nuevo en un momento."
    }
    return `El proveedor de IA devolvió un error${cause.statusCode ? ` (${cause.statusCode})` : ""}.`
  }
  if (NoObjectGeneratedError.isInstance(cause)) {
    return "El modelo no devolvió un resultado válido. Probá de nuevo."
  }
  console.error(
    "AI CV extraction failed",
    cause instanceof Error ? cause.message : "unknown error",
  )
  return "No se pudo extraer el CV con IA. Probá de nuevo."
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
    return { ok: false, error: translateAiError(err), code: "provider_error" }
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
 * Creates a brand new `cv` row from a reviewed AI extraction and seeds its
 * child sections in the same batched insert `saveDraft` uses
 * (`buildCvSectionQueries` in `features/cv/actions.ts`) — no second copy of
 * that upsert logic lives here.
 *
 * `reviewed` is typed `unknown` at the boundary and re-validated with
 * `cvDraftSchema` here, same discipline as `saveDraft`'s own `input:
 * unknown` — a value crossing the server-action wire from a client
 * component is never trusted just because the client-side TypeScript type
 * (`CvImportReview`) says it's shaped correctly.
 */
export async function createCvFromImport(
  reviewed: unknown,
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
  const data = parsed.data

  const id = createId()
  const title = data.fullName?.trim()
    ? `CV de ${data.fullName.trim()}`
    : "CV importado"

  const queries: BatchItem<"pg">[] = [
    db.insert(cv).values({
      id,
      userId,
      title,
      fullName: data.fullName ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      location: data.location ?? null,
      summary: data.summary ?? null,
    }),
    ...buildCvSectionQueries(id, data),
  ]

  await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]])

  return { ok: true, data: { id } }
}
