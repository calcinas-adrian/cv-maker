"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import Link from "next/link"
import { Loader2Icon, SparklesIcon } from "lucide-react"
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
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
import {
  MAX_MEMORY_RAW_TEXT_CHARS,
  MIN_MEMORY_RAW_TEXT_CHARS,
  memoryDraftInputSchema,
  type MemoryDraftInput,
} from "@/schemas/bank.schema"
import {
  captureMemory,
  extractMemoryDraft,
  refineMemoryFromAnswers,
} from "@/features/career-bank/actions"

/**
 * "Memorias" — the AI-assisted capture flow: write -> extract -> (clarify ->
 * refine, skipped when the draft needs no clarification) -> review -> save.
 * Hand-rolled `Step` union state machine, same convention as `features/
 * cv-adapt/adapt-dialog-shell.tsx` rather than a generic reusable wizard —
 * this app has exactly two such flows and a shared abstraction would cost
 * more than the duplication it removes.
 *
 * `AiRunPreflight` gates BOTH paid AI calls (extract and refine), same
 * "show what is about to run before it starts, because it cannot be
 * cancelled once it does" reasoning as the adapt flow.
 */

type ReviewState = {
  questions: string[]
  answers: Record<string, string>
  title: string
  bullet: string
  skillTags: string[]
  aiNotes: string | null
}

type Step =
  | { name: "write" }
  | { name: "confirm-extract" }
  | { name: "extracting" }
  | {
      name: "clarifying"
      questions: string[]
      title: string
      bullet: string
      skillTags: string[]
    }
  | {
      name: "confirm-refine"
      questions: string[]
      answers: Record<string, string>
      title: string
      bullet: string
      skillTags: string[]
    }
  | { name: "refining" }
  | ({ name: "review" } & ReviewState)
  | { name: "saving" }
  | { name: "error"; message: string; code: ResultErrorCode }

function TagListInput({
  value,
  onChange,
}: {
  value: string[]
  onChange: (tags: string[]) => void
}) {
  return (
    <Input
      value={value.join(", ")}
      onChange={(e) =>
        onChange(
          e.target.value
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        )
      }
    />
  )
}

function ClarifyingForm({
  questions,
  onSubmit,
  onCancel,
}: {
  questions: string[]
  onSubmit: (answers: Record<string, string>) => void
  onCancel: () => void
}) {
  const form = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(
      questions.map((_, index) => [`answer_${index}`, ""]),
    ),
  })

  function handleSubmit(values: Record<string, string>) {
    const answers: Record<string, string> = {}
    questions.forEach((question, index) => {
      answers[question] = (values[`answer_${index}`] ?? "").trim()
    })
    onSubmit(answers)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="contents">
        <SheetBody className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            Respondé lo que sepas — dejar una respuesta vacía está bien, la IA
            no va a inventar ese dato.
          </p>
          {questions.map((question, index) => (
            <FormField
              key={index}
              control={form.control}
              name={`answer_${index}`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{question}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Opcional" />
                  </FormControl>
                </FormItem>
              )}
            />
          ))}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Volver
          </Button>
          <Button type="submit">Continuar</Button>
        </SheetFooter>
      </form>
    </Form>
  )
}

function ReviewForm({
  defaultValues,
  aiNotes,
  onSubmit,
}: {
  defaultValues: MemoryDraftInput
  aiNotes: string | null
  onSubmit: (values: MemoryDraftInput) => void
}) {
  const form = useForm<MemoryDraftInput>({
    resolver: zodResolver(memoryDraftInputSchema),
    defaultValues,
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
        <SheetBody className="flex flex-col gap-3">
          {aiNotes ? (
            <div className="bg-muted/50 text-muted-foreground rounded-lg border p-2.5 text-xs">
              {aiNotes}
            </div>
          ) : null}
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Título</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bullet"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Viñeta</FormLabel>
                <FormControl>
                  <Textarea rows={4} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="skillTags"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Habilidades (separadas por coma)</FormLabel>
                <FormControl>
                  <TagListInput value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </SheetBody>
        <SheetFooter>
          <Button type="submit">Guardar en el banco</Button>
        </SheetFooter>
      </form>
    </Form>
  )
}

export function MemoryCaptureSheet({ onCaptured }: { onCaptured: () => void }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>({ name: "write" })
  const [rawText, setRawText] = useState("")
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
    setStep({ name: "write" })
    setRawText("")
  }

  const trimmedLength = rawText.trim().length
  const canExtract =
    trimmedLength >= MIN_MEMORY_RAW_TEXT_CHARS &&
    trimmedLength <= MAX_MEMORY_RAW_TEXT_CHARS

  const selectedModelLabel =
    modelOptions.find((option) => option.id === selectedModelId)?.modelId ??
    modelOptions.find((option) => option.isDefault)?.modelId ??
    null

  async function handleExtract() {
    setStep({ name: "extracting" })

    const result = await extractMemoryDraft(
      rawText,
      selectedModelId || undefined,
    )

    if (!result.ok) {
      setStep({ name: "error", message: result.error, code: result.code })
      return
    }

    const draft = result.data
    if (draft.questions.length === 0) {
      setStep({
        name: "review",
        questions: [],
        answers: {},
        title: draft.title,
        bullet: draft.bullet,
        skillTags: draft.skillTags,
        aiNotes: null,
      })
      return
    }

    setStep({
      name: "clarifying",
      questions: draft.questions,
      title: draft.title,
      bullet: draft.bullet,
      skillTags: draft.skillTags,
    })
  }

  function handleClarifyingSubmit(answers: Record<string, string>) {
    if (step.name !== "clarifying") return
    setStep({
      name: "confirm-refine",
      questions: step.questions,
      title: step.title,
      bullet: step.bullet,
      skillTags: step.skillTags,
      answers,
    })
  }

  async function handleRefine() {
    if (step.name !== "confirm-refine") return
    const { questions, answers } = step
    const qa = questions.map((question) => ({
      question,
      answer: answers[question] ?? "",
    }))

    setStep({ name: "refining" })

    const result = await refineMemoryFromAnswers(
      rawText,
      qa,
      selectedModelId || undefined,
    )

    if (!result.ok) {
      setStep({ name: "error", message: result.error, code: result.code })
      return
    }

    setStep({
      name: "review",
      questions,
      answers,
      title: result.data.title,
      bullet: result.data.bullet,
      skillTags: result.data.skillTags,
      aiNotes: result.data.notes,
    })
  }

  async function handleConfirmSave(values: MemoryDraftInput) {
    if (step.name !== "review") return
    const { questions, answers, aiNotes } = step

    setStep({ name: "saving" })

    const result = await captureMemory({
      rawText,
      questions,
      answers,
      aiNotes,
      title: values.title,
      bullet: values.bullet,
      skillTags: values.skillTags,
    })

    if (!result.ok) {
      toast.error(result.error)
      // Restore the review step with the user's SUBMITTED edits, not the
      // pre-edit draft — a failed save (a transient 429, say) must not throw
      // away edits the user just made in the form.
      setStep({
        name: "review",
        questions,
        answers,
        aiNotes,
        title: values.title,
        bullet: values.bullet,
        skillTags: values.skillTags,
      })
      return
    }

    toast.success("Memoria guardada en el banco")
    setOpen(false)
    setStep({ name: "write" })
    setRawText("")
    onCaptured()
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" size="sm">
          <SparklesIcon data-icon="inline-start" />
          Nueva memoria (IA)
        </Button>
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Nueva memoria</SheetTitle>
          <SheetDescription>
            Contá un logro o una experiencia con tus palabras — la IA arma un
            borrador de viñeta y te pregunta lo que le falta.
          </SheetDescription>
        </SheetHeader>

        {step.name === "write" ? (
          <>
            <SheetBody className="flex flex-col gap-2">
              <Label htmlFor="memory-raw-text">Tu memoria</Label>
              <Textarea
                id="memory-raw-text"
                rows={10}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Ej: lideré la migración del backend a microservicios, redujimos el tiempo de deploy y el equipo quedó más autónomo…"
              />
              <p className="text-muted-foreground text-xs">
                {trimmedLength} de {MAX_MEMORY_RAW_TEXT_CHARS} caracteres
                {trimmedLength < MIN_MEMORY_RAW_TEXT_CHARS
                  ? ` — mínimo ${MIN_MEMORY_RAW_TEXT_CHARS}`
                  : ""}
                .
              </p>

              {modelOptions.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="memory-model">Modelo</Label>
                  <Select
                    value={selectedModelId}
                    onValueChange={setSelectedModelId}
                  >
                    <SelectTrigger id="memory-model">
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
                </div>
              )}
            </SheetBody>
            <SheetFooter>
              <Button
                type="button"
                disabled={!canExtract}
                onClick={() => setStep({ name: "confirm-extract" })}
              >
                Continuar
              </Button>
            </SheetFooter>
          </>
        ) : step.name === "confirm-extract" ? (
          <>
            <SheetBody>
              <AiRunPreflight
                rows={[
                  {
                    label: "Texto",
                    value: `${trimmedLength} caracteres escritos`,
                  },
                  {
                    label: "Modelo",
                    value: selectedModelLabel ?? "Tu modelo por defecto",
                  },
                ]}
              />
            </SheetBody>
            <SheetFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep({ name: "write" })}
              >
                Volver
              </Button>
              <Button type="button" onClick={handleExtract}>
                Generar borrador
              </Button>
            </SheetFooter>
          </>
        ) : step.name === "extracting" ? (
          <SheetBody className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Generando el borrador…
          </SheetBody>
        ) : step.name === "clarifying" ? (
          <ClarifyingForm
            questions={step.questions}
            onSubmit={handleClarifyingSubmit}
            onCancel={() => setStep({ name: "write" })}
          />
        ) : step.name === "confirm-refine" ? (
          <>
            <SheetBody>
              <AiRunPreflight
                rows={[
                  {
                    label: "Preguntas",
                    value: `${step.questions.length} respondidas`,
                  },
                  {
                    label: "Modelo",
                    value: selectedModelLabel ?? "Tu modelo por defecto",
                  },
                ]}
              />
            </SheetBody>
            <SheetFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setStep({
                    name: "clarifying",
                    questions: step.questions,
                    title: step.title,
                    bullet: step.bullet,
                    skillTags: step.skillTags,
                  })
                }
              >
                Volver
              </Button>
              <Button type="button" onClick={handleRefine}>
                Refinar borrador
              </Button>
            </SheetFooter>
          </>
        ) : step.name === "refining" ? (
          <SheetBody className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Refinando el borrador…
          </SheetBody>
        ) : step.name === "review" ? (
          <ReviewForm
            defaultValues={{
              title: step.title,
              bullet: step.bullet,
              skillTags: step.skillTags,
            }}
            aiNotes={step.aiNotes}
            onSubmit={(values) => void handleConfirmSave(values)}
          />
        ) : step.name === "saving" ? (
          <SheetBody className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Guardando en el banco…
          </SheetBody>
        ) : (
          <>
            <SheetBody className="flex flex-col gap-3">
              {step.code === "provider_not_configured" ? (
                <p className="text-sm">
                  {step.message}{" "}
                  <Link href="/ai-providers" className="underline">
                    Configurar proveedor de IA
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
                onClick={() => setStep({ name: "write" })}
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
