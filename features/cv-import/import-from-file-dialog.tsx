"use client"

import { type ChangeEvent, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2Icon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResultErrorCode } from "@/lib/result"
import type { CvData } from "@/schemas/cv.schema"
import type {
  EducationExtract,
  ExperienceExtract,
  ProjectExtractItem,
  SkillExtract,
} from "@/schemas/cv-import.schema"
import { createCvFromImport, extractCvFromFile } from "./actions"
import { ACCEPTED_EXTENSIONS } from "./constants"
import { ReviewItemRow } from "./review-item-row"

type BasicInfo = {
  fullName: string
  email: string
  phone: string
  location: string
  summary: string
}

type Checked<T> = { id: string; data: T; included: boolean }
type ListSection = "experiences" | "projects" | "education" | "skills"

type ReviewState = {
  basicInfo: BasicInfo
  experiences: Checked<ExperienceExtract>[]
  projects: Checked<ProjectExtractItem>[]
  education: Checked<EducationExtract>[]
  skills: Checked<SkillExtract>[]
}

type Step =
  | { name: "pick" }
  | { name: "extracting"; fileName: string }
  | ({ name: "review" } & ReviewState)
  | { name: "error"; message: string; code: ResultErrorCode }

function toChecked<T>(items: T[]): Checked<T>[] {
  return items.map((data) => ({
    id: crypto.randomUUID(),
    data,
    included: true,
  }))
}

/**
 * Builds the final `CvData` draft sent to `createCvFromImport` from the
 * dialog's review state: the (possibly hand-edited) basic info plus only
 * the items the user left checked. Ids are minted here client-side purely
 * so the checklist has stable React keys/toggle targets — the server
 * always mints its own fresh ids on insert (`buildCvSectionQueries`), so
 * these never actually get persisted.
 */
function reviewStateToCvData(state: ReviewState): CvData {
  return {
    fullName: state.basicInfo.fullName || undefined,
    email: state.basicInfo.email || undefined,
    phone: state.basicInfo.phone || undefined,
    location: state.basicInfo.location || undefined,
    summary: state.basicInfo.summary || undefined,
    experiences: state.experiences
      .filter((item) => item.included)
      .map((item) => ({
        id: item.id,
        company: item.data.company,
        role: item.data.role,
        startDate: item.data.startDate,
        endDate: item.data.endDate,
        bullets: item.data.bullets,
      })),
    projects: state.projects
      .filter((item) => item.included)
      .map((item) => ({
        id: item.id,
        name: item.data.name,
        description: item.data.description,
        url: item.data.url,
        bullets: item.data.bullets,
      })),
    education: state.education
      .filter((item) => item.included)
      .map((item) => ({
        id: item.id,
        institution: item.data.institution,
        degree: item.data.degree,
        startDate: item.data.startDate,
        endDate: item.data.endDate,
      })),
    skills: state.skills
      .filter((item) => item.included)
      .map((item) => ({
        id: item.id,
        name: item.data.name,
        category: item.data.category,
      })),
  }
}

export function ImportFromFileDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>({ name: "pick" })
  const [isCreating, setIsCreating] = useState(false)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // Reset so reopening the dialog never resumes mid-review of a stale
      // draft (or a stale error) from a previous open — same reset
      // discipline as `features/github-import/import-dialog.tsx`.
      setStep({ name: "pick" })
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Clear the input value so picking the exact same file again later
    // still fires `onChange`.
    e.target.value = ""
    if (!file) return

    setStep({ name: "extracting", fileName: file.name })

    const formData = new FormData()
    formData.set("file", file)
    const result = await extractCvFromFile(formData)

    if (!result.ok) {
      setStep({ name: "error", message: result.error, code: result.code })
      return
    }

    const extracted = result.data
    setStep({
      name: "review",
      basicInfo: {
        fullName: extracted.fullName,
        email: extracted.email,
        phone: extracted.phone,
        location: extracted.location,
        summary: extracted.summary,
      },
      experiences: toChecked(extracted.experiences),
      projects: toChecked(extracted.projects),
      education: toChecked(extracted.education),
      skills: toChecked(extracted.skills),
    })
  }

  function updateBasicInfo(patch: Partial<BasicInfo>) {
    setStep((s) =>
      s.name === "review"
        ? { ...s, basicInfo: { ...s.basicInfo, ...patch } }
        : s,
    )
  }

  function toggleItem(section: ListSection, id: string) {
    setStep((s) => {
      if (s.name !== "review") return s
      return {
        ...s,
        [section]: s[section].map((item) =>
          item.id === id ? { ...item, included: !item.included } : item,
        ),
      }
    })
  }

  async function handleConfirm() {
    if (step.name !== "review") return
    setIsCreating(true)

    const draft = reviewStateToCvData(step)
    const result = await createCvFromImport(draft)

    setIsCreating(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    setOpen(false)
    setStep({ name: "pick" })
    router.push(`/cv/${result.data.id}/edit`)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <UploadIcon /> Importar de archivo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar CV desde un archivo</DialogTitle>
          <DialogDescription>
            Subí tu CV en PDF o DOCX — la IA arma un borrador que podés revisar
            acá y terminar de editar en el editor completo.
          </DialogDescription>
        </DialogHeader>

        {step.name === "pick" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="cv-file-input">Archivo (PDF o DOCX)</Label>
            <input
              id="cv-file-input"
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(",")}
              onChange={handleFileChange}
              className="file:bg-secondary file:text-secondary-foreground text-muted-foreground text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </div>
        ) : step.name === "extracting" ? (
          <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Extrayendo información de {step.fileName}…
          </div>
        ) : step.name === "review" ? (
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="import-fullName">Nombre completo</Label>
                  <Input
                    id="import-fullName"
                    value={step.basicInfo.fullName}
                    onChange={(e) =>
                      updateBasicInfo({ fullName: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="import-email">Email</Label>
                  <Input
                    id="import-email"
                    type="email"
                    value={step.basicInfo.email}
                    onChange={(e) => updateBasicInfo({ email: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="import-phone">Teléfono</Label>
                  <Input
                    id="import-phone"
                    value={step.basicInfo.phone}
                    onChange={(e) => updateBasicInfo({ phone: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="import-location">Ubicación</Label>
                  <Input
                    id="import-location"
                    value={step.basicInfo.location}
                    onChange={(e) =>
                      updateBasicInfo({ location: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="import-summary">Resumen</Label>
                <Textarea
                  id="import-summary"
                  rows={3}
                  value={step.basicInfo.summary}
                  onChange={(e) => updateBasicInfo({ summary: e.target.value })}
                />
              </div>
            </div>

            {(
              [
                ["experiences", "Experiencia"],
                ["projects", "Proyectos"],
                ["education", "Educación"],
                ["skills", "Habilidades"],
              ] as const
            ).map(([section, label]) => {
              const items = step[section]
              if (items.length === 0) return null
              return (
                <div key={section} className="flex flex-col gap-2">
                  <p className="text-sm font-medium">
                    {label}{" "}
                    <span className="text-muted-foreground font-normal">
                      ({items.filter((i) => i.included).length}/{items.length})
                    </span>
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {items.map((item) => {
                      const { title, subtitle } = describeItem(
                        section,
                        item.data,
                      )
                      return (
                        <ReviewItemRow
                          key={item.id}
                          title={title}
                          subtitle={subtitle}
                          included={item.included}
                          onToggle={() => toggleItem(section, item.id)}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}

            <p className="text-muted-foreground text-xs">
              Después de crear el CV vas a poder editar cada sección en detalle
              desde el editor.
            </p>

            <DialogFooter>
              <Button
                type="button"
                disabled={isCreating}
                onClick={handleConfirm}
              >
                {isCreating ? "Creando…" : "Crear CV"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {step.code === "provider_not_configured" ? (
              <p className="text-sm">
                {step.message}{" "}
                <Link href="/settings" className="underline">
                  Ir a Ajustes
                </Link>
              </p>
            ) : (
              <p className="text-destructive text-sm">{step.message}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep({ name: "pick" })}
              >
                Volver
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function describeItem(
  section: ListSection,
  data:
    ExperienceExtract | ProjectExtractItem | EducationExtract | SkillExtract,
): { title: string; subtitle?: string } {
  switch (section) {
    case "experiences": {
      const item = data as ExperienceExtract
      return {
        title: [item.role, item.company].filter(Boolean).join(" @ "),
        subtitle: [item.startDate, item.endDate].filter(Boolean).join(" – "),
      }
    }
    case "projects": {
      const item = data as ProjectExtractItem
      return { title: item.name, subtitle: item.description }
    }
    case "education": {
      const item = data as EducationExtract
      return {
        title: [item.degree, item.institution].filter(Boolean).join(" @ "),
        subtitle: [item.startDate, item.endDate].filter(Boolean).join(" – "),
      }
    }
    case "skills": {
      const item = data as SkillExtract
      return { title: item.name, subtitle: item.category ?? undefined }
    }
  }
}
