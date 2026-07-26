"use client"

import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import type { CvData, CvTheme } from "@/schemas/cv.schema"
import { toTypstPayload, toThemePayload } from "@/features/render/typst-payload"
import { compilePreview } from "@/features/render/typst-client"
import { DocumentSkeleton } from "@/features/render/cv-preview-skeleton"

/**
 * Live Typst preview pane. Standalone and reusable on purpose: it takes
 * `data`/`theme` as props rather than reading `features/cv/editor-store.ts`
 * directly, so it can be dropped into the real 3-column layout (Phase 4) or
 * exercised in isolation without any store wiring.
 *
 * Not exported as the default import site for Phase 4 — mount
 * `TypstPreviewLazy` (`./typst-preview-lazy`) instead, so this component
 * (and the ~12MB WASM+font engine it pulls in via `typst-client.ts`) only
 * ever enters the bundle behind a `next/dynamic({ ssr: false })` boundary.
 */

// No design/tasks-specified value for the recompile debounce; chosen to
// match the feel of the existing form autosave path, which throttles
// zundo's `handleSet` at 400ms (`features/cv/editor-store.ts`).
const DEBOUNCE_MS = 400

export type TypstPreviewProps = {
  data: CvData
  theme: CvTheme
  className?: string
}

export default function TypstPreview({
  data,
  theme,
  className,
}: TypstPreviewProps) {
  // Content-based (not reference-based) dependency: two renders with a new
  // `data`/`theme` object but identical content serialize to the same
  // string, so the effect below does NOT re-run — this is what satisfies
  // the spec's "no redundant recompile without a data change" scenario.
  const serializedInputs = useMemo(
    () =>
      JSON.stringify({
        cvData: toTypstPayload(data),
        themeJson: toThemePayload(theme),
      }),
    [data, theme],
  )

  // `key` tracks which `serializedInputs` the current `svg`/`error` pair was
  // compiled from. `isCompiling` is DERIVED from `key !== serializedInputs`
  // instead of a separate boolean flipped synchronously inside the effect
  // body — react-hooks' `set-state-in-effect` rule flags a synchronous
  // `setState` at the top of an effect (cascading-render risk); deriving it
  // avoids that entirely, and as a side benefit keeps the last successful
  // `svg` visible (as a dimmed/"Actualizando…" state) while a recompile is
  // in flight, instead of flashing blank on every keystroke.
  const [state, setState] = useState<{
    key: string
    svg: string | null
    error: string | null
  }>({
    key: "",
    svg: null,
    error: null,
  })
  const isCompiling = state.key !== serializedInputs
  const { svg, error } = state

  useEffect(() => {
    let cancelled = false

    const timer = setTimeout(() => {
      compilePreview(data, theme).then((result) => {
        if (cancelled) return
        setState((prev) => ({
          key: serializedInputs,
          svg: result.ok ? result.svg : prev.svg,
          error: result.ok ? null : result.error,
        }))
      })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // `serializedInputs` IS the real dependency (see comment above); `data`
    // and `theme` are read here from the same render that produced it, so
    // they're always in sync with what was serialized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedInputs])

  return (
    <div
      className={cn(
        "bg-background relative h-full w-full overflow-auto",
        className,
      )}
    >
      {svg ? (
        <div
          data-testid="typst-preview-svg"
          className="[&_svg]:h-auto [&_svg]:w-full"
          // `svg` is Typst-engine-generated markup compiled from data that
          // `classic.typ` only ever treats as inert string data (see the
          // SECURITY note at the top of that file) — never re-parsed as
          // Typst source, and never containing user-supplied HTML/script.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : null}

      {isCompiling && !svg ? (
        <div className="relative h-full overflow-hidden">
          <DocumentSkeleton
            experienceCount={data.experiences.length}
            projectCount={data.projects.length}
            educationCount={data.education.length}
            skillCount={data.skills.length}
            className="h-full"
          />
          <div className="text-muted-foreground absolute inset-x-0 bottom-4 text-center text-xs">
            Generando vista previa…
          </div>
        </div>
      ) : null}

      {isCompiling && svg ? (
        <div className="bg-muted text-muted-foreground absolute top-2 right-2 rounded-full px-2 py-0.5 text-xs">
          Actualizando…
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive absolute inset-x-0 bottom-0 border-t p-3 text-xs"
        >
          No se pudo generar la vista previa: {error}
        </div>
      ) : null}
    </div>
  )
}
