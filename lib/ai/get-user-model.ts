import "server-only"

import { and, desc, eq, sql } from "drizzle-orm"
import type { LanguageModel } from "ai"
import { db } from "@/db"
import { aiProviderKey, aiProviderModel } from "@/db/schema"
import { decrypt } from "@/lib/crypto"
import { getModel } from "@/lib/ai/registry"
import type { AiProviderId } from "@/lib/ai/catalog"
import { NO_PROVIDER_CONFIGURED_ERROR } from "@/lib/ai/constants"
import { findOwnedProviderModel } from "@/features/ai-providers/ownership"
import type { Result } from "@/lib/result"

/**
 * Resolves a user's configured AI credentials into a ready-to-use
 * `LanguageModel`.
 *
 * Originally extracted out of `features/github-import/actions.ts` so
 * `features/cv-import/actions.ts` could reuse the exact same
 * lookup-decrypt-build-model logic instead of a second copy that could
 * silently drift.
 *
 * Phase 6 reshaped this: a model is no longer a column on the credential
 * row. `ai_provider_key` holds the credential and `ai_provider_model` holds
 * N models per credential, so resolving now always means picking a model
 * row and joining back to its key.
 */

/** The joined shape every resolver below turns into a `LanguageModel`. */
type ResolvedModelRow = {
  modelId: string
  provider: string
  encryptedKey: string
  baseURL: string | null
}

function buildModel(row: ResolvedModelRow): { model: LanguageModel } {
  return {
    model: getModel({
      provider: row.provider as AiProviderId,
      apiKey: decrypt(row.encryptedKey),
      modelId: row.modelId,
      baseURL: row.baseURL ?? undefined,
    }),
  }
}

/**
 * Resolves the user's DEFAULT model — used by the flows that deliberately
 * do not offer a picker (CV import, GitHub import).
 *
 * Ordering, in priority order:
 *  1. the row explicitly flagged `isDefault`
 *  2. otherwise the most-recently-validated credential's model
 *
 * A validated credential is known to actually work against its provider,
 * so it is the least-surprising fallback rather than an arbitrary one.
 *
 * NOTE on `NULLS LAST`: `desc(column)` alone would NOT produce this order —
 * Postgres defaults to "NULLS FIRST" for DESC, so never-validated rows
 * would sort ahead of validated ones. It is spelled out explicitly on both
 * validation timestamps for that reason. This bug was fixed here once
 * before the table was split; the split preserved it deliberately.
 */
export async function getConfiguredModelForUser(
  userId: string,
): Promise<Result<{ model: LanguageModel }>> {
  const [row] = await db
    .select({
      modelId: aiProviderModel.modelId,
      provider: aiProviderKey.provider,
      encryptedKey: aiProviderKey.encryptedKey,
      baseURL: aiProviderKey.baseURL,
    })
    .from(aiProviderModel)
    .innerJoin(
      aiProviderKey,
      eq(aiProviderModel.providerKeyId, aiProviderKey.id),
    )
    .where(eq(aiProviderKey.userId, userId))
    .orderBy(
      desc(aiProviderModel.isDefault),
      sql`${aiProviderKey.lastValidatedAt} desc nulls last`,
      sql`${aiProviderModel.lastValidatedAt} desc nulls last`,
      desc(aiProviderModel.createdAt),
    )
    .limit(1)

  if (!row) {
    return {
      ok: false,
      error: NO_PROVIDER_CONFIGURED_ERROR,
      code: "provider_not_configured",
    }
  }

  return { ok: true, data: buildModel(row) }
}

/**
 * Resolves ONE explicitly chosen model, for flows that let the user pick
 * per run (the adapt dialog). `providerModelId` arrives from the client and
 * is never trusted alone: `findOwnedProviderModel` scopes it to the session
 * user by joining through the credential, so another user's model id
 * resolves to nothing instead of building a model against their key.
 *
 * A missing row is reported as `provider_not_configured` rather than
 * `not_found` on purpose — from the caller's point of view the actionable
 * remedy is identical (go configure a provider in Ajustes), and the two
 * real causes (the model was deleted between page load and submit, or the
 * id was tampered with) should not be distinguishable to the client.
 */
export async function getConfiguredModelById(
  userId: string,
  providerModelId: string,
): Promise<Result<{ model: LanguageModel }>> {
  const owned = await findOwnedProviderModel(providerModelId, userId)

  if (!owned) {
    return {
      ok: false,
      error: NO_PROVIDER_CONFIGURED_ERROR,
      code: "provider_not_configured",
    }
  }

  return { ok: true, data: buildModel(owned) }
}

/**
 * Resolves an explicitly chosen model when one is given, falling back to
 * the user's default otherwise. This is the shape most call sites want, so
 * they do not each re-implement the same two-branch check.
 */
export async function resolveModelForUser(
  userId: string,
  providerModelId?: string | null,
): Promise<Result<{ model: LanguageModel }>> {
  return providerModelId
    ? getConfiguredModelById(userId, providerModelId)
    : getConfiguredModelForUser(userId)
}

/** One selectable entry for a model picker. Never carries key material. */
export type UserModelOption = {
  id: string
  provider: string
  modelId: string
  isDefault: boolean
}

/**
 * Lists every model the user has registered, across all credentials, for
 * rendering a picker. Deliberately returns no key material of any kind —
 * not even the mask, which only `listProviderKeys` needs.
 */
export async function listUserModelOptions(
  userId: string,
): Promise<UserModelOption[]> {
  return db
    .select({
      id: aiProviderModel.id,
      provider: aiProviderKey.provider,
      modelId: aiProviderModel.modelId,
      isDefault: aiProviderModel.isDefault,
    })
    .from(aiProviderModel)
    .innerJoin(
      aiProviderKey,
      eq(aiProviderModel.providerKeyId, aiProviderKey.id),
    )
    .where(eq(aiProviderKey.userId, userId))
    .orderBy(
      desc(aiProviderModel.isDefault),
      desc(aiProviderKey.createdAt),
      desc(aiProviderModel.createdAt),
    )
}

/**
 * Clears the `isDefault` flag on every model the user owns. Callers set the
 * new default immediately after, inside the same `db.batch` — `db` is
 * `drizzle-orm/neon-http`, where `db.transaction` throws and `db.batch` is
 * the only atomic unit.
 *
 * Expressed as a subquery over the user's credentials because
 * `ai_provider_model` has no `userId` of its own.
 */
export function clearDefaultModelQuery(userId: string) {
  return db
    .update(aiProviderModel)
    .set({ isDefault: false })
    .where(
      and(
        eq(aiProviderModel.isDefault, true),
        sql`${aiProviderModel.providerKeyId} in (select ${aiProviderKey.id} from ${aiProviderKey} where ${aiProviderKey.userId} = ${userId})`,
      ),
    )
}
