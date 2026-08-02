"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FileTextIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { ReviewItemRow } from "@/features/cv-import/review-item-row"
import {
  getBankPage,
  type BankMaterialWithVariants,
  type BankPageData,
} from "@/features/career-bank/actions"
import { createCvFromBank } from "./actions"
import { DEFAULT_BANK_CV_TITLE } from "./constants"

/**
 * Builds a CV from the bank with no AI — the picker half of
 * `architecture/bank-produces-cv`.
 *
 * ONE READ, ONE WRITE. The whole bank arrives in a single `getBankPage()`
 * when the sheet opens, every toggle and every variant choice after that is
 * local `useState`, and exactly one request (`createCvFromBank`) crosses the
 * wire on confirm. Nothing here round-trips per interaction: a checkbox that
 * waits on a server before it looks checked is the difference between an app
 * that feels alive and one that feels like a form. It is also why the
 * payload is ids only — see `schemas/cv-from-bank.schema.ts`.
 *
 * Everything starts INCLUDED, with each material on its default variant. The
 * fastest useful path through this sheet is therefore open -> "Crear CV",
 * and every interaction is a subtraction from a working default rather than
 * an assembly from nothing.
 */

type MaterialPick = {
  materialId: string
  /** Which wording of this claim goes on the CV. Defaults to the material's default variant. */
  variantId: string
  included: boolean
}

type EngagementPick = {
  engagementId: string
  included: boolean
  materials: MaterialPick[]
}

type FlatPick = { id: string; included: boolean }

type Picker = {
  title: string
  summaryVariantId: string | null
  engagements: EngagementPick[]
  education: FlatPick[]
  credentials: FlatPick[]
  languages: FlatPick[]
  skills: FlatPick[]
}

type FlatSection = "education" | "credentials" | "languages" | "skills"

type Step =
  | { name: "loading" }
  | { name: "error"; message: string }
  /** The bank exists but has nothing that could become a CV. */
  | { name: "empty" }
  | { name: "pick"; data: BankPageData; picker: Picker }

/**
 * The wording that goes on the CV when nothing is chosen explicitly: the
 * variant flagged default, falling back deterministically to the first by
 * `sortOrder`. Same fallback rule `build-material-corpus.ts` applies when it
 * picks one line per material, so the CV and the AI corpus never disagree
 * about which wording represents a claim.
 */
function defaultVariantId(material: BankMaterialWithVariants): string | null {
  const preferred =
    material.variants.find((variant) => variant.isDefault) ??
    material.variants[0]
  return preferred?.id ?? null
}

function toFlatPicks(rows: { id: string }[]): FlatPick[] {
  return rows.map((row) => ({ id: row.id, included: true }))
}

function buildInitialPicker(data: BankPageData): Picker {
  const bullets = data.materials.filter(
    (material) => material.kind === "bullet" && material.variants.length > 0,
  )
  const summaries = data.materials.filter(
    (material) => material.kind === "summary" && material.variants.length > 0,
  )

  return {
    title: DEFAULT_BANK_CV_TITLE,
    // Pre-selecting the first summary matches the "everything included"
    // default. `cv.summary` is a single field, so unlike every other section
    // this one is a choice between materials, not a set of them.
    summaryVariantId: summaries[0] ? defaultVariantId(summaries[0]) : null,
    engagements: data.engagements.map((engagement) => ({
      engagementId: engagement.id,
      included: true,
      materials: bullets
        .filter((material) => material.engagementId === engagement.id)
        .flatMap((material) => {
          const variantId = defaultVariantId(material)
          return variantId
            ? [{ materialId: material.id, variantId, included: true }]
            : []
        }),
    })),
    education: toFlatPicks(data.education),
    credentials: toFlatPicks(data.credentials),
    languages: toFlatPicks(data.languages),
    skills: toFlatPicks(data.skills),
  }
}

/** True when the bank holds nothing this projection could put on a CV. */
function bankHasNothingToBuild(data: BankPageData): boolean {
  return (
    data.engagements.length === 0 &&
    data.education.length === 0 &&
    data.credentials.length === 0 &&
    data.languages.length === 0 &&
    data.skills.length === 0 &&
    data.materials.length === 0
  )
}

function engagementLabel(engagement: BankPageData["engagements"][number]): {
  title: string
  subtitle: string
} {
  const title =
    engagement.kind === "job"
      ? [engagement.role, engagement.organization].filter(Boolean).join(" @ ")
      : (engagement.name ?? "")
  return {
    title,
    subtitle: [engagement.startDate, engagement.endDate]
      .filter(Boolean)
      .join(" – "),
  }
}

export function BuildCvFromBankDialog({
  triggerLabel = "Armar CV desde el banco",
  triggerVariant = "default",
}: {
  triggerLabel?: string
  triggerVariant?: "default" | "outline"
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>({ name: "loading" })
  const [isCreating, setIsCreating] = useState(false)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // Reset so reopening never resumes a selection made against a bank
      // that may have changed in another tab since.
      setStep({ name: "loading" })
      return
    }

    setStep({ name: "loading" })
    void getBankPage().then((result) => {
      if (!result.ok) {
        setStep({ name: "error", message: result.error })
        return
      }
      if (bankHasNothingToBuild(result.data)) {
        setStep({ name: "empty" })
        return
      }
      setStep({
        name: "pick",
        data: result.data,
        picker: buildInitialPicker(result.data),
      })
    })
  }

  /** Every mutation below is local state — see this module's docstring. */
  function updatePicker(patch: (picker: Picker) => Picker) {
    setStep((s) => (s.name === "pick" ? { ...s, picker: patch(s.picker) } : s))
  }

  function toggleEngagement(engagementId: string) {
    updatePicker((picker) => ({
      ...picker,
      engagements: picker.engagements.map((item) =>
        item.engagementId === engagementId
          ? { ...item, included: !item.included }
          : item,
      ),
    }))
  }

  function toggleMaterial(engagementId: string, materialId: string) {
    updatePicker((picker) => ({
      ...picker,
      engagements: picker.engagements.map((item) =>
        item.engagementId === engagementId
          ? {
              ...item,
              materials: item.materials.map((material) =>
                material.materialId === materialId
                  ? { ...material, included: !material.included }
                  : material,
              ),
            }
          : item,
      ),
    }))
  }

  function chooseVariant(
    engagementId: string,
    materialId: string,
    variantId: string,
  ) {
    updatePicker((picker) => ({
      ...picker,
      engagements: picker.engagements.map((item) =>
        item.engagementId === engagementId
          ? {
              ...item,
              materials: item.materials.map((material) =>
                material.materialId === materialId
                  ? { ...material, variantId }
                  : material,
              ),
            }
          : item,
      ),
    }))
  }

  function toggleFlat(section: FlatSection, id: string) {
    updatePicker((picker) => ({
      ...picker,
      [section]: picker[section].map((item) =>
        item.id === id ? { ...item, included: !item.included } : item,
      ),
    }))
  }

  async function handleCreate() {
    if (step.name !== "pick") return
    setIsCreating(true)

    const { picker } = step
    const result = await createCvFromBank({
      title: picker.title,
      summaryVariantId: picker.summaryVariantId,
      engagements: picker.engagements
        .filter((item) => item.included)
        .map((item) => ({
          engagementId: item.engagementId,
          variantIds: item.materials
            .filter((material) => material.included)
            .map((material) => material.variantId),
        })),
      educationIds: picker.education.filter((i) => i.included).map((i) => i.id),
      credentialIds: picker.credentials
        .filter((i) => i.included)
        .map((i) => i.id),
      languageIds: picker.languages.filter((i) => i.included).map((i) => i.id),
      skillIds: picker.skills.filter((i) => i.included).map((i) => i.id),
    })

    setIsCreating(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    setOpen(false)
    setStep({ name: "loading" })
    toast.success("CV creado desde tu banco")
    router.push(`/cv/${result.data.id}/edit`)
    // The CV list this dialog was launched from is a server component; the
    // push alone would leave it stale. Same reasoning as
    // `features/cv-adapt/adapt-dialog.tsx`'s trailing refresh.
    router.refresh()
  }

  const summaryMaterials =
    step.name === "pick"
      ? step.data.materials.filter(
          (material) =>
            material.kind === "summary" && material.variants.length > 0,
        )
      : []

  // Live counters — the immediate feedback that makes a selection screen
  // legible without a preview pane.
  const selectedBullets =
    step.name === "pick"
      ? step.picker.engagements
          .filter((item) => item.included)
          .reduce(
            (total, item) =>
              total + item.materials.filter((m) => m.included).length,
            0,
          )
      : 0
  const selectedEngagements =
    step.name === "pick"
      ? step.picker.engagements.filter((item) => item.included).length
      : 0

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant={triggerVariant}>
          <FileTextIcon data-icon="inline-start" />
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Armar CV desde tu banco</SheetTitle>
          <SheetDescription>
            Elegí qué entra y con qué redacción. Sin IA: se arma al instante con
            lo que ya tenés guardado.
          </SheetDescription>
        </SheetHeader>

        {step.name === "loading" ? (
          <SheetBody className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Leyendo tu banco…
          </SheetBody>
        ) : step.name === "error" ? (
          <SheetBody>
            <p className="text-destructive text-sm">{step.message}</p>
          </SheetBody>
        ) : step.name === "empty" ? (
          <SheetBody>
            <p className="text-muted-foreground text-sm">
              Tu banco todavía está vacío. Importá tu CV en PDF o conectá GitHub
              y volvé — con material adentro, este paso es un clic.
            </p>
          </SheetBody>
        ) : (
          <>
            <SheetBody className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bank-cv-title">Título</Label>
                <Input
                  id="bank-cv-title"
                  value={step.picker.title}
                  onChange={(e) =>
                    updatePicker((picker) => ({
                      ...picker,
                      title: e.target.value,
                    }))
                  }
                />
              </div>

              {summaryMaterials.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bank-cv-summary">Resumen</Label>
                  <Select
                    value={step.picker.summaryVariantId ?? "none"}
                    onValueChange={(value) =>
                      updatePicker((picker) => ({
                        ...picker,
                        summaryVariantId: value === "none" ? null : value,
                      }))
                    }
                  >
                    <SelectTrigger id="bank-cv-summary">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin resumen</SelectItem>
                      {summaryMaterials.flatMap((material) =>
                        material.variants.map((variant) => (
                          <SelectItem key={variant.id} value={variant.id}>
                            {variant.label
                              ? `${variant.label} — ${variant.content.slice(0, 60)}`
                              : variant.content.slice(0, 80)}
                          </SelectItem>
                        )),
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">
                  Trayectoria{" "}
                  <span className="text-muted-foreground font-normal">
                    ({selectedEngagements}/{step.picker.engagements.length} —{" "}
                    {selectedBullets}{" "}
                    {selectedBullets === 1 ? "viñeta" : "viñetas"})
                  </span>
                </p>

                {step.picker.engagements.map((pick) => {
                  const engagement = step.data.engagements.find(
                    (row) => row.id === pick.engagementId,
                  )
                  if (!engagement) return null
                  const { title, subtitle } = engagementLabel(engagement)

                  return (
                    <div
                      key={pick.engagementId}
                      className="flex flex-col gap-2"
                    >
                      <ReviewItemRow
                        title={title}
                        subtitle={subtitle}
                        included={pick.included}
                        onToggle={() => toggleEngagement(pick.engagementId)}
                      />

                      {/* Bullets stay mounted while their engagement is
                          excluded, dimmed rather than removed: collapsing
                          them would make re-including the engagement a leap
                          of faith about what comes back with it. */}
                      {pick.materials.length > 0 && (
                        <div
                          className={
                            pick.included
                              ? "flex flex-col gap-1.5 pl-6"
                              : "pointer-events-none flex flex-col gap-1.5 pl-6 opacity-40"
                          }
                        >
                          {pick.materials.map((materialPick) => {
                            const material = step.data.materials.find(
                              (row) => row.id === materialPick.materialId,
                            )
                            if (!material) return null
                            const chosen = material.variants.find(
                              (variant) =>
                                variant.id === materialPick.variantId,
                            )

                            return (
                              <div
                                key={materialPick.materialId}
                                className="flex flex-col gap-1"
                              >
                                <ReviewItemRow
                                  title={chosen?.content ?? ""}
                                  included={materialPick.included}
                                  onToggle={() =>
                                    toggleMaterial(
                                      pick.engagementId,
                                      materialPick.materialId,
                                    )
                                  }
                                />
                                {/* Only when there is a real choice — a
                                    single-variant material would render a
                                    one-option dropdown that changes nothing. */}
                                {material.variants.length > 1 && (
                                  <Select
                                    value={materialPick.variantId}
                                    onValueChange={(value) =>
                                      chooseVariant(
                                        pick.engagementId,
                                        materialPick.materialId,
                                        value,
                                      )
                                    }
                                  >
                                    <SelectTrigger
                                      className="ml-6 h-8 text-xs"
                                      aria-label="Redacción de esta viñeta"
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {material.variants.map((variant) => (
                                        <SelectItem
                                          key={variant.id}
                                          value={variant.id}
                                        >
                                          {variant.label ??
                                            variant.content.slice(0, 60)}
                                          {variant.isDefault
                                            ? " (por defecto)"
                                            : ""}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {(
                [
                  ["education", "Educación"],
                  ["skills", "Habilidades"],
                  ["credentials", "Certificaciones y premios"],
                  ["languages", "Idiomas"],
                ] as const
              ).map(([section, label]) => {
                const picks = step.picker[section]
                if (picks.length === 0) return null
                const rows = step.data[section]

                return (
                  <div key={section} className="flex flex-col gap-2">
                    <p className="text-sm font-medium">
                      {label}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({picks.filter((i) => i.included).length}/{picks.length}
                        )
                      </span>
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {picks.map((pick) => {
                        const row = rows.find((item) => item.id === pick.id)
                        if (!row) return null
                        return (
                          <ReviewItemRow
                            key={pick.id}
                            title={describeFlatRow(section, row)}
                            included={pick.included}
                            onToggle={() => toggleFlat(section, pick.id)}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              <p className="text-muted-foreground text-xs">
                Las referencias no salen del banco: se cargan en el editor, para
                que nunca lleguen a la IA. Los logros sin trabajo ni proyecto
                asociado tampoco entran acá — quedan disponibles para adaptar
                con un aviso.
              </p>
            </SheetBody>
            <SheetFooter>
              <Button
                type="button"
                disabled={isCreating}
                onClick={handleCreate}
              >
                {isCreating ? "Creando…" : "Crear CV"}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function describeFlatRow(
  section: FlatSection,
  row:
    | BankPageData["education"][number]
    | BankPageData["skills"][number]
    | BankPageData["credentials"][number]
    | BankPageData["languages"][number],
): string {
  switch (section) {
    case "education": {
      const item = row as BankPageData["education"][number]
      return [item.degree, item.institution].filter(Boolean).join(" @ ")
    }
    case "skills": {
      const item = row as BankPageData["skills"][number]
      return item.category ? `${item.name} (${item.category})` : item.name
    }
    case "credentials": {
      const item = row as BankPageData["credentials"][number]
      return item.issuer ? `${item.name} — ${item.issuer}` : item.name
    }
    case "languages": {
      const item = row as BankPageData["languages"][number]
      return item.level ? `${item.name} (${item.level})` : item.name
    }
  }
}
