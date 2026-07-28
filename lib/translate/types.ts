import type { TranslateErrorCode } from "./errors"

/**
 * Isomorphic core of the translation feature — zero runtime imports, no
 * `window`, no `db`. Providers are injected by the caller (the client
 * builds `[browserTranslator, remoteLlm]`; only the second hop crosses to
 * the server), so this module never imports a concrete provider.
 */

export type TranslationLanguage = "es" | "en"

export type TranslationRequest = {
  from: TranslationLanguage
  to: TranslationLanguage
  /** Opt-in for the on-device model download. Default false — a click must
   * never trigger a multi-GB background download silently. */
  allowDownload?: boolean
  /** Provider-agnostic progress, reported per completed segment. */
  onProgress?: (done: number, total: number) => void
  /**
   * On-device model DOWNLOAD progress, as a fraction in `[0, 1]`. Distinct
   * from `onProgress`: a multi-GB model download and "3 of 40 segments
   * translated" are different phases and must not share one callback — the
   * browser provider only calls this while `allowDownload` is true and the
   * model isn't ready yet, before any segment is translated.
   */
  onDownloadProgress?: (fraction: number) => void
}

export type ProviderAvailability =
  | { ready: true; free: boolean }
  | { ready: false; free: boolean; reason: TranslateErrorCode }

export type TranslationProvider = {
  readonly name: string
  /** MUST NOT throw. Availability is per language pair. */
  isAvailable(req: TranslationRequest): Promise<ProviderAvailability>
  /**
   * Batch-atomic. Returns exactly `segments.length` strings, index-aligned.
   * Any partial failure MUST throw `TranslationError` — never a short
   * array.
   */
  translate(
    segments: readonly string[],
    req: TranslationRequest,
  ): Promise<string[]>
}
