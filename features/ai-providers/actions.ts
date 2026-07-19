"use server"

import { headers } from "next/headers"
import { and, desc, eq } from "drizzle-orm"
import { generateText, APICallError, RetryError } from "ai"
import { createId } from "@paralleldrive/cuid2"
import { auth } from "@/lib/auth"
import { db } from "@/db"
import { aiProviderKey } from "@/db/schema"
import { encrypt, decrypt } from "@/lib/crypto"
import { getModel } from "@/lib/ai/registry"
import {
  providerKeyInputSchema,
  type ProviderKeyInput,
} from "@/schemas/ai-provider-key.schema"
import type { Result } from "@/lib/result"

async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user.id ?? null
}

/**
 * Masks a plaintext API key for display: first 3 chars + "…" + last 4
 * chars (e.g. "sk-…ab12"). Never used to persist anything — only to shape
 * what a read action returns to the client. The plaintext key itself is
 * decrypted server-side (in `listProviderKeys`) purely to compute this
 * mask and is never included in the action's return value.
 */
function maskApiKey(plainKey: string): string {
  if (plainKey.length <= 7) return "*".repeat(plainKey.length)
  return `${plainKey.slice(0, 3)}…${plainKey.slice(-4)}`
}

/**
 * `generateText`'s `maxRetries` wraps the real provider failure in a
 * `RetryError` once retries are exhausted — `RetryError.lastError` is the
 * actual `APICallError` (or whatever else failed). Without unwrapping this,
 * `APICallError.isInstance(err)` below never matches on a retried call, so
 * every real 401/403/429 was silently falling through to the generic
 * fallback message instead of the specific one.
 */
function unwrapRetryError(err: unknown): unknown {
  return RetryError.isInstance(err) ? err.lastError : err
}

/**
 * Translates a provider validation failure into a short, actionable
 * message — never the raw error (which can embed request/response detail)
 * and never a stack trace.
 */
function translateProviderError(err: unknown): string {
  const cause = unwrapRetryError(err)
  if (APICallError.isInstance(cause)) {
    if (cause.statusCode === 401 || cause.statusCode === 403) {
      return "El proveedor rechazó la clave: revisá tu API key o los permisos del proyecto."
    }
    if (cause.statusCode === 429) {
      return "El proveedor devolvió un límite de uso (429): cuota agotada o excedida. Revisá el plan/facturación de tu proyecto."
    }
    return `El proveedor devolvió un error${cause.statusCode ? ` (${cause.statusCode})` : ""}.`
  }
  return "No se pudo validar la clave con el proveedor. Probá de nuevo."
}

/**
 * Makes one minimal, cheap real call to the provider to confirm the key
 * actually works before anything is persisted. Bounded by both
 * `maxOutputTokens` (tiny response) and `maxRetries`/`timeout` (AI SDK v7
 * option names, verified against `ai@7.0.16`'s `generateText` signature)
 * so a flaky or hanging provider can't stall the form submission or
 * silently "succeed" after masking a real failure with retries.
 */
async function validateProviderKey(
  data: Pick<
    ProviderKeyInput,
    "provider" | "apiKey" | "baseURL" | "defaultModel"
  >,
): Promise<Result<true>> {
  try {
    const model = getModel({
      provider: data.provider,
      apiKey: data.apiKey,
      modelId: data.defaultModel,
      baseURL: data.baseURL,
    })

    await generateText({
      model,
      prompt: "Reply with exactly one word: OK",
      maxOutputTokens: 32,
      maxRetries: 1,
      timeout: 15_000,
    })

    return { ok: true, data: true }
  } catch (err) {
    // Log only a minimal, safe subset — never the raw error object (it can
    // carry `requestBodyValues`/`responseBody`) and never the api key.
    const cause = unwrapRetryError(err)
    console.error(
      "AI provider key validation failed",
      data.provider,
      APICallError.isInstance(cause)
        ? cause.statusCode
        : cause instanceof Error
          ? cause.message
          : "unknown error",
    )
    return {
      ok: false,
      error: translateProviderError(err),
      code: "provider_error",
    }
  }
}

export type ProviderKeySummary = {
  id: string
  provider: string
  maskedKey: string
  baseURL: string | null
  defaultModel: string | null
  lastValidatedAt: string | null
  createdAt: string
}

/**
 * Lists the current user's configured providers with the key masked.
 * `decrypt` runs here only to compute the mask — the decrypted plaintext
 * never leaves this function.
 */
export async function listProviderKeys(): Promise<
  Result<ProviderKeySummary[]>
> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const rows = await db
    .select()
    .from(aiProviderKey)
    .where(eq(aiProviderKey.userId, userId))
    .orderBy(desc(aiProviderKey.createdAt))

  return {
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      maskedKey: maskApiKey(decrypt(row.encryptedKey)),
      baseURL: row.baseURL,
      defaultModel: row.defaultModel,
      lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}

/**
 * Validates the key against the real provider, then encrypts and
 * upserts the row. Never persists (create or update) a key that failed
 * validation.
 *
 * Ownership: for an update (`input.id` present), the row is only touched
 * if it belongs to the current session's user — a client-supplied id from
 * another user's row matches nothing and is reported as "No encontrado".
 */
export async function saveProviderKey(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = providerKeyInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos", code: "invalid_input" }
  }
  const data = parsed.data

  const validation = await validateProviderKey(data)
  if (!validation.ok) return validation

  const encryptedKey = encrypt(data.apiKey)
  const now = new Date()
  // Only ever persist baseURL for "compatible" — a stray leftover value
  // from a form the user briefly switched to "compatible" and back away
  // from should never survive as this row's baseURL.
  const baseURL = data.provider === "compatible" ? (data.baseURL ?? null) : null

  if (data.id) {
    const [existing] = await db
      .select({ id: aiProviderKey.id })
      .from(aiProviderKey)
      .where(
        and(eq(aiProviderKey.id, data.id), eq(aiProviderKey.userId, userId)),
      )
      .limit(1)

    if (!existing)
      return { ok: false, error: "No encontrado", code: "not_found" }

    await db
      .update(aiProviderKey)
      .set({
        provider: data.provider,
        encryptedKey,
        baseURL,
        defaultModel: data.defaultModel,
        lastValidatedAt: now,
      })
      .where(
        and(eq(aiProviderKey.id, data.id), eq(aiProviderKey.userId, userId)),
      )

    return { ok: true, data: { id: data.id } }
  }

  const id = createId()
  await db.insert(aiProviderKey).values({
    id,
    userId,
    provider: data.provider,
    encryptedKey,
    baseURL,
    defaultModel: data.defaultModel,
    lastValidatedAt: now,
  })

  return { ok: true, data: { id } }
}

/**
 * Deletes a configured provider row, scoped to the current user — a
 * client-supplied id from another user's row matches zero rows and is
 * reported as "No encontrado" rather than silently no-op'd, so the UI can
 * distinguish "deleted" from "nothing happened".
 */
export async function deleteProviderKey(id: string): Promise<Result<true>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const [existing] = await db
    .select({ id: aiProviderKey.id })
    .from(aiProviderKey)
    .where(and(eq(aiProviderKey.id, id), eq(aiProviderKey.userId, userId)))
    .limit(1)

  if (!existing) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .delete(aiProviderKey)
    .where(and(eq(aiProviderKey.id, id), eq(aiProviderKey.userId, userId)))

  return { ok: true, data: true }
}
