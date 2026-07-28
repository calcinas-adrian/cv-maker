"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Download, RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AdaptCvDialog } from "@/features/cv-adapt/adapt-dialog"
import { TranslateCvDialog } from "@/features/cv-translate/translate-dialog"
import type { CvData, CvTheme } from "@/schemas/cv.schema"
import { AutosaveIndicator } from "./autosave-indicator"
import { CvEditorSkeleton } from "./cv-editor-skeleton"
import { useEditorStore } from "./editor-store"
import { AchievementSection } from "./sections/achievement-section"
import { BasicInfoCard } from "./sections/basic-info-card"
import { EducationSection } from "./sections/education-section"
import { ExperienceSection } from "./sections/experience-section"
import { ProjectSection } from "./sections/project-section"
import { ReferenceSection } from "./sections/reference-section"
import { SkillSection } from "./sections/skill-section"
import { useAutosave } from "./use-autosave"
import { useUndoRedoShortcuts } from "./use-undo-redo-shortcuts"
import { VersionHistory } from "./version-history"
import { ThemePicker } from "./theme/theme-picker"
import { YamlPanel } from "./yaml/yaml-panel"

type ContentView = "form" | "yaml"

/**
 * Renders ONLY the form sections, into the middle ("editor") panel of
 * `CvWorkspaceShell`'s single flat resizable Group — no resizable Group of
 * its own, no preview mount. The preview moved UP into the shell, which
 * subscribes to the store directly to feed it `data`/`theme` (design
 * Decision 4; see `features/cv/workspace/cv-workspace-shell.tsx` and
 * `sdd/cv-editor-panel/design`).
 *
 * `app/(dashboard)/cv/[id]/edit/page.tsx` mounts this with `key={cvId}`.
 * Because `useEditorStore` is a module-level singleton and the persistent
 * `/cv/*` layout (design Decision 1) does NOT remount on sidebar
 * navigation, switching CVs would otherwise leave this component's
 * mount-only `hydrate` effect and `useAutosave`'s mount-only concurrency
 * ref pointed at the PREVIOUS CV. Keying forces a clean unmount+remount on
 * every CV switch, re-running both mount effects with the new CV's props
 * (design Decision 1 addendum).
 */
export function CvEditor({
  cvId,
  initialData,
  initialUpdatedAt,
  initialTheme,
  initialTitle,
}: {
  cvId: string
  initialData: CvData
  initialUpdatedAt: string
  initialTheme: CvTheme
  initialTitle: string
}) {
  const hydrate = useEditorStore((s) => s.hydrate)
  const setTheme = useEditorStore((s) => s.setTheme)
  const draft = useEditorStore((s) => s.draft)
  const activeCvId = useEditorStore((s) => s.activeCvId)
  const [activeView, setActiveView] = useState<ContentView>("form")
  const router = useRouter()
  const [isRefreshing, startRefresh] = useTransition()

  useEffect(() => {
    // Hydrate once on mount from the server-provided initial data only.
    //
    // `pause()`/`resume()` bracket the `hydrate` call so the hydration
    // write itself never creates an undo entry — `isTracking` is checked
    // SYNCHRONOUSLY at the `set()` call inside zundo (before the throttled
    // `handleSet` even runs), so pausing here fully suppresses it rather
    // than racing the 400ms throttle. `clear()` right after drops any undo
    // history a PREVIOUS CV may have left in this singleton store (this
    // component remounts per CV via `key={cvId}` on the page, but the
    // store itself does not reset on remount) — design Decision 1
    // addendum ("CV-switch re-hydration").
    //
    // Kept here, in the component's mount effect, rather than inside
    // `hydrate` itself, so `VersionHistory`'s in-place `hydrate(snapshot)`
    // restore stays undoable.
    const temporal = useEditorStore.temporal.getState()
    temporal.pause()
    hydrate(initialData, cvId)
    temporal.resume()
    temporal.clear()
    // `theme` is already outside `partialize` (never undo-tracked), so this
    // needs no pause/resume — see `editor-store.ts`.
    setTheme(initialTheme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useUndoRedoShortcuts()
  const { status } = useAutosave(cvId, initialUpdatedAt)

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex items-center justify-between border-b p-4">
        <h1 className="text-lg font-medium">Editar CV</h1>
        <div className="flex items-center gap-3">
          <AutosaveIndicator status={status} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRefreshing}
            onClick={() => startRefresh(() => router.refresh())}
          >
            <RefreshCwIcon
              data-icon="inline-start"
              className={isRefreshing ? "animate-spin" : undefined}
            />
            Recargar
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/render/${cvId}`} download>
              <Download data-icon="inline-start" />
              Descargar PDF
            </a>
          </Button>
          <AdaptCvDialog cvId={cvId} />
          <TranslateCvDialog cvId={cvId} title={initialTitle} />
        </div>
      </div>

      {/*
        Theme picker + form/YAML toggle live in their own bar, OUTSIDE the
        `activeView` branch below, so theme stays editable regardless of
        which content view is active (theme is presentation, orthogonal to
        content — design Decision 2) and the toggle itself is always
        reachable. Both live INSIDE this single "editor" panel — no new
        resizable Group, per the hard constraint carried from Phase 4's
        fix (see `cv-workspace-shell.tsx`).
      */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
        <ThemePicker cvId={cvId} />
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <Button
            type="button"
            variant={activeView === "form" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveView("form")}
          >
            Formulario
          </Button>
          <Button
            type="button"
            variant={activeView === "yaml" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveView("yaml")}
          >
            YAML
          </Button>
        </div>
      </div>

      {activeCvId !== cvId ? (
        // `draft`/`activeCvId` still belong to a previously mounted CV for
        // one or more frames after a switch (this store is a module-level
        // singleton, never reset between CVs — see `editor-store.ts`).
        // Render the same skeleton `loading.tsx` uses instead of letting
        // `BasicInfoCard` etc. (which read `s.draft` with no cvId-awareness)
        // or `YamlPanel` briefly render the wrong CV's content.
        <CvEditorSkeleton />
      ) : activeView === "form" ? (
        // `shrink-0` on every card: `Card` sets `overflow-hidden`, and per
        // the flexbox spec a flex item with non-visible overflow gets an
        // automatic min-height of 0 — without this, the browser compresses
        // each card toward zero height (showing only its header) instead of
        // letting this container's `overflow-y-auto` scroll past them.
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 *:shrink-0">
          <BasicInfoCard />
          <ExperienceSection />
          <ProjectSection cvId={cvId} />
          <EducationSection />
          <SkillSection />
          <AchievementSection />
          <ReferenceSection />
          <VersionHistory cvId={cvId} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 p-4">
          <YamlPanel draft={draft!} />
        </div>
      )}
    </div>
  )
}
