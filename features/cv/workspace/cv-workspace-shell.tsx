"use client"

import { useState, type ReactNode } from "react"
import { useParams } from "next/navigation"
import {
  Group as ResizablePanelGroup,
  Panel as ResizablePanel,
  Separator as ResizableHandle,
} from "react-resizable-panels"
import { usePersistedPanelLayout } from "@/hooks/use-persisted-panel-layout"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Button } from "@/components/ui/button"
import { TypstPreviewLazy } from "@/features/render/typst-preview-lazy"
import { DocumentSkeleton } from "@/features/render/cv-preview-skeleton"
import { CvWorkspaceShellSkeleton } from "@/features/cv/workspace/cv-workspace-shell-skeleton"
import { useEditorStore } from "@/features/cv/editor-store"
import type { CvListItem } from "@/features/cv/list"
import { CvListSidebar } from "./cv-list-sidebar"

// Deliberately local/duplicated (also defined in `../cv-editor.tsx`), NOT
// imported from `@/components/ui/resizable` — see that file's header
// comment for the Turbopack wrapping-component bug this works around.
const RESIZABLE_PANEL_GROUP_CLASSNAME = "h-full w-full"
// IMPORTANT: no `aria-[orientation=vertical]:*` variants here — see the
// long "REAL ROOT CAUSE" comment below. This Group is always
// `orientation="horizontal"`, whose separator always reports
// `aria-orientation="vertical"` (it visually renders as a vertical bar),
// so any `aria-[orientation=vertical]:*` class ALWAYS matches and would
// silently override these base styles.
const RESIZABLE_HANDLE_CLASSNAME =
  "bg-border hover:bg-primary/40 focus-visible:bg-primary focus-visible:ring-ring/50 relative z-10 w-px shrink-0 touch-none cursor-col-resize outline-none transition-colors focus-visible:ring-3"

// Below `lg` there is no room for all three panes side by side (see this
// file's header comment: the panels' pixel `minSize`s alone sum to ~900px),
// so the whole Group above is swapped out for one pane at a time behind
// this switcher. Order matches reading order left-to-right in the desktop
// layout (sidebar, editor, preview).
type WorkspacePane = "sidebar" | "editor" | "preview"

const WORKSPACE_PANES: ReadonlyArray<{ id: WorkspacePane; label: string }> = [
  { id: "sidebar", label: "Mis CVs" },
  { id: "editor", label: "Editor" },
  { id: "preview", label: "Vista previa" },
]

/**
 * ONE flat, top-level resizable group of the 3-column workspace: sidebar |
 * editor (`children`) | preview — deliberately NOT nested groups (design
 * Decision 4).
 *
 * ============================================================
 * REAL ROOT CAUSE of the `Infinity`/`NaN` flex-grow symptom (found this
 * batch — see `sdd/cv-editor-panel/apply-progress` for the full
 * bisection trail) — READ BEFORE TOUCHING THIS FILE'S STYLING.
 * ============================================================
 * Every earlier investigation (Phase 4 originally, and the first half of
 * this batch) attributed the bug to nested `Group`s and/or zustand's
 * `useSyncExternalStore` conflicting with the library. Both theories were
 * WRONG. The actual cause: `RESIZABLE_HANDLE_CLASSNAME` (hand-authored,
 * carried over from every prior version of this file) included
 * `aria-[orientation=vertical]:h-px aria-[orientation=vertical]:w-full
 * aria-[orientation=vertical]:cursor-row-resize`. This library sets
 * `aria-orientation="vertical"` on a separator to mean "this separator
 * renders as a vertical bar" — which is the case for EVERY separator this
 * app has ever rendered (all Groups here are `orientation="horizontal"`).
 * So that Tailwind arbitrary-attribute variant ALWAYS matched, and
 * (per Tailwind's own internal ordering) WON over the base `w-px` /
 * `cursor-col-resize` classes — collapsing the separator to `height:1px;
 * width:100%`, i.e. a full-width sliver instead of a vertical divider.
 * That corrupted `react-resizable-panels`' internal pixel-based
 * flex-grow computation into `Infinity`/`NaN` for every panel — 100%
 * reproducible via a real Chromium + `next build --turbopack` bisection
 * that isolated one variable at a time (zustand, nesting, module
 * boundaries, `usePersistedPanelLayout`, `CvListSidebar`, and finally
 * this className were each tested independently; only removing these
 * three arbitrary-variant classes fixed it). Nested Groups and zustand
 * were both RE-VERIFIED WORKING once this className was fixed — the
 * earlier nested-groups design was never actually broken by nesting or
 * zustand; it just always carried this same CSS bug in its separator.
 *
 * Because the preview pane lives HERE (moved up from `CvEditor`), and
 * `TypstPreviewLazy`/`TypstPreview` are standalone props-only components
 * (they do not read the store themselves — see
 * `features/render/typst-preview.tsx`), THIS component — which owns/
 * renders the Group — subscribes to `useEditorStore` directly to supply
 * `data`/`theme`. `draft` is `CvData | null` (null before `CvEditor`'s
 * first `hydrate`) but stays non-null and STALE (the previous CV's data)
 * for a frame or two during a CV switch — this store is a module-level
 * singleton, never reset between CVs. So the preview only mounts once
 * `draft` is non-null AND `activeCvId` (also set by `hydrate`) matches the
 * CV currently in the URL; the "Cargando…" fallback is shown otherwise.
 * Never fabricate an empty `CvData` here — that would mask real
 * hydration-timing bugs.
 *
 * Bonus: the preview + ~12MB WASM engine now live in this persistent
 * shell (rendered by `app/(dashboard)/cv/layout.tsx`), so they stay warm
 * across CV switches instead of reloading.
 */
export function CvWorkspaceShell({
  cvs,
  children,
}: {
  cvs: CvListItem[]
  children: ReactNode
}) {
  const { defaultLayout, onLayoutChange } =
    usePersistedPanelLayout("cv-workspace")
  const draft = useEditorStore((s) => s.draft)
  const theme = useEditorStore((s) => s.theme)
  const activeCvId = useEditorStore((s) => s.activeCvId)
  const params = useParams<{ id?: string }>()
  const isDesktop = useMediaQuery("(min-width: 1024px)")
  const [activePane, setActivePane] = useState<WorkspacePane>("editor")
  // Tracks the last CV id `activePane` was reset for — the "adjusting state
  // when a prop changes" pattern (see the React docs on effects), so this
  // reset happens synchronously during render instead of one frame later
  // in an effect. Jumping back to the editor pane whenever the open CV
  // changes is what makes tapping a CV in the "Mis CVs" pane (below `lg`)
  // both navigate AND show the editor, without `CvListSidebar` (which has
  // no idea a mobile pane switcher exists) having to know about it. Runs
  // on desktop too, harmlessly, since `activePane` is simply unread there.
  const [paneResetForCvId, setPaneResetForCvId] = useState(params.id)
  if (params.id !== paneResetForCvId) {
    setPaneResetForCvId(params.id)
    setActivePane("editor")
  }

  const previewNode =
    draft && activeCvId === params.id ? (
      <TypstPreviewLazy data={draft} theme={theme} className="h-full" />
    ) : (
      <div className="relative h-full overflow-hidden">
        <DocumentSkeleton
          experienceCount={2}
          projectCount={1}
          educationCount={1}
          skillCount={1}
          // 0 on purpose — see `cv-workspace-shell-skeleton.tsx`.
          credentialCount={0}
          referenceCount={0}
          className="h-full"
        />
        <div className="text-muted-foreground absolute inset-x-0 bottom-4 text-center text-xs">
          Cargando…
        </div>
      </div>
    )

  // Below `lg`, `isDesktop` picks ONE of the two trees below to actually
  // mount — never both at once. That matters because `children` (the
  // editor, with its autosave network loop) and `previewNode` (backed by a
  // ~12MB WASM engine, see this file's header comment) must never exist as
  // two live instances at the same time; a `hidden`-only/CSS-only version
  // of this split would render both trees into the DOM and double-mount
  // them. The one accepted cost: resizing an open window across the `lg`
  // breakpoint mid-edit switches which tree is mounted, so `CvEditor`
  // remounts and re-hydrates from its last-saved server draft (see
  // `CvEditor`'s mount effect) — any edit still inside the ~2s autosave
  // debounce at that exact moment is lost. Crossing `lg` by resizing a
  // live window (as opposed to loading the page at a given width) is rare
  // enough, and it does not warrant forcing the resizable Group itself to
  // also serve as the mobile single-pane container (see the "REAL ROOT
  // CAUSE" comment above for why this Group's styling is not something to
  // improvise on).
  //
  // Within the mobile tree itself all three panes stay mounted the whole
  // time — switching tabs only toggles `hidden`, so `CvEditor` never
  // remounts (and never loses unsaved state) just from tapping between
  // "Mis CVs" / "Editor" / "Vista previa".
  // Viewport still unknown (server render + hydration render): show the
  // skeleton rather than guessing a tree, so exactly one tree ever mounts.
  if (isDesktop === null) return <CvWorkspaceShellSkeleton />

  if (!isDesktop) {
    return (
      <div className="flex h-full w-full flex-col">
        <div
          role="tablist"
          aria-label="Panel del espacio de trabajo"
          className="flex shrink-0 items-center gap-1 border-b p-2"
        >
          {WORKSPACE_PANES.map((pane) => (
            <Button
              key={pane.id}
              type="button"
              role="tab"
              id={`workspace-tab-${pane.id}`}
              aria-selected={activePane === pane.id}
              aria-controls={`workspace-panel-${pane.id}`}
              variant={activePane === pane.id ? "secondary" : "ghost"}
              size="sm"
              className="min-w-0 flex-1 truncate"
              onClick={() => setActivePane(pane.id)}
            >
              {pane.label}
            </Button>
          ))}
        </div>
        <div
          id="workspace-panel-sidebar"
          role="tabpanel"
          aria-labelledby="workspace-tab-sidebar"
          hidden={activePane !== "sidebar"}
          className="min-h-0 flex-1"
        >
          <CvListSidebar cvs={cvs} />
        </div>
        <div
          id="workspace-panel-editor"
          role="tabpanel"
          aria-labelledby="workspace-tab-editor"
          hidden={activePane !== "editor"}
          className="min-h-0 flex-1"
        >
          {children}
        </div>
        <div
          id="workspace-panel-preview"
          role="tabpanel"
          aria-labelledby="workspace-tab-preview"
          hidden={activePane !== "preview"}
          className="min-h-0 flex-1"
        >
          {previewNode}
        </div>
      </div>
    )
  }

  return (
    <ResizablePanelGroup
      id="cv-workspace"
      orientation="horizontal"
      className={RESIZABLE_PANEL_GROUP_CLASSNAME}
      defaultLayout={defaultLayout}
      onLayoutChange={onLayoutChange}
    >
      <ResizablePanel
        id="sidebar"
        defaultSize="22%"
        minSize="220px"
        maxSize="360px"
      >
        <CvListSidebar cvs={cvs} />
      </ResizablePanel>
      <ResizableHandle className={RESIZABLE_HANDLE_CLASSNAME} />
      <ResizablePanel id="editor" defaultSize="43%" minSize="360px">
        {children}
      </ResizablePanel>
      <ResizableHandle className={RESIZABLE_HANDLE_CLASSNAME} />
      <ResizablePanel id="preview" defaultSize="35%" minSize="320px">
        {previewNode}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
