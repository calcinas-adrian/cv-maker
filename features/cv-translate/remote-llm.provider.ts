"use client"

import type {
  ProviderAvailability,
  TranslationProvider,
  TranslationRequest,
} from "@/lib/translate/types"
import { TranslationError } from "@/lib/translate/errors"
import { translateCvSegments } from "./actions"

/**
 * Client-side `TranslationProvider` whose `translate()` body calls the
 * `translateCvSegments` server action. Lives here, not in
 * `lib/translate/providers/`, because it imports a feature server
 * action — `lib/` must not depend on `features/`.
 */
export function createRemoteLlmProvider(
  cvId: string,
  providerModelId?: string,
): TranslationProvider {
  return {
    name: "llm",

    // Always reports ready: the real availability check (a configured
    // provider key) happens server-side inside `resolveModelForUser`.
    // Reporting `ready: true` unconditionally here lets a not-configured
    // provider surface its real, actionable message ("Configurá una
    // clave...") through `translate()`'s normal failure path instead of a
    // generic "not available" the chain would otherwise show first.
    async isAvailable(): Promise<ProviderAvailability> {
      return { ready: true, free: false }
    },

    async translate(
      segments: readonly string[],
      req: TranslationRequest,
    ): Promise<string[]> {
      const result = await translateCvSegments(cvId, {
        segments: Array.from(segments),
        from: req.from,
        to: req.to,
        providerModelId,
      })

      // Turns a non-ok `Result` back into a thrown `TranslationError` so
      // the chain sees one uniform failure shape regardless of provider.
      // `provider_not_configured` maps to the dedicated `"not_configured"`
      // code so the dialog can offer a link to `/ai-providers` instead of a
      // generic error — same distinction `import-from-file-dialog.tsx` and
      // `adapt-dialog-shell.tsx` already make on their own `ResultErrorCode`.
      if (!result.ok) {
        throw new TranslationError(
          result.code === "provider_not_configured"
            ? "not_configured"
            : "provider_error",
          result.error,
        )
      }

      return result.data.segments
    },
  }
}
