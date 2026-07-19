"use client"

import { useEffect, useRef, useState } from "react"
import { debounce } from "es-toolkit"
import { useEditorStore } from "./editor-store"
import { saveDraft } from "./actions"

export type AutosaveStatus = "idle" | "saving" | "saved" | "error"

const AUTOSAVE_DELAY_MS = 2000
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 1000

/**
 * Watches the editor draft for changes and autosaves them ~2s after the
 * user stops typing. Retries failed saves with exponential backoff, keeps
 * reporting the unsaved state until a save succeeds, and warns before the
 * tab is closed while a save is still pending.
 */
export function useAutosave(cvId: string, initialUpdatedAt: string) {
  const [status, setStatus] = useState<AutosaveStatus>("idle")
  const expectedUpdatedAtRef = useRef(initialUpdatedAt)
  const hasPendingChangesRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function attemptSave(attempt: number) {
      const draft = useEditorStore.getState().draft
      if (!draft) return

      setStatus("saving")
      const result = await saveDraft(cvId, draft, expectedUpdatedAtRef.current)
      if (cancelled) return

      if (result.ok) {
        expectedUpdatedAtRef.current = result.data.updatedAt
        hasPendingChangesRef.current = false
        setStatus("saved")
        return
      }

      if (attempt < MAX_ATTEMPTS) {
        const backoffMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
        setTimeout(() => {
          if (!cancelled) void attemptSave(attempt + 1)
        }, backoffMs)
        return
      }

      // Out of retries — keep hasPendingChangesRef true so the indicator
      // and the beforeunload guard both keep reflecting "unsaved".
      setStatus("error")
    }

    const debouncedSave = debounce(() => {
      void attemptSave(1)
    }, AUTOSAVE_DELAY_MS)

    const unsubscribe = useEditorStore.subscribe((state, prevState) => {
      if (state.draft !== prevState.draft) {
        hasPendingChangesRef.current = true
        debouncedSave()
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
      debouncedSave.cancel()
    }
  }, [cvId])

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (hasPendingChangesRef.current) {
        event.preventDefault()
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [])

  return { status }
}
