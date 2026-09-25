"use client"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { AutosaveStatus } from "./use-autosave"

const LABELS: Partial<Record<AutosaveStatus, string>> = {
  saving: "Guardando…",
  saved: "Guardado",
  error: "Sin guardar",
}

const SAVE_ERROR_EXPLANATION =
  "No pudimos guardar tus últimos cambios. Revisá tu conexión y reintentá; no cierres esta pestaña."

/**
 * `onRetry` is optional so the badge still renders (without an escape hatch)
 * if a future caller mounts it outside `useAutosave` — but every current
 * caller (`CvEditor`) has a live retry from that hook, so `status === "error"`
 * always gets one in practice.
 */
export function AutosaveIndicator({
  status,
  onRetry,
}: {
  status: AutosaveStatus
  onRetry?: () => void
}) {
  const label = LABELS[status]
  if (!label) return null

  if (status === "error") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="bg-destructive/10 text-destructive flex items-center gap-1.5 rounded-full py-0.5 pr-1 pl-2 text-xs">
            {label}
            {onRetry && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-destructive hover:bg-destructive/20 hover:text-destructive h-5 px-1.5"
                onClick={onRetry}
              >
                Reintentar
              </Button>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>{SAVE_ERROR_EXPLANATION}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs",
        status === "saving" && "bg-muted text-muted-foreground",
        status === "saved" && "bg-primary/10 text-primary",
      )}
    >
      {label}
    </span>
  )
}
