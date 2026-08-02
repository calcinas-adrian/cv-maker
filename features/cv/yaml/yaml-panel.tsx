"use client"

import { useEffect, useRef, useState } from "react"
import { useEditorStore } from "@/features/cv/editor-store"
import type { CvData } from "@/schemas/cv.schema"
import { YamlEditor } from "./yaml-editor"
import { fromYamlView } from "./projection"
import { cvDataToYaml, validateYaml } from "./serialize"

const COMMIT_DEBOUNCE_MS = 500

/**
 * The "YAML is the live-edit view" half of the 5.5 toggle. Mounted only
 * while `activeView === "yaml"` in `cv-editor.tsx` — mounting fresh each
 * time is what implements the spec's "switching live-edit mode reseeds
 * from the store" scenario, since `text` seeds from the CURRENT `draft` at
 * mount time via `useState`'s lazy initializer.
 *
 * Commits are debounced and gated on a valid parse: `replaceDraft` (the
 * store) is only ever called with data that already passed
 * `yamlCvSchema.safeParse` inside `validateYaml` and then been reconciled
 * back into `CvData` by `fromYamlView` (career-bank-restructure Decision 5)
 * — an invalid edit updates local `error` state (surfaced by `YamlEditor`'s
 * inline diagnostics) and leaves the store untouched, per spec.
 *
 * `fromYamlView` is given the STORE's current draft as `previous`, read
 * fresh via `useEditorStore.getState()` at commit time rather than closed
 * over from a render — the debounce timer and the unmount-flush cleanup
 * below both fire from closures that may be stale by the time they run, and
 * bullet-provenance reconciliation must compare against what the draft
 * actually is at commit time, not what it was when the closure was created.
 *
 * Unmounting (view switch or CV switch) with a commit still pending inside
 * the debounce window would otherwise silently drop a valid edit — the
 * cleanup below flushes it synchronously instead of just clearing the
 * timer, via `textRef` (kept in sync with `text` on every change, since the
 * mount-once cleanup closure can't see a fresh `text` from state).
 */
export function YamlPanel({ draft }: { draft: CvData }) {
  const replaceDraft = useEditorStore((s) => s.replaceDraft)
  const [text, setText] = useState(() => cvDataToYaml(draft))
  const textRef = useRef(text)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function commitIfValid(source: string) {
    const result = validateYaml(source)
    if (result.ok) {
      const previous = useEditorStore.getState().draft ?? draft
      replaceDraft(fromYamlView(result.data, previous))
    }
    // Invalid parse: store is intentionally left untouched. The inline
    // diagnostic already shown by `YamlEditor` (same `validateYaml` call,
    // run live by its linter) is the only error surface needed here.
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        commitIfValid(textRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleChange(next: string) {
    setText(next)
    textRef.current = next
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      commitIfValid(next)
    }, COMMIT_DEBOUNCE_MS)
  }

  return <YamlEditor value={text} onChange={handleChange} className="h-full" />
}
