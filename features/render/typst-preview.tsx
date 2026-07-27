"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { CvData, CvTheme } from "@/schemas/cv.schema"
import { toTypstPayload, toThemePayload } from "@/features/render/typst-payload"
import { compilePreview, type PageInfo } from "@/features/render/typst-client"
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

// No design-specified zoom step/range; ±0.1 per wheel tick and a
// 0.5x-3x range read as a reasonable, discoverable gesture-only zoom
// without ever letting the document shrink to illegible or blow up past
// what the container can usefully scroll.
const ZOOM_STEP = 0.1
const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const ZOOM_DOUBLE_CLICK_SCALE = 2

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
    pages: PageInfo[]
    error: string | null
  }>({
    key: "",
    svg: null,
    pages: [],
    error: null,
  })
  const isCompiling = state.key !== serializedInputs
  const { svg, pages, error } = state

  useEffect(() => {
    let cancelled = false

    const timer = setTimeout(() => {
      compilePreview(data, theme).then((result) => {
        if (cancelled) return
        setState((prev) => ({
          key: serializedInputs,
          svg: result.ok ? result.svg : prev.svg,
          pages: result.ok ? result.pages : prev.pages,
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

  // `containerRef` is the scrollable "preview area" the ctrl+wheel/double-
  // click gestures listen on; `wrapperRef` is the inner zoomable content
  // (paper page(s) + divider overlay only — never the skeleton/error/pill
  // chrome) that `transform: scale()` actually applies to.
  //
  // `transformOrigin` is pinned at "0 0" (top-left) instead of following the
  // cursor: a `scale()` around any OTHER origin grows the box in every
  // direction, including up/left past the wrapper's own layout edge — and
  // `overflow-auto` can never scroll to a negative `scrollLeft`/`scrollTop`,
  // so that leftward/upward growth becomes permanently unreachable (this
  // was the reported "can't scroll left" bug). Scaling only from the
  // top-left instead only ever grows the box down/right, which native
  // scrolling handles correctly in both axes.
  //
  // To still keep the zoom visually anchored under the cursor (rather than
  // always zooming toward the top-left corner), `scrollLeft`/`scrollTop`
  // are corrected by hand right after each scale change, in the
  // `useLayoutEffect` below — the same technique PDF/map viewers use for
  // cursor-anchored zoom on a plain scrollable container.
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  // Set synchronously by the event handlers (wheel tick / double-click),
  // consumed once by the `useLayoutEffect` right after `scale` commits, then
  // cleared — never read stale, since every zoom gesture overwrites it
  // before triggering the state change that the effect reacts to.
  const pendingZoomRef = useRef<{
    prevScale: number
    nextScale: number
    contentX: number
    contentY: number
    pointerX: number
    pointerY: number
  } | null>(null)

  function beginZoom(
    container: HTMLDivElement,
    clientX: number,
    clientY: number,
  ) {
    const rect = container.getBoundingClientRect()
    const pointerX = clientX - rect.left
    const pointerY = clientY - rect.top
    return {
      // Position of the cursor within the *scrollable content*, not just the
      // viewport — adding the current scroll offset is what lets the
      // compensation below work no matter where the user had already
      // scrolled to.
      contentX: container.scrollLeft + pointerX,
      contentY: container.scrollTop + pointerY,
      pointerX,
      pointerY,
    }
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      // Must run outside React's synthetic (passive) wheel handling, or
      // this `preventDefault()` can be silently ignored and the browser
      // zooms the whole page instead of just the preview.
      e.preventDefault()
      if (!container) return

      const anchor = beginZoom(container, e.clientX, e.clientY)
      setScale((prevScale) => {
        const nextScale = Math.min(
          ZOOM_MAX,
          Math.max(
            ZOOM_MIN,
            prevScale + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP),
          ),
        )
        pendingZoomRef.current = { prevScale, nextScale, ...anchor }
        return nextScale
      })
    }

    container.addEventListener("wheel", handleWheel, { passive: false })
    return () => container.removeEventListener("wheel", handleWheel)
  }, [])

  function handleDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    const container = containerRef.current
    if (!container) return

    const anchor = beginZoom(container, e.clientX, e.clientY)
    setScale((prevScale) => {
      const nextScale = prevScale === 1 ? ZOOM_DOUBLE_CLICK_SCALE : 1
      pendingZoomRef.current = { prevScale, nextScale, ...anchor }
      return nextScale
    })
  }

  // Runs after `scale` commits (before paint): re-derives where the
  // anchored content point ended up post-scale — `contentX/Y` scale
  // linearly with the scale ratio since `transformOrigin` is fixed at
  // "0 0" — and moves scroll to put that same point back under the
  // cursor. The browser clamps out-of-range `scrollLeft`/`scrollTop`
  // assignments on its own, so no manual clamping is needed here.
  useLayoutEffect(() => {
    const pending = pendingZoomRef.current
    const container = containerRef.current
    if (!pending || !container) return
    pendingZoomRef.current = null

    const ratio = pending.nextScale / pending.prevScale
    container.scrollLeft = pending.contentX * ratio - pending.pointerX
    container.scrollTop = pending.contentY * ratio - pending.pointerY
  }, [scale])

  // Pixel offset that centers the (already-scaled) content inside the
  // container, on whichever axis it demonstrably fits — measured in real
  // pixels via `getBoundingClientRect()`, never inferred from `scale <= 1`
  // (a tall multi-page CV can still overflow vertically even at 100%).
  // Applied as a `translate()` folded into the SAME `transform` as the
  // zoom `scale()` (see the style below) rather than via flexbox
  // (`items-center`/`justify-center` on a wrapping flex container): making
  // `wrapperRef` a flex item switched its width from "fill 100% of the
  // container" to flexbox's default content-based (shrink-to-fit) sizing,
  // which desynced this measurement from the actual overflow state and
  // reintroduced the exact "unreachable negative scroll" bug fixed above —
  // a `translate()` offset only ever moves the box within space that's
  // already known (by this same measurement) not to overflow, so it can't
  // create that situation.
  const [centerOffset, setCenterOffset] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    const container = containerRef.current
    const wrapper = wrapperRef.current
    if (!container || !wrapper) return

    function measure() {
      if (!container || !wrapper) return
      const rect = wrapper.getBoundingClientRect()
      setCenterOffset({
        x:
          rect.width <= container.clientWidth
            ? (container.clientWidth - rect.width) / 2
            : 0,
        y:
          rect.height <= container.clientHeight
            ? (container.clientHeight - rect.height) / 2
            : 0,
      })
    }

    measure()

    // `ResizeObserver`'s content-box size is unaffected by `transform`, so
    // it can't see scale-driven size changes on its own — that's why
    // `scale`/`svg`/`pages` are also in this effect's deps below. It's only
    // needed here to catch the CONTAINER's own size changing (window
    // resize, a sidebar collapsing) independent of any zoom/content change.
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [scale, svg, pages])

  // `PageInfo.pageOffset` is NOT a vertical render position — it's the
  // engine's internal `page_off` artifact offset (the same value
  // `RenderCanvasOptions.pageOffset` uses as a page *selector*, not a
  // coordinate). Only `height` (`height_pt` from the engine) is a real
  // physical measurement, so page-start offsets have to be rebuilt from a
  // running sum of heights instead of trusting `pageOffset`.
  const pageStartsPt: number[] = []
  let cumulativeHeightPt = 0
  for (const page of pages) {
    pageStartsPt.push(cumulativeHeightPt)
    cumulativeHeightPt += page.height
  }
  const totalHeightPt = cumulativeHeightPt

  return (
    <div
      ref={containerRef}
      onDoubleClick={handleDoubleClick}
      className={cn(
        "relative h-full w-full overflow-auto bg-neutral-200",
        className,
      )}
    >
      <div
        ref={wrapperRef}
        className="relative"
        style={{
          transform: `translate(${centerOffset.x}px, ${centerOffset.y}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        {svg ? (
          <div className="relative bg-white shadow-md">
            <div
              data-testid="typst-preview-svg"
              className="[&_svg]:h-auto [&_svg]:w-full"
              // `svg` is Typst-engine-generated markup compiled from data that
              // `classic.typ` only ever treats as inert string data (see the
              // SECURITY note at the top of that file) — never re-parsed as
              // Typst source, and never containing user-supplied HTML/script.
              dangerouslySetInnerHTML={{ __html: svg }}
            />

            {/* The rendered SVG stretches to the container's width with
            height auto (its `viewBox` preserves aspect ratio), so any pt
            offset within the total document maps linearly to a percentage
            of the rendered height — these dividers stay aligned across
            container resize without tracking any pixel size. A fixed-height
            band (not a percentage) is intentional: it lives inside the same
            `wrapperRef` that gets `transform: scale()` for zoom, so it scales
            together with the page content instead of needing its own zoom
            math. The band is opaque `bg-neutral-200` (the canvas color)
            painted over the boundary — since `classic.typ`'s page margin
            leaves that area blank in the vast majority of cases, it reads as
            a real gap between two separate sheets rather than one continuous
            page, without duplicating/cropping the SVG per page. */}
            {pages.length >= 2 && totalHeightPt > 0
              ? pageStartsPt.slice(1).map((startPt, i) => (
                  <div
                    key={startPt}
                    className="absolute inset-x-0 flex -translate-y-1/2 items-center justify-center"
                    style={{
                      top: `${(startPt / totalHeightPt) * 100}%`,
                      height: 28,
                    }}
                  >
                    <div className="absolute inset-0 bg-neutral-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.18),inset_0_-2px_4px_rgba(0,0,0,0.18)]" />
                    <span className="relative rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-medium text-neutral-600 shadow-sm">
                      Página {i + 2} de {pages.length}
                    </span>
                  </div>
                ))
              : null}
          </div>
        ) : null}
      </div>

      {isCompiling && !svg ? (
        <div className="relative h-full overflow-hidden">
          <DocumentSkeleton
            experienceCount={data.experiences.length}
            projectCount={data.projects.length}
            educationCount={data.education.length}
            skillCount={data.skills.length}
            achievementCount={data.achievements.length}
            referenceCount={data.references.length}
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
