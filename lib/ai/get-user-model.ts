import "server-only"

import { desc, eq, sql } from "drizzle-orm"
import type { LanguageModel } from "ai"
import { db } from "@/db"
import { aiProviderKey } from "@/db/schema"
import { decrypt } from "@/lib/crypto"
import { getModel } from "@/lib/ai/registry"
import type { AiProviderId } from "@/lib/ai/catalog"
import { NO_PROVIDER_CONFIGURED_ERROR } from "@/lib/ai/constants"
import type { Result } from "@/lib/result"

/**
 * Resolves the given user's configured AI provider key into a ready-to-use
 * `LanguageModel`, or an actionable `Result` error if none is configured.
 *
 * Extracted out of `features/github-import/actions.ts`'s
 * `extractProjectFromRepo` (its original, inline-only home; since renamed
 * `extractFromRepo` when that action grew a second import target) so
 * `features/cv-import/actions.ts` can reuse the exact same
 * lookup-decrypt-build-model logic instead of a second copy that could
 * silently drift from this one (e.g. a fix to the `NULLS LAST` ordering
 * bug below landing in only one of the two call sites).
 */
export async function getConfiguredModelForUser(
  userId: string,
): Promise<Result<{ model: LanguageModel }>> {
  const [providerRow] = await db
    .select()
    .from(aiProviderKey)
    .where(eq(aiProviderKey.userId, userId))
    // Most-recently-validated key first — a validated key is known to
    // actually work against its provider. Multiple configured providers are
    // otherwise unordered from the user's point of view, so this is the
    // least-surprising default rather than an arbitrary one.
    //
    // NOTE: `desc(aiProviderKey.lastValidatedAt)` alone would NOT do this —
    // Postgres's default null ordering is "NULLS FIRST" for DESC, so
    // never-validated rows (`lastValidatedAt IS NULL`) would sort ahead of
    // validated ones. `NULLS LAST` is spelled out explicitly to get the
    // intended order.
    .orderBy(
      sql`${aiProviderKey.lastValidatedAt} desc nulls last`,
      desc(aiProviderKey.createdAt),
    )
    .limit(1)

  if (!providerRow) {
    return {
      ok: false,
      error: NO_PROVIDER_CONFIGURED_ERROR,
      code: "provider_not_configured",
    }
  }
  if (!providerRow.defaultModel) {
    // Not a decrypt/lookup failure — a provider row exists, it's just
    // missing a default model. Same remediation as "no provider at all"
    // (go configure it in Settings), so it gets the same code.
    return {
      ok: false,
      error:
        "Tu proveedor de IA configurado no tiene un modelo por defecto. Revisalo en Ajustes.",
      code: "provider_not_configured",
    }
  }

  const model = getModel({
    provider: providerRow.provider as AiProviderId,
    apiKey: decrypt(providerRow.encryptedKey),
    modelId: providerRow.defaultModel,
    baseURL: providerRow.baseURL ?? undefined,
  })

  return { ok: true, data: { model } }
}
