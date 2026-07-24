"use client"

import { useEffect } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CvData } from "@/schemas/cv.schema"
import { AutosaveIndicator } from "./autosave-indicator"
import { useEditorStore } from "./editor-store"
import { BasicInfoCard } from "./sections/basic-info-card"
import { EducationSection } from "./sections/education-section"
import { ExperienceSection } from "./sections/experience-section"
import { ProjectSection } from "./sections/project-section"
import { SkillSection } from "./sections/skill-section"
import { useAutosave } from "./use-autosave"
import { useUndoRedoShortcuts } from "./use-undo-redo-shortcuts"
import { VersionHistory } from "./version-history"

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
}: {
  cvId: string
  initialData: CvData
  initialUpdatedAt: string
}) {
  const hydrate = useEditorStore((s) => s.hydrate)

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
    hydrate(initialData)
    temporal.resume()
    temporal.clear()
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
          <Button asChild variant="outline" size="sm">
            <a href={`/api/render/${cvId}`} download>
              <Download data-icon="inline-start" />
              Descargar PDF
            </a>
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <BasicInfoCard />
        <ExperienceSection />
        <ProjectSection cvId={cvId} />
        <EducationSection />
        <SkillSection />
        <VersionHistory cvId={cvId} />
      </div>
    </div>
  )
}
