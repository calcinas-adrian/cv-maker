/**
 * Isomorphic. Mirrors `lib/ai/errors.ts`'s style: Spanish, short,
 * actionable user copy, and a stable machine-readable `code` callers branch
 * on instead of the message text.
 */

export type TranslateErrorCode =
  | "unsupported_browser" // no `Translator` global
  | "pair_unsupported" // availability() === "unavailable"; NotSupportedError
  | "model_download_required" // "downloadable"/"downloading" without allowDownload
  | "download_failed" // NetworkError / QuotaExceededError during create()
  | "translation_failed" // translate() rejected
  | "aborted" // AbortError / TimeoutError
  | "not_configured" // server: provider_not_configured
  | "provider_error" // server: message already produced by translateAiError
  | "invalid_result" // length mismatch or non-conforming output
  | "invalid_input" // caps
  | "unknown"

export class TranslationError extends Error {
  readonly code: TranslateErrorCode
  readonly userMessage: string

  constructor(code: TranslateErrorCode, userMessage: string) {
    super(userMessage)
    this.name = "TranslationError"
    this.code = code
    this.userMessage = userMessage
  }
}

/**
 * DOMException name -> code. Parallel to `translateAiError`, client side.
 * Defensive by construction: any name this switch doesn't recognise falls
 * through to `translation_failed` rather than throwing or crashing —
 * `Translator.availability()`'s exact error surface is not fully
 * documented, so an unexpected error degrades to a generic failure instead
 * of an unhandled exception.
 */
export function classifyBrowserTranslatorError(err: unknown): TranslationError {
  if (err instanceof TranslationError) return err

  const name =
    err instanceof DOMException
      ? err.name
      : err instanceof Error
        ? err.name
        : undefined

  switch (name) {
    case "NotSupportedError":
      return new TranslationError(
        "pair_unsupported",
        "Tu navegador no puede traducir este par de idiomas en el dispositivo.",
      )
    case "NotAllowedError":
      return new TranslationError(
        "unsupported_browser",
        "Tu navegador no permite la traducción en el dispositivo.",
      )
    case "NetworkError":
      return new TranslationError(
        "download_failed",
        "No se pudo descargar el modelo de traducción. Probá de nuevo.",
      )
    case "QuotaExceededError":
      return new TranslationError(
        "download_failed",
        "No hay espacio suficiente para descargar el modelo de traducción.",
      )
    case "AbortError":
    case "TimeoutError":
      return new TranslationError(
        "aborted",
        "La traducción en el dispositivo se canceló o tardó demasiado.",
      )
    default:
      return new TranslationError(
        "translation_failed",
        "No se pudo traducir en el dispositivo.",
      )
  }
}
