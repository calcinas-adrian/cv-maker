"use client"

import { type ChangeEvent, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { AiRunPreflight } from "@/components/ai-run-preflight"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
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
import { listModelOptions } from "@/features/ai-providers/actions"
import { hasPersonalBank } from "@/features/career-bank/actions"
import {
  ImportDestinationPicker,
  type ImportDestination,
} from "@/features/career-bank/import-destination-picker"
import { createCvFromImport, extractCvFromFile } from "./actions"
import {
  ACCEPTED_EXTENSIONS,
  FILE_TOO_LARGE_ERROR,
  MAX_FILE_SIZE_BYTES,
  UNSUPPORTED_FILE_TYPE_ERROR,
} from "./constants"
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
  // Picking a file no longer starts anything. It lands HERE, where the user
  // can read back which file they actually chose and drop it — a paid,
  // unstoppable call must never be one misclick away in a file browser.
  // Carries no payload: the file itself lives in `pickedFile`, so the error
  // step can come back to this one without it.
  | { name: "confirm" }
  | { name: "extracting"; fileName: string }
  | ({ name: "review" } & ReviewState)
  | { name: "error"; message: string; code: ResultErrorCode }

/** e.g. `2,4 MB` — sized for a human deciding "is this the right file". */
function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1).replace(".", ",")} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

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
        // Extracted bullets carry no bank identity of their own here — each
        // gets a fresh id and `sourceMaterialId: null`, same as a hand-typed
        // bullet. `createCvFromImport`'s bank branch (Decision 8) stamps
        // real `sourceMaterialId`s server-side when the destination is
        // "bank", AFTER this function runs; this stays the CV-only shape.
        bullets: item.data.bullets.map((content) => ({
          id: crypto.randomUUID(),
          content,
          sourceMaterialId: null,
        })),
      })),
    projects: state.projects
      .filter((item) => item.included)
      .map((item) => ({
        id: item.id,
        name: item.data.name,
        description: item.data.description,
        url: item.data.url,
        bullets: item.data.bullets.map((content) => ({
          id: crypto.randomUUID(),
          content,
          sourceMaterialId: null,
        })),
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
    // Always empty: `cvExtractSchema` has no credentials/languages/
    // references output channel, so the model never produces them and
    // there is nothing to review here. The user adds them by hand in the
    // editor afterwards. Kept as explicit `[]` rather than omitted so this
    // stays a visible decision — and so adding an extraction channel later
    // fails loudly here instead of silently dropping the extracted rows.
    credentials: [],
    languages: [],
    references: [],
  }
}

export function ImportFromFileDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>({ name: "pick" })
  const [isCreating, setIsCreating] = useState(false)
  // Lives OUTSIDE `step` for the same reason `adapt-dialog.tsx` keeps the
  // posting text outside its own: so `error -> "Volver"` can land back on
  // the confirm step with the file still selected. Re-opening the OS file
  // browser to re-find the same CV after a transient 429 is exactly the
  // kind of friction this whole flow is meant to remove. Reset only on
  // close.
  const [pickedFile, setPickedFile] = useState<File | null>(null)
  // Only ever displayed — `extractCvFromFile` resolves the user's default
  // model server-side and takes no model argument. Shown anyway because
  // "which model is about to spend my tokens" is precisely the kind of fact
  // the user cannot see from the file picker.
  const [defaultModelLabel, setDefaultModelLabel] = useState<string | null>(
    null,
  )
  // Decision 8: BOTH importers default to "bank" — no per-importer
  // divergence. Forced to "cv_only" below whenever `bankAvailable` is false.
  const [destination, setDestination] = useState<ImportDestination>("bank")

  const bankQuery = useQuery({
    queryKey: ["personal-bank-exists"],
    queryFn: () => hasPersonalBank(),
    enabled: open,
  })
  const bankAvailable = bankQuery.data?.ok ? bankQuery.data.data.hasBank : false
  // The actually-applied destination — never trusts `destination` alone,
  // same defensive gate `ImportDestinationPicker` itself renders (disabled +
  // forced "cv_only" when no bank exists).
  const effectiveDestination: ImportDestination = bankAvailable
    ? destination
    : "cv_only"

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      // Fetched on open rather than on mount: this dialog's trigger renders
      // on `/dashboard` for everyone, and most visits never open it.
      void listModelOptions().then((result) => {
        if (!result.ok) return
        const fallback = result.data[0]
        setDefaultModelLabel(
          (result.data.find((option) => option.isDefault) ?? fallback)
            ?.modelId ?? null,
        )
      })
      return
    }
    // Reset so reopening the dialog never resumes mid-review of a stale
    // draft (or a stale error) from a previous open — same reset
    // discipline as `features/github-import/import-dialog.tsx`.
    setStep({ name: "pick" })
    setPickedFile(null)
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Clear the input value so picking the exact same file again later
    // still fires `onChange`.
    e.target.value = ""
    if (!file) return

    // Validated HERE as well as on the server. The server checks are the
    // real guard and stay; these exist so a wrong file is rejected on the
    // same frame it is picked, instead of after a round trip that looks
    // like the import already started.
    const hasAcceptedExtension = ACCEPTED_EXTENSIONS.some((extension) =>
      file.name.toLowerCase().endsWith(extension),
    )
    if (!hasAcceptedExtension) {
      toast.error(UNSUPPORTED_FILE_TYPE_ERROR)
      return
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(FILE_TOO_LARGE_ERROR)
      return
    }

    setPickedFile(file)
    setStep({ name: "confirm" })
  }

  async function handleExtract(file: File) {
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
    const result = await createCvFromImport(
      draft,
      effectiveDestination,
      pickedFile?.name ?? "archivo",
    )

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
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <UploadIcon /> Importar de archivo
        </Button>
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Importar CV desde un archivo</SheetTitle>
          <SheetDescription>
            Subí tu CV en PDF o DOCX — la IA arma un borrador que podés revisar
            acá y terminar de editar en el editor completo.
          </SheetDescription>
        </SheetHeader>

        {step.name === "pick" ? (
          <SheetBody className="flex flex-col gap-2">
            <Label htmlFor="cv-file-input">Archivo (PDF o DOCX)</Label>
            <input
              id="cv-file-input"
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(",")}
              onChange={handleFileChange}
              className="file:bg-secondary file:text-secondary-foreground text-muted-foreground text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            <p className="text-muted-foreground text-xs">
              Vas a poder revisar el archivo antes de que se procese.
            </p>
          </SheetBody>
        ) : step.name === "confirm" ? (
          // `pickedFile` is always set on the way in; the null branch only
          // exists so this step degrades to "pick again" instead of to a
          // blank sheet if that ever stops being true.
          !pickedFile ? (
            <SheetBody>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep({ name: "pick" })}
              >
                Elegir un archivo
              </Button>
            </SheetBody>
          ) : (
            <>
              <SheetBody>
                <AiRunPreflight
                  rows={[
                    { label: "Archivo", value: pickedFile.name },
                    { label: "Tamaño", value: formatFileSize(pickedFile.size) },
                    {
                      label: "Modelo",
                      value: defaultModelLabel ?? "Tu modelo por defecto",
                    },
                  ]}
                />
              </SheetBody>
              <SheetFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPickedFile(null)
                    setStep({ name: "pick" })
                  }}
                >
                  Elegir otro archivo
                </Button>
                <Button type="button" onClick={() => handleExtract(pickedFile)}>
                  Leer este archivo
                </Button>
              </SheetFooter>
            </>
          )
        ) : step.name === "extracting" ? (
          <SheetBody className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Extrayendo información de {step.fileName}…
          </SheetBody>
        ) : step.name === "review" ? (
          <>
            <SheetBody className="flex flex-col gap-4">
              <ImportDestinationPicker
                value={destination}
                onChange={setDestination}
                bankAvailable={bankAvailable}
                idPrefix="file-import"
              />
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
                      onChange={(e) =>
                        updateBasicInfo({ email: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="import-phone">Teléfono</Label>
                    <Input
                      id="import-phone"
                      value={step.basicInfo.phone}
                      onChange={(e) =>
                        updateBasicInfo({ phone: e.target.value })
                      }
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
                    onChange={(e) =>
                      updateBasicInfo({ summary: e.target.value })
                    }
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
                        ({items.filter((i) => i.included).length}/{items.length}
                        )
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
                Después de crear el CV vas a poder editar cada sección en
                detalle desde el editor.
              </p>
            </SheetBody>
            <SheetFooter>
              <Button
                type="button"
                disabled={isCreating}
                onClick={handleConfirm}
              >
                {isCreating ? "Creando…" : "Crear CV"}
              </Button>
            </SheetFooter>
          </>
        ) : (
          <>
            <SheetBody className="flex flex-col gap-3">
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
            </SheetBody>
            <SheetFooter>
              <Button
                type="button"
                variant="outline"
                // Back to the confirm step, not to the file picker: the file
                // is still in hand, so a transient provider error costs one
                // click to retry instead of a trip through the OS file
                // browser to find the same CV again.
                onClick={() =>
                  setStep(pickedFile ? { name: "confirm" } : { name: "pick" })
                }
              >
                {pickedFile ? "Volver a intentar" : "Volver"}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
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
