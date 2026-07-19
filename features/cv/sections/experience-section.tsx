"use client"

import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ExperienceItem } from "@/schemas/cv.schema"
import { EMPTY_EXPERIENCES, useEditorStore } from "../editor-store"
import { ItemRow } from "./item-row"
import {
  ExperienceForm,
  experienceItemToFormValues,
  formValuesToExperienceItem,
  type ExperienceFormValues,
} from "./experience-form"

export function ExperienceSection() {
  const experiences = useEditorStore(
    (s) => s.draft?.experiences ?? EMPTY_EXPERIENCES,
  )
  const addExperience = useEditorStore((s) => s.addExperience)
  const updateExperience = useEditorStore((s) => s.updateExperience)
  const removeExperience = useEditorStore((s) => s.removeExperience)
  const moveExperience = useEditorStore((s) => s.moveExperience)

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Bumped on every open — used as the `ExperienceForm`'s `key` so it fully
  // remounts (and re-reads `defaultValues`) each time the dialog opens,
  // even when reopening to edit the very same item. Radix keeps
  // `DialogContent` mounted across opens, so relying on `editingId` alone
  // wouldn't remount when the id is unchanged from the previous open.
  const [dialogInstance, setDialogInstance] = useState(0)

  function openAddDialog() {
    setEditingId(null)
    setDialogInstance((n) => n + 1)
    setOpen(true)
  }

  function openEditDialog(item: ExperienceItem) {
    setEditingId(item.id)
    setDialogInstance((n) => n + 1)
    setOpen(true)
  }

  function onSubmit(values: ExperienceFormValues) {
    const id = editingId ?? crypto.randomUUID()
    const item = formValuesToExperienceItem(values, id)

    if (editingId) {
      updateExperience(editingId, item)
    } else {
      addExperience(item)
    }
    setOpen(false)
  }

  const editingItem = editingId
    ? (experiences.find((e) => e.id === editingId) ?? null)
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Experiencia</CardTitle>
        <CardAction>
          <Button type="button" size="sm" onClick={openAddDialog}>
            <PlusIcon /> Agregar
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {experiences.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no agregaste experiencia.
          </p>
        ) : (
          experiences.map((item, index) => (
            <ItemRow
              key={item.id}
              title={[item.role, item.company].filter(Boolean).join(" @ ")}
              subtitle={[item.startDate, item.endDate]
                .filter(Boolean)
                .join(" — ")}
              onEdit={() => openEditDialog(item)}
              onRemove={() => removeExperience(item.id)}
              onMoveUp={() => moveExperience(item.id, "up")}
              onMoveDown={() => moveExperience(item.id, "down")}
              canMoveUp={index > 0}
              canMoveDown={index < experiences.length - 1}
            />
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar experiencia" : "Agregar experiencia"}
            </DialogTitle>
          </DialogHeader>
          <ExperienceForm
            key={dialogInstance}
            defaultValues={experienceItemToFormValues(editingItem)}
            onSubmit={onSubmit}
          />
        </DialogContent>
      </Dialog>
    </Card>
  )
}
