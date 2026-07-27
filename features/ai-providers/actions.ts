"use server"

import { headers } from "next/headers"
import { and, asc, desc, eq, isNull } from "drizzle-orm"
import { generateText, APICallError, RetryError } from "ai"
import { createId } from "@paralleldrive/cuid2"
import type { BatchItem } from "drizzle-orm/batch"
import { auth } from "@/lib/auth"
import { db } from "@/db"
import { aiProviderKey, aiProviderModel } from "@/db/schema"
import { encrypt, decrypt } from "@/lib/crypto"
import { getModel } from "@/lib/ai/registry"
import {
  clearDefaultModelQuery,
  listUserModelOptions,
  type UserModelOption,
} from "@/lib/ai/get-user-model"
import {
  findOwnedProviderKey,
  findOwnedProviderModel,
} from "@/features/ai-providers/ownership"
import {
  providerKeyInputSchema,
  providerModelInputSchema,
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
async function validateProviderKey(data: {
  provider: ProviderKeyInput["provider"]
  apiKey: string
  baseURL?: string
  modelId: string
}): Promise<Result<true>> {
  try {
    const model = getModel({
      provider: data.provider,
      apiKey: data.apiKey,
      modelId: data.modelId,
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

export type ProviderModelSummary = {
  id: string
  modelId: string
  isDefault: boolean
  lastValidatedAt: string | null
}

export type ProviderKeySummary = {
  id: string
  provider: string
  maskedKey: string
  baseURL: string | null
  models: ProviderModelSummary[]
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

  // Two queries plus an in-memory group, rather than a join: a join would
  // repeat every credential row once per model, and `maskApiKey(decrypt(...))`
  // would then run once per duplicate. Decryption is the expensive part
  // here, so it is worth keeping it to exactly one call per credential.
  const [keyRows, modelRows] = await Promise.all([
    db
      .select()
      .from(aiProviderKey)
      .where(
        and(eq(aiProviderKey.userId, userId), isNull(aiProviderKey.deletedAt)),
      )
      .orderBy(desc(aiProviderKey.createdAt)),
    db
      .select({
        id: aiProviderModel.id,
        providerKeyId: aiProviderModel.providerKeyId,
        modelId: aiProviderModel.modelId,
        isDefault: aiProviderModel.isDefault,
        lastValidatedAt: aiProviderModel.lastValidatedAt,
      })
      .from(aiProviderModel)
      .innerJoin(
        aiProviderKey,
        eq(aiProviderModel.providerKeyId, aiProviderKey.id),
      )
      // Ownership rides on the join, not on the model id — this table has no
      // `userId` of its own. The credential's own `deleted_at` is checked
      // too: soft-deleting a key hides its models without touching them (see
      // `deleteProviderKey`), so the key-side filter is what makes them
      // disappear here.
      .where(
        and(
          eq(aiProviderKey.userId, userId),
          isNull(aiProviderModel.deletedAt),
          isNull(aiProviderKey.deletedAt),
        ),
      )
      .orderBy(desc(aiProviderModel.isDefault), asc(aiProviderModel.createdAt)),
  ])

  const modelsByKey = new Map<string, ProviderModelSummary[]>()
  for (const m of modelRows) {
    const list = modelsByKey.get(m.providerKeyId) ?? []
    list.push({
      id: m.id,
      modelId: m.modelId,
      isDefault: m.isDefault,
      lastValidatedAt: m.lastValidatedAt?.toISOString() ?? null,
    })
    modelsByKey.set(m.providerKeyId, list)
  }

  return {
    ok: true,
    data: keyRows.map((row) => ({
      id: row.id,
      provider: row.provider,
      maskedKey: maskApiKey(decrypt(row.encryptedKey)),
      baseURL: row.baseURL,
      models: modelsByKey.get(row.id) ?? [],
      lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}

/**
 * Flat list of every model the user can pick from, for the adapt dialog's
 * selector. Carries no key material at all — not even the mask.
 */
export async function listModelOptions(): Promise<Result<UserModelOption[]>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  return { ok: true, data: await listUserModelOptions(userId) }
}

/**
 * Validates against the real provider, then encrypts and upserts the
 * credential. Never persists (create or update) a key that failed
 * validation.
 *
 * On CREATE this writes two rows in one `db.batch` — the credential and its
 * first model. A credential with zero models is unusable, so they are
 * created together rather than leaving a window where one exists without
 * the other. (`db` is `drizzle-orm/neon-http`: `db.transaction` throws, and
 * `db.batch` is the only atomic unit available.)
 *
 * On UPDATE `apiKey` may be omitted, meaning "keep the stored key". That is
 * the fix for a real dead end: the app never shows a stored key back, so
 * requiring it to change anything else forced users to mint a brand-new key
 * at their provider just to adjust a setting. When omitted, the stored
 * ciphertext is reused for validation by decrypting it here — the model
 * still gets validated against the live provider either way, so an update
 * can never leave a broken configuration behind.
 *
 * Ownership: for an update the row is only touched if it belongs to the
 * session user — an id from another user's row matches nothing and is
 * reported as "No encontrado".
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

  const existing = data.id ? await findOwnedProviderKey(data.id, userId) : null
  if (data.id && !existing) {
    return { ok: false, error: "No encontrado", code: "not_found" }
  }

  // "Keep the stored key" on update. The edit form submits `""` rather than
  // omitting the field (the input stays mounted and controlled), so blank is
  // normalized to absent here rather than in the schema — see the comment on
  // `apiKey` in `schemas/ai-provider-key.schema.ts`. The schema's refine
  // already guarantees a non-blank key on create, so `existing` is non-null
  // whenever this falls through to the stored ciphertext.
  const providedKey = data.apiKey?.trim() ? data.apiKey.trim() : undefined
  const plainKey = providedKey ?? decrypt(existing!.encryptedKey)

  // Only ever persist baseURL for "compatible" — a stray leftover value
  // from a form the user briefly switched to "compatible" and back away
  // from should never survive as this row's baseURL.
  const baseURL = data.provider === "compatible" ? (data.baseURL ?? null) : null

  const validation = await validateProviderKey({
    provider: data.provider,
    apiKey: plainKey,
    baseURL: baseURL ?? undefined,
    modelId: data.modelId,
  })
  if (!validation.ok) return validation

  const encryptedKey = encrypt(plainKey)
  const now = new Date()

  if (data.id) {
    await db
      .update(aiProviderKey)
      .set({
        provider: data.provider,
        encryptedKey,
        baseURL,
        lastValidatedAt: now,
      })
      .where(
        and(eq(aiProviderKey.id, data.id), eq(aiProviderKey.userId, userId)),
      )

    // The edited model is registered if it is not already on this
    // credential. `onConflictDoUpdate` against the composite unique index
    // keeps the edit form idempotent AND doubles as the revive path: if
    // this exact model was soft-deleted earlier, re-saving it here clears
    // `deleted_at` instead of failing on the unique index or quietly doing
    // nothing. One row per (credential, model) pair, always — see the note
    // on `deletedAt` in `db/schema.ts`.
    await db
      .insert(aiProviderModel)
      .values({
        id: createId(),
        providerKeyId: data.id,
        modelId: data.modelId,
        lastValidatedAt: now,
      })
      .onConflictDoUpdate({
        target: [aiProviderModel.providerKeyId, aiProviderModel.modelId],
        set: { deletedAt: null, lastValidatedAt: now },
      })

    return { ok: true, data: { id: data.id } }
  }

  const id = createId()
  await db.batch([
    db.insert(aiProviderKey).values({
      id,
      userId,
      provider: data.provider,
      encryptedKey,
      baseURL,
      lastValidatedAt: now,
    }),
    db.insert(aiProviderModel).values({
      id: createId(),
      providerKeyId: id,
      modelId: data.modelId,
      lastValidatedAt: now,
    }),
  ])

  return { ok: true, data: { id } }
}

/**
 * Registers an ADDITIONAL model against a credential that already exists —
 * the flow that makes "one key, many models" real.
 *
 * The plaintext key is never sent by the client here. It is decrypted from
 * the stored ciphertext just long enough to validate that this specific
 * model actually works with this specific credential, then discarded; the
 * stored ciphertext is not rewritten. That is what keeps a single secret in
 * a single row, so rotating it later stays a one-row operation instead of
 * scaling with the number of models.
 */
export async function addProviderModel(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = providerModelInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos", code: "invalid_input" }
  }
  const data = parsed.data

  const owned = await findOwnedProviderKey(data.providerKeyId, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const validation = await validateProviderKey({
    provider: owned.provider as ProviderKeyInput["provider"],
    apiKey: decrypt(owned.encryptedKey),
    baseURL: owned.baseURL ?? undefined,
    modelId: data.modelId,
  })
  if (!validation.ok) return validation

  // A row may already exist for this (credential, model) pair in one of two
  // very different states, and they need opposite outcomes:
  //   - live      -> nothing to do, and saying "added" would be a lie
  //   - soft-deleted -> the user is re-adding something they removed, which
  //                     is precisely the flow soft delete exists to make
  //                     painless, so revive it and report success
  // Checked explicitly rather than inferred from the upsert's `rowCount`,
  // because `onConflictDoUpdate` reports 1 for both cases.
  const [existingRow] = await db
    .select({ id: aiProviderModel.id, deletedAt: aiProviderModel.deletedAt })
    .from(aiProviderModel)
    .where(
      and(
        eq(aiProviderModel.providerKeyId, data.providerKeyId),
        eq(aiProviderModel.modelId, data.modelId),
      ),
    )
    .limit(1)

  if (existingRow && !existingRow.deletedAt) {
    return {
      ok: false,
      error: "Ese modelo ya está registrado para esta clave.",
      code: "invalid_input",
    }
  }

  const id = createId()
  await db
    .insert(aiProviderModel)
    .values({
      id,
      providerKeyId: data.providerKeyId,
      modelId: data.modelId,
      lastValidatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [aiProviderModel.providerKeyId, aiProviderModel.modelId],
      set: { deletedAt: null, lastValidatedAt: new Date() },
    })

  // The revived row keeps its ORIGINAL id — `id` above was only used for the
  // insert branch — so callers get the id that actually exists in the table.
  return { ok: true, data: { id: existingRow?.id ?? id } }
}

/**
 * SOFT-deletes ONE model, leaving its credential and every sibling model
 * intact. This is the operation the cascade on
 * `ai_provider_model.providerKeyId` would otherwise make impossible to
 * express.
 *
 * Refuses to remove the last LIVE model on a credential: a credential with
 * no models cannot be used by anything and would sit in the UI looking
 * configured while silently never being selectable. Deleting the credential
 * itself is the intended way to get rid of it. The sibling count filters on
 * `deleted_at` — previously-deleted models are not usable, so counting them
 * would let a user strand a credential with zero live models.
 *
 * `isDefault` is deliberately NOT cleared here. It stays on the dead row and
 * comes back if the model is ever revived, which is what a user re-adding a
 * model they deleted by accident would expect. This cannot produce two
 * defaults, because `clearDefaultModelQuery` intentionally clears the flag
 * across ALL of the user's models, deleted ones included — so the moment
 * another model is promoted, the dead row's flag is cleared with it.
 */
export async function deleteProviderModel(id: string): Promise<Result<true>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const owned = await findOwnedProviderModel(id, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const siblings = await db
    .select({ id: aiProviderModel.id })
    .from(aiProviderModel)
    .where(
      and(
        eq(aiProviderModel.providerKeyId, owned.providerKeyId),
        isNull(aiProviderModel.deletedAt),
      ),
    )

  if (siblings.length <= 1) {
    return {
      ok: false,
      error:
        "Es el único modelo de esta clave. Eliminá el proveedor entero si ya no lo usás.",
      code: "invalid_input",
    }
  }

  await db
    .update(aiProviderModel)
    .set({ deletedAt: new Date() })
    .where(eq(aiProviderModel.id, id))

  return { ok: true, data: true }
}

/**
 * Marks one model as the user's default — the one picked by flows that do
 * not offer an explicit selector (CV import, GitHub import).
 *
 * Clearing every other flag and setting this one happen in a single
 * `db.batch` so there is never a moment with two defaults or none. Order
 * matters: the clear must run before the set, otherwise it would immediately
 * undo it.
 */
export async function setDefaultProviderModel(
  id: string,
): Promise<Result<true>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const owned = await findOwnedProviderModel(id, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const queries: BatchItem<"pg">[] = [
    clearDefaultModelQuery(userId),
    db
      .update(aiProviderModel)
      .set({ isDefault: true })
      .where(eq(aiProviderModel.id, id)),
  ]

  await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]])

  return { ok: true, data: true }
}

/**
 * SOFT-deletes a configured credential, scoped to the current user — a
 * client-supplied id from another user's row matches zero rows and is
 * reported as "No encontrado" rather than silently no-op'd, so the UI can
 * distinguish "deleted" from "nothing happened".
 *
 * Its models are deliberately left untouched, exactly like `cv`'s children:
 * every read path joins back to the credential and filters on ITS
 * `deleted_at` (see `findOwnedProviderModel`, `listProviderKeys`,
 * `getConfiguredModelForUser`, `listUserModelOptions`), so the models are
 * already unusable and invisible. That keeps restore a single UPDATE —
 * clearing `deleted_at` here brings the whole credential back with every
 * model it had.
 *
 * NOTE: the row retains `encrypted_key`. See the column comment in
 * `db/schema.ts` — this is an accepted trade for this deployment, not an
 * oversight.
 */
export async function deleteProviderKey(id: string): Promise<Result<true>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const existing = await findOwnedProviderKey(id, userId)
  if (!existing) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .update(aiProviderKey)
    .set({ deletedAt: new Date() })
    .where(and(eq(aiProviderKey.id, id), eq(aiProviderKey.userId, userId)))

  return { ok: true, data: true }
}
