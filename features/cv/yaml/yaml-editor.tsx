"use client"

import { useEffect, useRef } from "react"
import { EditorView, basicSetup } from "codemirror"
import { yaml } from "@codemirror/lang-yaml"
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint"
import { cn } from "@/lib/utils"
import { validateYaml } from "./serialize"

export type YamlEditorProps = {
  value: string
  onChange: (value: string) => void
  className?: string
}

/**
 * CodeMirror 6 wrapper for the YAML view. Mounts the editor exactly once
 * (recreating it on every `value` change would fight the user's cursor);
 * external `value` updates (e.g. reseeding on view switch) sync into the
 * existing instance via a dispatched change instead.
 *
 * Diagnostics come from `validateYaml` — the SAME function the commit path
 * (`yaml-panel.tsx`) uses to decide whether to write to the store — run
 * through `@codemirror/lint`'s `linter()` so a syntax or schema error shows
 * up inline (gutter marker + underline) as the user types, not just as a
 * banner after a failed commit.
 */
export function YamlEditor({ value, onChange, className }: YamlEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!containerRef.current) return

    const yamlLinter = linter((view) => {
      const result = validateYaml(view.state.doc.toString())
      if (result.ok) return []

      const docLength = view.state.doc.length
      const from = Math.min(result.from ?? 0, docLength)
      const to = Math.min(result.to ?? docLength, docLength)
      const diagnostic: Diagnostic = {
        from,
        to: to > from ? to : from,
        severity: "error",
        message: result.error,
      }
      return [diagnostic]
    })

    const view = new EditorView({
      doc: value,
      extensions: [
        basicSetup,
        yaml(),
        lintGutter(),
        yamlLinter,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
      ],
      parent: containerRef.current,
    })

    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Intentionally mount-once: `value` resyncs are handled by the effect
    // below rather than by recreating the editor on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    })
  }, [value])

  return (
    <div
      ref={containerRef}
      className={cn(
        "h-full overflow-auto rounded-md border [&_.cm-editor]:h-full",
        className,
      )}
    />
  )
}
