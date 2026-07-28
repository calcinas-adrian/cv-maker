import type {
  ProviderAvailability,
  TranslationProvider,
  TranslationRequest,
} from "../types"
import { classifyBrowserTranslatorError, TranslationError } from "../errors"

/**
 * Feature-detects the on-device `Translator` global before touching it —
 * `'Translator' in self` first, per the Chrome built-in AI convention. The
 * API is ambient-declared in `types/translator-api.d.ts` (not in `lib.dom`
 * yet), so this is the single place that narrows the untyped global into
 * `TranslatorStatic`.
 */
function getTranslatorApi(): TranslatorStatic | null {
  if (typeof self === "undefined" || !("Translator" in self)) return null
  return (self as typeof self & { Translator: TranslatorStatic }).Translator
}

/**
 * Wraps the on-device `Translator` API (Chrome/Edge built-in AI). Free,
 * zero provider calls, but only available on supporting browsers with the
 * language pack ready. `downloadable`/`downloading` counts as NOT ready
 * unless the caller explicitly opts in via `req.allowDownload` — a click
 * must never silently trigger a multi-GB background download.
 *
 * No `"use client"` directive: this exports a plain factory, not a
 * component, and every browser API access is guarded behind
 * `getTranslatorApi()`, so importing this module in a server context is
 * inert rather than a crash.
 */
export function createBrowserTranslatorProvider(): TranslationProvider {
  return {
    name: "browser",

    async isAvailable(req: TranslationRequest): Promise<ProviderAvailability> {
      const api = getTranslatorApi()
      if (!api) {
        return { ready: false, free: true, reason: "unsupported_browser" }
      }

      try {
        const availability = await api.availability({
          sourceLanguage: req.from,
          targetLanguage: req.to,
        })

        if (availability === "available") {
          return { ready: true, free: true }
        }
        if (
          req.allowDownload &&
          (availability === "downloadable" || availability === "downloading")
        ) {
          return { ready: true, free: true }
        }
        if (availability === "downloadable" || availability === "downloading") {
          return { ready: false, free: true, reason: "model_download_required" }
        }
        // "unavailable" and any unrecognised value: defensive per the
        // module's ambient-typing caveat.
        return { ready: false, free: true, reason: "pair_unsupported" }
      } catch {
        return { ready: false, free: true, reason: "pair_unsupported" }
      }
    },

    async translate(
      segments: readonly string[],
      req: TranslationRequest,
    ): Promise<string[]> {
      const api = getTranslatorApi()
      if (!api) {
        throw new TranslationError(
          "unsupported_browser",
          "Tu navegador no soporta la traducción en el dispositivo.",
        )
      }

      let translator: TranslatorInstance
      try {
        translator = await api.create({
          sourceLanguage: req.from,
          targetLanguage: req.to,
          monitor: req.onDownloadProgress
            ? (monitor) => {
                monitor.addEventListener("downloadprogress", (event) => {
                  // Defensive against either shape: some implementations
                  // report `loaded` already as a 0..1 fraction with
                  // `total === 1`; others report byte counts in both. If
                  // `total` is a usable denominator, divide; otherwise
                  // assume `loaded` is already the fraction.
                  const fraction =
                    event.total > 0 ? event.loaded / event.total : event.loaded
                  req.onDownloadProgress?.(Math.min(1, Math.max(0, fraction)))
                })
              }
            : undefined,
        })
      } catch (err) {
        throw classifyBrowserTranslatorError(err)
      }

      try {
        // Sequential, not `Promise.all`: the API is queued server-side (in
        // the browser process) anyway, so parallelising gains nothing and
        // loses per-segment error locality (D7).
        const out: string[] = []
        for (let i = 0; i < segments.length; i++) {
          out.push(await translator.translate(segments[i]))
          req.onProgress?.(i + 1, segments.length)
        }
        return out
      } catch (err) {
        throw classifyBrowserTranslatorError(err)
      } finally {
        translator.destroy()
      }
    },
  }
}
