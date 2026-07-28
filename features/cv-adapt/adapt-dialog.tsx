"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { listModelOptions } from "@/features/ai-providers/actions"
import type { UserModelOption } from "@/lib/ai/get-user-model"
import type { ResultErrorCode } from "@/lib/result"
import type { CvData, EducationItem } from "@/schemas/cv.schema"
import type {
  AdaptedExperience,
  AdaptedProject,
  AdaptedSkill,
} from "@/schemas/cv-adapt.schema"
import { ReviewItemRow } from "@/features/cv-import/review-item-row"
import type { CorpusSummary } from "./build-material-corpus"
import { adaptCvForPosting, createCvFromAdaptation } from "./actions"
import { MAX_JOB_POSTING_CHARS, MIN_JOB_POSTING_CHARS } from "./constants"

type Checked<T> = { id: string; data: T; included: boolean }
type ListSection = "experiences" | "projects" | "education" | "skills"

type ReviewState = {
  title: string
  summary: string
  adaptationNotes: string
  corpus: CorpusSummary
  experiences: Checked<AdaptedExperience>[]
  projects: Checked<AdaptedProject>[]
  // Sourced from the SOURCE CV, not from the AI output — `cvAdaptSchema` has
  // no `education` field at all (D14). Each item keeps the source CV's real
  // `education` row id, because `createCvFromAdaptation` uses that id to
  // decide which of the source's own rows to carry through verbatim; it
  // never trusts the row's textual content from this client payload.
  education: Checked<EducationItem>[]
  skills: Checked<AdaptedSkill>[]
}

type Step =
  | { name: "paste" }
  // Between pasting and spending. The posting text itself lives in
  // `postingText` (outside `step`), so this carries no payload — it is
  // purely the beat where the user reads back what is about to run.
  | { name: "confirm" }
  | { name: "adapting" }
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
 * Builds the final `CvData` draft sent to `createCvFromAdaptation` from the
 * dialog's review state: the (possibly hand-edited) title/summary, plus
 * only the items the user left checked. Contact fields are deliberately
 * never set here (D11) — the server reads them from the ownership-verified
 * source `cv` row, never from this payload.
 */
function reviewStateToCvData(state: ReviewState): CvData {
  return {
    summary: state.summary || undefined,
    experiences: state.experiences
      .filter((item) => item.included)
      .map((item) => ({
        id: crypto.randomUUID(),
        company: item.data.company,
        role: item.data.role,
        startDate: item.data.startDate,
        endDate: item.data.endDate,
        bullets: item.data.bullets,
      })),
    projects: state.projects
      .filter((item) => item.included)
      .map((item) => ({
        id: crypto.randomUUID(),
        name: item.data.name,
        description: item.data.description,
        url: item.data.url,
        bullets: item.data.bullets,
      })),
    education: state.education
      .filter((item) => item.included)
      .map((item) => ({
        // Real source-CV row id — `createCvFromAdaptation` re-reads the
        // actual field values from the DB by this id and ignores whatever
        // institution/degree/dates travel here.
        id: item.data.id,
        institution: item.data.institution,
        degree: item.data.degree,
        startDate: item.data.startDate,
        endDate: item.data.endDate,
      })),
    skills: state.skills
      .filter((item) => item.included)
      .map((item) => ({
        id: crypto.randomUUID(),
        name: item.data.name,
        category: item.data.category,
      })),
    // Deliberately empty on the wire. Achievements and references have no
    // AI output channel (same as `education`, D14) AND no review UI, so the
    // client has nothing meaningful to send — `createCvFromAdaptation`
    // re-reads both straight from the source CV's own rows and overwrites
    // whatever arrives here. An empty channel is a structural guarantee
    // that the model can never invent an award or a referee; a prompt
    // instruction would only be a request (D11).
    achievements: [],
    references: [],
  }
}

export function AdaptCvDialog({ cvId }: { cvId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>({ name: "paste" })
  // Lives OUTSIDE `step` so `error -> "Volver"` preserves it — making the
  // user re-paste a 10k-character posting after a transient 429 would be
  // hostile. Reset only on `handleOpenChange(false)`.
  const [postingText, setPostingText] = useState("")
  const [isConfirming, setIsConfirming] = useState(false)
  // Model options are fetched when the dialog opens rather than on mount:
  // this component renders in the CV editor header on every edit page, and
  // most visits never open it. `""` means "use my default", which is what
  // the server does when `providerModelId` is omitted.
  const [modelOptions, setModelOptions] = useState<UserModelOption[]>([])
  const [selectedModelId, setSelectedModelId] = useState("")

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      void listModelOptions().then((result) => {
        if (result.ok) setModelOptions(result.data)
      })
      return
    }
    setStep({ name: "paste" })
    setPostingText("")
    // Deliberately NOT resetting `selectedModelId`: within a session a user
    // adapting several postings almost always wants the same model, and
    // re-picking it every time would be friction for no benefit. It resets
    // naturally on reload.
  }

  const trimmedLength = postingText.trim().length
  const canAdapt =
    trimmedLength >= MIN_JOB_POSTING_CHARS &&
    trimmedLength <= MAX_JOB_POSTING_CHARS

  /**
   * The length rule, said out loud on every keystroke.
   *
   * The rule itself stays — a 20-character "posting" would burn a paid call
   * on nothing. What changes is that it used to be enforced ONLY by a dead
   * disabled button, which tells the user they are blocked without ever
   * telling them by how much or why. A limit the user can watch themselves
   * satisfy is guidance; the same limit enforced silently is just a broken
   * button.
   */
  const lengthHint = (() => {
    if (trimmedLength === 0) {
      return { tone: "muted" as const, text: "Pegá el aviso para empezar." }
    }
    if (trimmedLength < MIN_JOB_POSTING_CHARS) {
      const missing = MIN_JOB_POSTING_CHARS - trimmedLength
      return {
        tone: "muted" as const,
        text: `${trimmedLength} caracteres — faltan ${missing} para poder adaptar.`,
      }
    }
    if (trimmedLength > MAX_JOB_POSTING_CHARS) {
      const excess = trimmedLength - MAX_JOB_POSTING_CHARS
      return {
        tone: "error" as const,
        text: `${trimmedLength} caracteres — te pasaste por ${excess}. Dejá solo la descripción del puesto y los requisitos.`,
      }
    }
    return {
      tone: "muted" as const,
      text: `${trimmedLength} de ${MAX_JOB_POSTING_CHARS} caracteres.`,
    }
  })()

  // What the confirm step and the run button actually name. `selectedModelId`
  // is `""` for "use my default", which resolves server-side.
  const selectedModelLabel =
    modelOptions.find((option) => option.id === selectedModelId)?.modelId ??
    modelOptions.find((option) => option.isDefault)?.modelId ??
    null

  async function handleAdapt() {
    setStep({ name: "adapting" })

    const result = await adaptCvForPosting(
      cvId,
      postingText,
      selectedModelId || undefined,
    )

    if (!result.ok) {
      setStep({ name: "error", message: result.error, code: result.code })
      return
    }

    const { adapted, corpus, sourceEducation } = result.data
    setStep({
      name: "review",
      title: adapted.title,
      summary: adapted.summary,
      adaptationNotes: adapted.adaptationNotes,
      corpus,
      experiences: toChecked(adapted.experiences),
      projects: toChecked(adapted.projects),
      education: sourceEducation.map((data) => ({
        id: data.id,
        data,
        included: true,
      })),
      skills: toChecked(adapted.skills),
    })
  }

  function updateField(patch: Partial<Pick<ReviewState, "title" | "summary">>) {
    setStep((s) => (s.name === "review" ? { ...s, ...patch } : s))
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
    setIsConfirming(true)

    const draft = reviewStateToCvData(step)
    const result = await createCvFromAdaptation({
      sourceCvId: cvId,
      title: step.title,
      jobPostingText: postingText,
      // Sent verbatim as the model produced them, NOT as the user may have
      // seen them edited — the notes are a record of what the model claimed
      // it did, so they are only worth keeping unaltered. That is also why
      // there is no input for them in the review UI above.
      adaptationNotes: step.adaptationNotes,
      draft,
    })

    setIsConfirming(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    setOpen(false)
    setStep({ name: "paste" })
    setPostingText("")
    router.push(`/cv/${result.data.id}/edit`)
    // `push` alone leaves the CV list sidebar stale: `app/(dashboard)/cv/layout.tsx`
    // fetches `listUserCvs` once and Next does NOT remount a layout when
    // navigating between sibling routes — which that layout depends on
    // deliberately, to keep the sidebar and the Typst preview warm across CV
    // switches. This dialog is launched from inside `/cv/[id]/edit`, so the
    // jump to the newly created CV is exactly such a sibling navigation and
    // the layout never re-queries; the adapted CV would be missing from the
    // sidebar until a hard reload.
    //
    // `features/cv-import/import-from-file-dialog.tsx` does not need this and
    // is not a counter-example: it is launched from `/dashboard`, which is
    // OUTSIDE `/cv/*`, so its push mounts that layout fresh and the new CV is
    // already in the first fetch.
    //
    // `router.refresh()` re-renders the server components of the tree being
    // navigated into, layout included, which re-runs `listUserCvs`.
    router.refresh()
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <SparklesIcon data-icon="inline-start" />
          Adaptar a un aviso
        </Button>
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Adaptar CV a un aviso de trabajo</SheetTitle>
          <SheetDescription>
            Pegá el aviso completo — la IA arma un CV adaptado a partir de tu
            material de carrera, que revisás acá antes de crear nada.
          </SheetDescription>
        </SheetHeader>

        {step.name === "paste" ? (
          <>
            <SheetBody className="flex flex-col gap-2">
              <Label htmlFor="job-posting-text">Aviso de trabajo</Label>
              <Textarea
                id="job-posting-text"
                rows={14}
                value={postingText}
                onChange={(e) => setPostingText(e.target.value)}
                placeholder="Pegá acá la descripción completa del puesto…"
              />
              <p
                aria-live="polite"
                className={cn(
                  "text-xs",
                  lengthHint.tone === "error"
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {lengthHint.text}
              </p>

              {/* Only worth showing when there is an actual choice to make.
                  With a single registered model the selector would be a
                  one-option dropdown that changes nothing. */}
              {modelOptions.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adapt-model">Modelo</Label>
                  <Select
                    value={selectedModelId}
                    onValueChange={setSelectedModelId}
                  >
                    <SelectTrigger id="adapt-model">
                      <SelectValue placeholder="Usar mi modelo por defecto" />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.modelId}
                          {option.isDefault ? " (por defecto)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    Un modelo más liviano responde antes; uno más pesado suele
                    adaptar mejor.
                  </p>
                </div>
              )}
            </SheetBody>
            <SheetFooter>
              <Button
                type="button"
                disabled={!canAdapt}
                onClick={() => setStep({ name: "confirm" })}
              >
                Continuar
              </Button>
            </SheetFooter>
          </>
        ) : step.name === "confirm" ? (
          <>
            <SheetBody>
              <AiRunPreflight
                rows={[
                  {
                    label: "Aviso",
                    value: `${trimmedLength} caracteres pegados`,
                  },
                  {
                    label: "Modelo",
                    value: selectedModelLabel ?? "Tu modelo por defecto",
                  },
                  {
                    label: "Material",
                    value:
                      "Este CV completo, más tu banco de material de carrera",
                  },
                ]}
              />
            </SheetBody>
            <SheetFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep({ name: "paste" })}
              >
                Volver al aviso
              </Button>
              <Button type="button" onClick={handleAdapt}>
                Adaptar el CV
              </Button>
            </SheetFooter>
          </>
        ) : step.name === "adapting" ? (
          <SheetBody className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Adaptando tu CV al aviso…
          </SheetBody>
        ) : step.name === "review" ? (
          <>
            <SheetBody className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adapt-title">Título</Label>
                  <Input
                    id="adapt-title"
                    value={step.title}
                    onChange={(e) => updateField({ title: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adapt-summary">Resumen</Label>
                  <Textarea
                    id="adapt-summary"
                    rows={4}
                    value={step.summary}
                    onChange={(e) => updateField({ summary: e.target.value })}
                  />
                </div>
                {step.adaptationNotes ? (
                  <div className="bg-muted/50 text-muted-foreground rounded-lg border p-2.5 text-xs">
                    {step.adaptationNotes}
                  </div>
                ) : null}
                <p className="text-muted-foreground text-xs">
                  Material de referencia: {step.corpus.includedCount} de{" "}
                  {step.corpus.totalCount} ítems
                  {step.corpus.capReached
                    ? " — Se alcanzó el límite de material; el CV de origen siempre se incluye completo."
                    : ""}
                </p>
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
            </SheetBody>
            <SheetFooter>
              <Button
                type="button"
                disabled={isConfirming}
                onClick={handleConfirm}
              >
                {isConfirming ? "Creando…" : "Crear CV"}
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
                onClick={() => setStep({ name: "paste" })}
              >
                Volver
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/**
 * Every branch renders role/company/dates together where applicable
 * (`experiences`) — the review dialog's visible-identity check against
 * D14's residual risk (a model could in principle drift a job title; a
 * drifted title or date must be visible at a glance, not buried in a
 * bullet).
 */
function describeItem(
  section: ListSection,
  data: AdaptedExperience | AdaptedProject | EducationItem | AdaptedSkill,
): { title: string; subtitle?: string } {
  switch (section) {
    case "experiences": {
      const item = data as AdaptedExperience
      return {
        title: [item.role, item.company].filter(Boolean).join(" @ "),
        subtitle: [item.startDate, item.endDate].filter(Boolean).join(" – "),
      }
    }
    case "projects": {
      const item = data as AdaptedProject
      return { title: item.name, subtitle: item.description }
    }
    case "education": {
      const item = data as EducationItem
      return {
        title: [item.degree, item.institution].filter(Boolean).join(" @ "),
        subtitle: [item.startDate, item.endDate].filter(Boolean).join(" – "),
      }
    }
    case "skills": {
      const item = data as AdaptedSkill
      return { title: item.name, subtitle: item.category ?? undefined }
    }
  }
}
