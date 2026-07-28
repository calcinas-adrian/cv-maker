"use client"

import { useCallback, useState } from "react"
import type { CvData } from "@/schemas/cv.schema"
import type { Result, ResultErrorCode } from "@/lib/result"
import type {
  ProviderAvailability,
  TranslationLanguage,
} from "@/lib/translate/types"
import { applyCvSegments, collectCvSegments } from "@/lib/translate/cv-segments"
import { runTranslationChain } from "@/lib/translate/chain"
import { createBrowserTranslatorProvider } from "@/lib/translate/providers/browser-translator.provider"
import { useEditorStore } from "@/features/cv/editor-store"
import { createCvFromTranslation } from "./actions"
import { defaultTranslatedTitle } from "./constants"
import { createRemoteLlmProvider } from "./remote-llm.provider"

export type TranslateStep =
  | { name: "pick" }
  | { name: "confirm"; probe: ProviderAvailability | null; probing: boolean }
  | {
      name: "translating"
      done: number
      total: number
      /**
       * Fraction in `[0, 1]` while the on-device model is downloading, or
       * `null` when no download is in progress (either it already
       * finished, or this run never needed one). Distinct phase from
       * `done`/`total`, which tracks per-segment translation progress.
       */
      downloadProgress: number | null
    }
  | { name: "review"; title: string; data: CvData; free: boolean }
  | {
      name: "error"
      message: string
      code: ResultErrorCode | "all_providers_failed"
    }

const OTHER_LANGUAGE: Record<TranslationLanguage, TranslationLanguage> = {
  es: "en",
  en: "es",
}

/**
 * Owns the translate dialog's step machine and every call into
 * `lib/translate/*`. `translate-dialog.tsx` is the presentational shell —
 * every state transition happens here (design's file-changes table).
 *
 * Segments are ALWAYS collected from the LIVE `useEditorStore` draft, never
 * re-derived server-side (design D4): this is what makes reassembly immune
 * to an autosave race — extraction and reassembly both read the exact same
 * client-held object, captured once at the start of `runTranslate`.
 */
export function useTranslate(cvId: string, initialTitle: string) {
  const draft = useEditorStore((s) => s.draft)
  const [to, setTo] = useState<TranslationLanguage>("en")
  const [step, setStep] = useState<TranslateStep>({ name: "pick" })
  const [isSaving, setIsSaving] = useState(false)
  /**
   * User consent for the on-device model download (D3/D7): stays false
   * until the user explicitly accepts the opt-in prompt shown when the
   * probe reports `model_download_required`. Persisted here so
   * `runTranslate`'s request carries the same consent the probe was
   * re-run with — the chain must not re-ask.
   */
  const [allowDownload, setAllowDownload] = useState(false)

  const from = OTHER_LANGUAGE[to]

  const reset = useCallback(() => {
    setStep({ name: "pick" })
    setTo("en")
    setAllowDownload(false)
  }, [])

  const goToPick = useCallback(() => setStep({ name: "pick" }), [])

  /**
   * Probes `Translator.availability({from, to, allowDownload})` client-side.
   * Shared by `goToConfirm` (initial probe, no consent) and
   * `confirmDownload` (re-probe after the user opts in) — same discipline
   * as `listModelOptions` in `AdaptCvDialog` — so the preflight panel names
   * the REAL path (on-device vs. paid LLM) rather than generic copy
   * (design D5). Re-probing rather than faking the label means a genuinely
   * `"unavailable"` pair still correctly falls through to the LLM path
   * even after consent.
   */
  const probeAvailability = useCallback(
    (allow: boolean) => {
      setStep({ name: "confirm", probe: null, probing: true })

      void createBrowserTranslatorProvider()
        .isAvailable({ from, to, allowDownload: allow })
        .then((probe) => {
          setStep((s) =>
            s.name === "confirm" ? { ...s, probe, probing: false } : s,
          )
        })
        .catch(() => {
          setStep((s) =>
            s.name === "confirm"
              ? {
                  ...s,
                  probe: { ready: false, free: true, reason: "unknown" },
                  probing: false,
                }
              : s,
          )
        })
    },
    [from, to],
  )

  const goToConfirm = useCallback(() => {
    setAllowDownload(false)
    probeAvailability(false)
  }, [probeAvailability])

  /**
   * The explicit user action that opts into the on-device model download.
   * Never triggered automatically — only from a button the user clicks
   * after reading the download-consent copy in `translate-dialog.tsx`.
   */
  const confirmDownload = useCallback(() => {
    setAllowDownload(true)
    probeAvailability(true)
  }, [probeAvailability])

  const runTranslate = useCallback(async () => {
    if (!draft) return
    setStep({ name: "translating", done: 0, total: 0, downloadProgress: null })

    const segments = collectCvSegments(initialTitle, draft)
    const texts = segments.map((segment) => segment.text)

    const result = await runTranslationChain(
      [createBrowserTranslatorProvider(), createRemoteLlmProvider(cvId)],
      texts,
      {
        from,
        to,
        allowDownload,
        onDownloadProgress: (fraction) => {
          setStep((s) =>
            s.name === "translating" ? { ...s, downloadProgress: fraction } : s,
          )
        },
        onProgress: (done, total) => {
          setStep((s) =>
            s.name === "translating"
              ? { name: "translating", done, total, downloadProgress: null }
              : s,
          )
        },
      },
    )

    if (!result.ok) {
      setStep({ name: "error", message: result.error, code: result.code })
      return
    }

    const { title, data } = applyCvSegments(
      initialTitle,
      draft,
      segments,
      result.data.segments,
    )

    setStep({
      name: "review",
      title: defaultTranslatedTitle(title, to),
      data,
      free: result.data.free,
    })
  }, [allowDownload, cvId, draft, from, initialTitle, to])

  const updateReviewTitle = useCallback((title: string) => {
    setStep((s) => (s.name === "review" ? { ...s, title } : s))
  }, [])

  const save = useCallback(async (): Promise<
    Result<{ id: string }> | undefined
  > => {
    if (step.name !== "review") return undefined
    setIsSaving(true)

    const result = await createCvFromTranslation({
      sourceCvId: cvId,
      title: step.title,
      draft: step.data,
    })

    setIsSaving(false)

    // Redirect is the caller's job (`translate-dialog.tsx`), not this hook's:
    // it must run `setOpen(false)` BEFORE `router.push`/`router.refresh()`,
    // same ordering as `adapt-dialog.tsx`'s `handleConfirm`. Doing the
    // navigation here, ahead of the Sheet closing, let Next tear the
    // component down mid-navigation before Radix's close cleanup ran,
    // leaving the Sheet's body scroll/focus-trap lock stuck on.
    return result
  }, [cvId, step])

  return {
    step,
    to,
    setTo,
    from,
    isSaving,
    reset,
    goToPick,
    goToConfirm,
    confirmDownload,
    runTranslate,
    updateReviewTitle,
    save,
  }
}
