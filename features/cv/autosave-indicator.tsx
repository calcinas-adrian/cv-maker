"use client"

import { cn } from "@/lib/utils"
import type { AutosaveStatus } from "./use-autosave"

const LABELS: Partial<Record<AutosaveStatus, string>> = {
  saving: "Guardando…",
  saved: "Guardado",
  error: "Sin guardar",
}

export function AutosaveIndicator({ status }: { status: AutosaveStatus }) {
  const label = LABELS[status]
  if (!label) return null

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs",
        status === "saving" && "bg-muted text-muted-foreground",
        status === "saved" && "bg-primary/10 text-primary",
        status === "error" && "bg-destructive/10 text-destructive",
      )}
    >
      {label}
    </span>
  )
}
