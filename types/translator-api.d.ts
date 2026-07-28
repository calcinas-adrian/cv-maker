export {}

/**
 * Ambient declaration for Chrome/Edge's built-in on-device `Translator`
 * API — not yet part of `lib.dom.d.ts`. Shape taken from
 * https://developer.chrome.com/docs/ai/translator-api (confirm against
 * that page if browser behavior seems to disagree with these types; the
 * defensive fallback in `classifyBrowserTranslatorError` handles anything
 * unexpected without crashing regardless).
 */
declare global {
  type TranslatorAvailability =
    "unavailable" | "downloadable" | "downloading" | "available"

  interface TranslatorCreateOptions {
    sourceLanguage: string
    targetLanguage: string
    monitor?: (monitor: TranslatorMonitor) => void
    signal?: AbortSignal
  }

  interface TranslatorMonitor extends EventTarget {
    addEventListener(
      type: "downloadprogress",
      listener: (event: ProgressEvent) => void,
    ): void
  }

  interface TranslatorInstance {
    translate(text: string, options?: { signal?: AbortSignal }): Promise<string>
    destroy(): void
    readonly sourceLanguage: string
    readonly targetLanguage: string
  }

  interface TranslatorStatic {
    availability(options: {
      sourceLanguage: string
      targetLanguage: string
    }): Promise<TranslatorAvailability>
    create(options: TranslatorCreateOptions): Promise<TranslatorInstance>
  }

  var Translator: TranslatorStatic | undefined
}
