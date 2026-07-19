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
    hydrate(initialData)
    // Hydrate once on mount from the server-provided initial data only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useUndoRedoShortcuts()
  const { status } = useAutosave(cvId, initialUpdatedAt)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
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
      <BasicInfoCard />
      <ExperienceSection />
      <ProjectSection cvId={cvId} />
      <EducationSection />
      <SkillSection />
      <VersionHistory cvId={cvId} />
    </div>
  )
}
