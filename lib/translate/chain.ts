import type { TranslationProvider, TranslationRequest } from "./types"
import { TranslationError, type TranslateErrorCode } from "./errors"

export type ChainAttempt = {
  provider: string
  code: TranslateErrorCode
  message: string
}

export type TranslationChainResult =
  | { ok: true; data: { segments: string[]; provider: string; free: boolean } }
  | {
      ok: false
      error: string
      code: "all_providers_failed"
      attempts: ChainAttempt[]
    }

/**
 * Sequential, Result-typed provider chain. NO retry inside here: the LLM
 * SDK already retries (`maxRetries: 2`) and a chain-level loop would
 * multiply paid calls invisibly. On exhaustion, returns the LAST attempt's
 * message — the last link is the paid one, so its message is the
 * actionable one ("revisá tu clave en Ajustes"); "tu navegador no soporta
 * esto" is not.
 *
 * Control flow, exactly: for each provider in order -> `isAvailable(req)`;
 * if not ready, record and continue -> `translate(...)`; a length mismatch
 * is a failure (`invalid_result`), not a warning -> on success, return ok
 * immediately -> on throw, a `TranslationError` contributes its own
 * `code`/`userMessage`, anything else becomes `code: "unknown"` with a
 * generic fallback.
 */
export async function runTranslationChain(
  providers: readonly TranslationProvider[],
  segments: readonly string[],
  req: TranslationRequest,
): Promise<TranslationChainResult> {
  const attempts: ChainAttempt[] = []

  for (const provider of providers) {
    let availability
    try {
      availability = await provider.isAvailable(req)
    } catch {
      attempts.push({
        provider: provider.name,
        code: "unknown",
        message: "No se pudo comprobar la disponibilidad del proveedor.",
      })
      continue
    }

    if (!availability.ready) {
      attempts.push({
        provider: provider.name,
        code: availability.reason,
        message: `${provider.name} no está disponible.`,
      })
      continue
    }

    try {
      const out = await provider.translate(segments, req)

      if (out.length !== segments.length) {
        attempts.push({
          provider: provider.name,
          code: "invalid_result",
          message: "La traducción no devolvió la cantidad esperada de textos.",
        })
        continue
      }

      return {
        ok: true,
        data: {
          segments: out,
          provider: provider.name,
          free: availability.free,
        },
      }
    } catch (err) {
      const translationError =
        err instanceof TranslationError
          ? err
          : new TranslationError(
              "unknown",
              "No se pudo traducir. Probá de nuevo.",
            )

      attempts.push({
        provider: provider.name,
        code: translationError.code,
        message: translationError.userMessage,
      })
    }
  }

  const last = attempts[attempts.length - 1]
  return {
    ok: false,
    error:
      last?.message ?? "No se pudo traducir con ningún proveedor disponible.",
    code: "all_providers_failed",
    attempts,
  }
}
