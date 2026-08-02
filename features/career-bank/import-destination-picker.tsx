"use client"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ImportDestination } from "@/schemas/bank.schema"

export type { ImportDestination }

/**
 * Shared destination picker for both importers (GitHub + PDF/DOCX) —
 * `sdd/career-bank-restructure/design` Decision 8: BOTH default to "bank",
 * no per-importer divergence, because a split default would make "where did
 * my import go" depend on which button was pressed.
 *
 * When the user has no live personal bank (`bankAvailable === false`), the
 * "Banco" option is disabled with an inline explanation and the value is
 * forced to `"cv_only"` — a file upload or repo import must never silently
 * mint a bank the user never asked to create.
 */
export function ImportDestinationPicker({
  value,
  onChange,
  bankAvailable,
  idPrefix,
}: {
  value: ImportDestination
  onChange: (value: ImportDestination) => void
  bankAvailable: boolean
  idPrefix: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${idPrefix}-destination`}>Guardar en</Label>
      <Select
        value={bankAvailable ? value : "cv_only"}
        onValueChange={(next) => onChange(next as ImportDestination)}
        disabled={!bankAvailable}
      >
        <SelectTrigger id={`${idPrefix}-destination`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="bank">Banco de carrera (recomendado)</SelectItem>
          <SelectItem value="cv_only">Solo este CV</SelectItem>
        </SelectContent>
      </Select>
      {!bankAvailable && (
        <p className="text-muted-foreground text-xs">
          Todavía no tenés un banco de carrera — este ítem se va a agregar solo
          a este CV.
        </p>
      )}
    </div>
  )
}
