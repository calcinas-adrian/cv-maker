import "server-only"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { aiProviderKey, aiProviderModel } from "@/db/schema"

/**
 * Ownership helpers for the normalized provider tables, split out of
 * `features/ai-providers/actions.ts` for the same reason
 * `features/cv/ownership.ts` exists: every export of a `"use server"`
 * module becomes a public server action, and these are internal helpers
 * that return raw DB rows with no input validation.
 *
 * `ai_provider_model` has no `userId` of its own — ownership is only
 * reachable by joining back to `ai_provider_key`. That makes it easy to
 * write a query that silently operates on another user's row, so every
 * action that accepts a model id from a client goes through
 * `findOwnedProviderModel` instead of querying the table directly.
 *
 * Both helpers also enforce soft delete (`isNull(deletedAt)`), and the
 * model helper enforces it on BOTH sides of the join: a model whose
 * credential was deleted is unusable even if the model row itself is live,
 * because it can no longer authenticate.
 */

/**
 * Loads a LIVE model row together with the LIVE credential it belongs to,
 * scoped to the given user in a single query. A model id from another user
 * — or one whose credential has been deleted — matches nothing rather than
 * leaking the row.
 */
export async function findOwnedProviderModel(
  providerModelId: string,
  userId: string,
) {
  const [row] = await db
    .select({
      modelRowId: aiProviderModel.id,
      modelId: aiProviderModel.modelId,
      isDefault: aiProviderModel.isDefault,
      providerKeyId: aiProviderKey.id,
      provider: aiProviderKey.provider,
      encryptedKey: aiProviderKey.encryptedKey,
      baseURL: aiProviderKey.baseURL,
    })
    .from(aiProviderModel)
    .innerJoin(
      aiProviderKey,
      eq(aiProviderModel.providerKeyId, aiProviderKey.id),
    )
    .where(
      and(
        eq(aiProviderModel.id, providerModelId),
        eq(aiProviderKey.userId, userId),
        isNull(aiProviderModel.deletedAt),
        isNull(aiProviderKey.deletedAt),
      ),
    )
    .limit(1)

  return row ?? null
}

/**
 * Loads a credential row scoped to its owner. Used before attaching a new
 * model to an existing key — the whole point of that flow is that the
 * plaintext key is never re-sent by the client, so the key id it does send
 * has to be proven to belong to the session user first.
 */
export async function findOwnedProviderKey(
  providerKeyId: string,
  userId: string,
) {
  const [row] = await db
    .select()
    .from(aiProviderKey)
    .where(
      and(
        eq(aiProviderKey.id, providerKeyId),
        eq(aiProviderKey.userId, userId),
        isNull(aiProviderKey.deletedAt),
      ),
    )
    .limit(1)

  return row ?? null
}
