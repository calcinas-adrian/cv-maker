"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2Icon, LanguagesIcon } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TranslationLanguage } from "@/lib/translate/types"
import { useTranslate } from "./use-translate"

const LANGUAGE_LABEL: Record<TranslationLanguage, string> = {
  es: "Español",
  en: "Inglés",
}

/**
 * Same pick/confirm/running/review/error step-machine SHAPE as
 * `AdaptCvDialog`, but the machine itself lives in `useTranslate` — this
 * component is the presentational shell (design's file-changes table).
 */
export function TranslateCvDialog({
  cvId,
  title,
}: {
  cvId: string
  title: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const {
    step,
    to,
    setTo,
    from,
    isSaving,
    reset,
    goToPick,
    goToConfirm,
    confirmDownload,
    runTranslate,
    updateReviewTitle,
    save,
  } = useTranslate(cvId, title)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  async function handleSave() {
    const result = await save()
    if (result && !result.ok) {
      toast.error(result.error)
      return
    }
    if (!result) return

    setOpen(false)
    router.push(`/cv/${result.data.id}/edit`)
    // Same ordering as `adapt-dialog.tsx`'s `handleConfirm`: close the Sheet
    // BEFORE navigating away, so Radix's close cleanup (body scroll/focus-trap
    // unlock) runs before the component might unmount mid-navigation.
    // `refresh()` re-renders `app/(dashboard)/cv/layout.tsx`'s server tree —
    // this dialog is launched from inside `/cv/*`, a sibling navigation that
    // layout would otherwise not re-fetch `listUserCvs` for.
    router.refresh()
  }

  const methodLabel =
    step.name === "confirm"
      ? step.probing
        ? "Comprobando disponibilidad…"
        : step.probe?.ready && step.probe.free
          ? "En tu dispositivo (gratis)"
          : step.probe &&
              !step.probe.ready &&
              step.probe.reason === "model_download_required"
            ? "Requiere descargar el modelo (o proveedor pago)"
            : "Modelo de IA configurado (proveedor pago)"
      : "—"

  const isOnDevice =
    step.name === "confirm" && step.probe?.ready === true && step.probe.free

  const needsDownloadConsent =
    step.name === "confirm" &&
    !step.probing &&
    step.probe?.ready === false &&
    step.probe.reason === "model_download_required"

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <LanguagesIcon data-icon="inline-start" />
          Traducir
        </Button>
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Traducir CV</SheetTitle>
          <SheetDescription>
            Traducí el contenido de este CV a otro idioma y revisá el resultado
            antes de crear un CV nuevo — el original no se modifica.
          </SheetDescription>
        </SheetHeader>

        {step.name === "pick" ? (
          <>
            <SheetBody className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="translate-to">Traducir a</Label>
                <Select
                  value={to}
                  onValueChange={(value) => setTo(value as TranslationLanguage)}
                >
                  <SelectTrigger id="translate-to">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">Inglés</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Se traducen el título, el resumen, la experiencia, los
                  proyectos y las categorías de habilidades. Datos de contacto,
                  URLs, nombres de empresas y educación quedan sin cambios.
                </p>
              </div>
            </SheetBody>
            <SheetFooter>
              <Button type="button" onClick={goToConfirm}>
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
                    label: "Dirección",
                    value: `${LANGUAGE_LABEL[from]} → ${LANGUAGE_LABEL[to]}`,
                  },
                  { label: "Método", value: methodLabel },
                ]}
                disclaimer={
                  isOnDevice ? (
                    <p className="text-muted-foreground text-xs">
                      La traducción corre en tu dispositivo, sin costo. Una vez
                      que empieza no se puede cancelar.
                    </p>
                  ) : undefined
                }
              />
              {needsDownloadConsent ? (
                <div className="mt-3 flex flex-col gap-2 rounded-lg border p-3">
                  <p className="text-sm">
                    Podés traducir gratis en este dispositivo, pero primero hay
                    que descargar el modelo de traducción (puede pesar varios
                    GB). ¿Querés descargarlo?
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={confirmDownload}
                  >
                    Descargar modelo y traducir gratis
                  </Button>
                </div>
              ) : null}
            </SheetBody>
            <SheetFooter>
              <Button type="button" variant="outline" onClick={goToPick}>
                Volver
              </Button>
              <Button
                type="button"
                disabled={step.probing}
                onClick={() => void runTranslate()}
              >
                Traducir el CV
              </Button>
            </SheetFooter>
          </>
        ) : step.name === "translating" ? (
          <SheetBody className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            {step.downloadProgress !== null
              ? `Descargando el modelo de traducción… ${Math.round(step.downloadProgress * 100)}%`
              : step.total > 0
                ? `Traduciendo… ${step.done}/${step.total}`
                : "Traduciendo tu CV…"}
          </SheetBody>
        ) : step.name === "review" ? (
          <>
            <SheetBody className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="translate-title">Título</Label>
                <Input
                  id="translate-title"
                  value={step.title}
                  onChange={(e) => updateReviewTitle(e.target.value)}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Resumen: {step.data.summary || "—"}
              </p>
              <p className="text-muted-foreground text-xs">
                {step.data.experiences.length} experiencias,{" "}
                {step.data.projects.length} proyectos y{" "}
                {step.data.skills.length} habilidades traducidas. Revisá el
                resultado en el editor después de crear el CV.
              </p>
            </SheetBody>
            <SheetFooter>
              <Button type="button" disabled={isSaving} onClick={handleSave}>
                {isSaving ? "Creando…" : "Crear CV traducido"}
              </Button>
            </SheetFooter>
          </>
        ) : (
          <>
            <SheetBody>
              <p className="text-destructive text-sm">{step.message}</p>
            </SheetBody>
            <SheetFooter>
              <Button type="button" variant="outline" onClick={goToPick}>
                Volver
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
