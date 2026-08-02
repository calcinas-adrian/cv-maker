"use client"

import {
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  PencilIcon,
  TrashIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * The five-icon-button cluster (Subir/Bajar/Editar/Duplicar/Eliminar)
 * extracted out of `ItemRow` per `sdd/career-bank-restructure/design`
 * Decision 6, so the inline bullet-row list (`bullet-list-field.tsx`) can
 * reuse the exact same buttons/aria-labels without pulling in `ItemRow`'s
 * own title/subtitle shell — a bullet row's "shell" is a `<Textarea>`, not
 * a static title line.
 *
 * `onEdit` is the one action a bullet row has no use for (its content is
 * already inline-editable via the textarea itself, so a separate "Editar"
 * step would open a dialog to edit text already being edited) — kept
 * OPTIONAL here so `RowActions` renders without the pencil button when
 * omitted, while `ItemRow` below always supplies it, preserving pixel- and
 * behavior-parity with every existing caller.
 */
export function RowActions({
  onEdit,
  onClone,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  onEdit?: () => void
  // Required, not optional: every section that renders `RowActions` should
  // offer duplication, and making this mandatory is what forces TypeScript
  // to flag a caller that forgot to wire it up.
  onClone: () => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!canMoveUp}
        onClick={onMoveUp}
        aria-label="Subir"
      >
        <ChevronUpIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!canMoveDown}
        onClick={onMoveDown}
        aria-label="Bajar"
      >
        <ChevronDownIcon />
      </Button>
      {onEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label="Editar"
        >
          <PencilIcon />
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onClone}
        aria-label="Duplicar"
      >
        <CopyIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        aria-label="Eliminar"
      >
        <TrashIcon />
      </Button>
    </div>
  )
}

export function ItemRow({
  title,
  subtitle,
  onEdit,
  onClone,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  title: string
  subtitle?: string
  onEdit: () => void
  onClone: () => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        {subtitle ? (
          <p className="text-muted-foreground truncate text-xs">{subtitle}</p>
        ) : null}
      </div>
      <RowActions
        onEdit={onEdit}
        onClone={onClone}
        onRemove={onRemove}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
      />
    </div>
  )
}
