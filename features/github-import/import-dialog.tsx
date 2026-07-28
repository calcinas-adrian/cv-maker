"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { GitBranchIcon, Loader2Icon } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { saveVersion } from "@/features/cv/actions"
import { useEditorStore } from "@/features/cv/editor-store"
import {
  ExperienceForm,
  formValuesToExperienceItem,
  type ExperienceFormValues,
} from "@/features/cv/sections/experience-form"
import {
  ProjectForm,
  formValuesToProjectItem,
  type ProjectFormValues,
} from "@/features/cv/sections/project-form"
import type { ResultErrorCode } from "@/lib/result"
import { ConnectGithubButton } from "./connect-github-button"
import { RepoList } from "./repo-list"
import {
  checkGithubConnection,
  extractFromRepo,
  listUserRepos,
  type GithubImportDepth,
  type GithubImportTarget,
} from "./actions"
import type { RepoSummary } from "./octokit"

type Step =
  | { name: "list" }
  // Selecting a repo used to fire the extraction on the click itself. In a
  // scrollable list of repos that is one stray click away from the most
  // expensive call in the app — `full_code` is the default depth — and the
  // call cannot be stopped once it starts. It lands here instead.
  | { name: "confirm"; repo: RepoSummary }
  | { name: "extracting"; repo: RepoSummary; mode: GithubImportDepth }
  | {
      name: "review"
      target: "project"
      repo: RepoSummary
      hadReadme: boolean
      codeDigestWarning: string | null
      draft: ProjectFormValues
    }
  | {
      name: "review"
      target: "experience"
      repo: RepoSummary
      hadReadme: boolean
      codeDigestWarning: string | null
      draft: ExperienceFormValues
    }
  | { name: "error"; message: string; code: ResultErrorCode }

export function ImportFromGithubDialog({ cvId }: { cvId: string }) {
  const [open, setOpen] = useState(false)
  const [includeForks, setIncludeForks] = useState(false)
  const [target, setTarget] = useState<GithubImportTarget>("project")
  // Explicit, confirmed product decision: full-code analysis is the
  // DEFAULT depth, README-only is the secondary/faster fallback — not the
  // other way around.
  const [mode, setMode] = useState<GithubImportDepth>("full_code")
  const [step, setStep] = useState<Step>({ name: "list" })
  const [isApplying, setIsApplying] = useState(false)

  const addProject = useEditorStore((s) => s.addProject)
  const addExperience = useEditorStore((s) => s.addExperience)

  const connectionQuery = useQuery({
    queryKey: ["github-connection"],
    queryFn: () => checkGithubConnection(),
    enabled: open,
  })
  const connectionStatus = connectionQuery.data?.ok
    ? connectionQuery.data.data
    : null

  const reposQuery = useQuery({
    queryKey: ["github-repos", includeForks],
    queryFn: () => listUserRepos(includeForks),
    enabled: open && connectionStatus === "ready",
  })

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // Reset so reopening the dialog never resumes mid-review of a stale
      // draft (or a stale error) from a previous open.
      setStep({ name: "list" })
    }
  }

  async function handleExtract(repo: RepoSummary) {
    setStep({ name: "extracting", repo, mode })

    if (target === "project") {
      const result = await extractFromRepo({
        cvId,
        owner: repo.owner,
        repo: repo.name,
        target: "project",
        mode,
      })
      if (!result.ok) {
        setStep({ name: "error", message: result.error, code: result.code })
        return
      }
      setStep({
        name: "review",
        target: "project",
        repo,
        hadReadme: result.data.hadReadme,
        codeDigestWarning: result.data.codeDigestWarning,
        draft: {
          name: result.data.name,
          description: result.data.description,
          url: result.data.url ?? "",
          bulletsText: result.data.bullets.join("\n"),
        },
      })
      return
    }

    const result = await extractFromRepo({
      cvId,
      owner: repo.owner,
      repo: repo.name,
      target: "experience",
      mode,
    })
    if (!result.ok) {
      setStep({ name: "error", message: result.error, code: result.code })
      return
    }
    setStep({
      name: "review",
      target: "experience",
      repo,
      hadReadme: result.data.hadReadme,
      codeDigestWarning: result.data.codeDigestWarning,
      // `company`/`startDate`/`endDate` are deliberately blank — a repo's
      // code doesn't reliably tell you who employed the person or when
      // (see `schemas/github-import.schema.ts`'s `experienceExtractSchema`)
      // — the user fills those in during this same review step.
      draft: {
        company: "",
        role: result.data.role,
        startDate: "",
        endDate: "",
        bulletsText: result.data.bullets.join("\n"),
      },
    })
  }

  /**
   * Snapshot BEFORE the import lands, so there's a clean restore point
   * independent of the undo stack (per the plan's edge cases). If the
   * snapshot itself fails (e.g. a transient network/DB error), the import
   * is aborted rather than silently applied without that safety net — the
   * user can just retry "Agregar al CV". Returns whether it's safe for the
   * caller to go ahead with its single tracked `set()` call.
   *
   * That call (`addProject`/`addExperience`, below) is deliberately NOT
   * wrapped in `useEditorStore.temporal.getState().pause()/.resume()` —
   * verified by reading zundo@2.3.0's shipped source (`pause`/`resume`
   * only toggle an `isTracking` flag consulted by the wrapped `set`; a
   * `set` call made while paused is skipped entirely from history, and
   * `resume()` does not retroactively capture it). Pausing around a single
   * call would make the import UNDO-INVISIBLE (zero history entries, and
   * it would also fold into whichever next change through this app IS
   * deliberately paused/resumed — see the original report for the full
   * trace). `addProject` and `addExperience` are both already exactly one
   * tracked `set()` call — the same mechanism the manual "Agregar"
   * buttons in `ProjectSection`/`ExperienceSection` already use — so
   * calling either directly here already gives exactly one Ctrl+Z step for
   * the whole import, regardless of which target was chosen.
   */
  async function snapshotBeforeApply(repo: RepoSummary): Promise<boolean> {
    const versionResult = await saveVersion(
      cvId,
      `Antes de importar ${repo.fullName}`,
    )
    if (!versionResult.ok) {
      toast.error("No se pudo guardar una versión de respaldo. Probá de nuevo.")
      return false
    }
    return true
  }

  async function handleConfirmProject(
    values: ProjectFormValues,
    repo: RepoSummary,
  ) {
    setIsApplying(true)
    if (!(await snapshotBeforeApply(repo))) {
      setIsApplying(false)
      return
    }

    addProject(formValuesToProjectItem(values, crypto.randomUUID()))

    setIsApplying(false)
    toast.success(`"${repo.name}" agregado como proyecto`)
    setOpen(false)
    setStep({ name: "list" })
  }

  async function handleConfirmExperience(
    values: ExperienceFormValues,
    repo: RepoSummary,
  ) {
    setIsApplying(true)
    if (!(await snapshotBeforeApply(repo))) {
      setIsApplying(false)
      return
    }

    addExperience(formValuesToExperienceItem(values, crypto.randomUUID()))

    setIsApplying(false)
    toast.success(`"${repo.name}" agregado como experiencia`)
    setOpen(false)
    setStep({ name: "list" })
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <GitBranchIcon /> Importar de GitHub
        </Button>
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Importar de GitHub</SheetTitle>
          <SheetDescription>
            Elegí un repo — la IA arma un borrador que podés editar antes de
            agregarlo al CV, como proyecto o como experiencia.
          </SheetDescription>
        </SheetHeader>

        {connectionQuery.isPending ? (
          <SheetBody>
            <p className="text-muted-foreground text-sm">
              Verificando conexión…
            </p>
          </SheetBody>
        ) : connectionStatus !== "ready" ? (
          <SheetBody className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              {connectionStatus === "missing_scope"
                ? "Tu cuenta de GitHub está conectada pero sin permiso para leer tus repos."
                : "Conectá tu cuenta de GitHub para ver tus repos."}
            </p>
            <ConnectGithubButton callbackURL={`/cv/${cvId}/edit`}>
              {connectionStatus === "missing_scope"
                ? "Reconectar GitHub"
                : "Conectar GitHub"}
            </ConnectGithubButton>
          </SheetBody>
        ) : step.name === "list" ? (
          <SheetBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="github-import-target">Agregar como</Label>
                <Select
                  value={target}
                  onValueChange={(value) =>
                    setTarget(value as GithubImportTarget)
                  }
                >
                  <SelectTrigger id="github-import-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project">Proyecto</SelectItem>
                    <SelectItem value="experience">Experiencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="github-import-depth">Analizar</Label>
                <Select
                  value={mode}
                  onValueChange={(value) => setMode(value as GithubImportDepth)}
                >
                  <SelectTrigger id="github-import-depth">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_code">
                      Código completo (recomendado)
                    </SelectItem>
                    <SelectItem value="readme_only">
                      Solo README (más rápido)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {mode === "full_code" && (
              <p className="text-muted-foreground text-xs">
                El análisis de código completo usa más tokens del proveedor de
                IA que configuraste que el análisis de solo README.
              </p>
            )}
            <RepoList
              includeForks={includeForks}
              onIncludeForksChange={setIncludeForks}
              query={reposQuery}
              onSelect={(repo) => setStep({ name: "confirm", repo })}
            />
          </SheetBody>
        ) : step.name === "confirm" ? (
          <>
            <SheetBody>
              <AiRunPreflight
                rows={[
                  { label: "Repo", value: step.repo.fullName },
                  {
                    label: "Agregar como",
                    value: target === "project" ? "Proyecto" : "Experiencia",
                  },
                  {
                    label: "Analizar",
                    value:
                      mode === "full_code"
                        ? "Código completo"
                        : "Solo el README",
                  },
                ]}
              >
                {mode === "full_code" && (
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                    El análisis de código completo descarga el repo y usa
                    bastantes más tokens que el de solo README. Si solo querés
                    una descripción rápida, volvé y cambiá
                    &ldquo;Analizar&rdquo;.
                  </p>
                )}
              </AiRunPreflight>
            </SheetBody>
            <SheetFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep({ name: "list" })}
              >
                Elegir otro repo
              </Button>
              <Button type="button" onClick={() => handleExtract(step.repo)}>
                Analizar {step.repo.name}
              </Button>
            </SheetFooter>
          </>
        ) : step.name === "extracting" ? (
          <SheetBody className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            {step.mode === "full_code"
              ? `Descargando y analizando el código de ${step.repo.fullName}… puede tardar más que un análisis de solo README.`
              : `Extrayendo información de ${step.repo.fullName}…`}
          </SheetBody>
        ) : step.name === "review" ? (
          // The forms render their own `SheetBody`-equivalent body and pinned
          // footer, so they are mounted directly against the sheet shell —
          // wrapping them in another body would nest two scroll containers and
          // bury the submit row. Warnings ride along via the `notice` slot.
          step.target === "project" ? (
            <ProjectForm
              defaultValues={step.draft}
              notice={
                <ImportNotices
                  hadReadme={step.hadReadme}
                  codeDigestWarning={step.codeDigestWarning}
                />
              }
              submitLabel={isApplying ? "Agregando…" : "Agregar al CV"}
              submitDisabled={isApplying}
              onSubmit={(values) => handleConfirmProject(values, step.repo)}
            />
          ) : (
            <ExperienceForm
              defaultValues={step.draft}
              notice={
                <ImportNotices
                  hadReadme={step.hadReadme}
                  codeDigestWarning={step.codeDigestWarning}
                />
              }
              submitLabel={isApplying ? "Agregando…" : "Agregar al CV"}
              submitDisabled={isApplying}
              onSubmit={(values) => handleConfirmExperience(values, step.repo)}
            />
          )
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
                onClick={() => setStep({ name: "list" })}
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

function ImportNotices({
  hadReadme,
  codeDigestWarning,
}: {
  hadReadme: boolean
  codeDigestWarning: string | null
}) {
  if (hadReadme && !codeDigestWarning) return null

  return (
    <div className="flex flex-col gap-2">
      {!hadReadme && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
          Este repo no tiene README — revisá y completá la descripción antes de
          agregarlo.
        </p>
      )}
      {codeDigestWarning && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
          No se pudo analizar el código completo — este borrador se armó solo
          con metadata y README. ({codeDigestWarning})
        </p>
      )}
    </div>
  )
}
