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
import type { ProjectItem } from "@/schemas/cv.schema"
import { EMPTY_PROJECTS, useEditorStore } from "../editor-store"
import { ItemRow } from "./item-row"
import {
  ProjectForm,
  formValuesToProjectItem,
  projectItemToFormValues,
  type ProjectFormValues,
} from "./project-form"
import { ImportFromGithubDialog } from "@/features/github-import/import-dialog"

export function ProjectSection({ cvId }: { cvId: string }) {
  const projects = useEditorStore((s) => s.draft?.projects ?? EMPTY_PROJECTS)
  const addProject = useEditorStore((s) => s.addProject)
  const updateProject = useEditorStore((s) => s.updateProject)
  const removeProject = useEditorStore((s) => s.removeProject)
  const moveProject = useEditorStore((s) => s.moveProject)

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Bumped on every open — used as the `ProjectForm`'s `key` so it fully
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

  function openEditDialog(item: ProjectItem) {
    setEditingId(item.id)
    setDialogInstance((n) => n + 1)
    setOpen(true)
  }

  function onSubmit(values: ProjectFormValues) {
    const id = editingId ?? crypto.randomUUID()
    const item = formValuesToProjectItem(values, id)

    if (editingId) {
      updateProject(editingId, item)
    } else {
      addProject(item)
    }
    setOpen(false)
  }

  const editingItem = editingId
    ? (projects.find((p) => p.id === editingId) ?? null)
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Proyectos</CardTitle>
        <CardAction className="flex gap-2">
          <ImportFromGithubDialog cvId={cvId} />
          <Button type="button" size="sm" onClick={openAddDialog}>
            <PlusIcon /> Agregar
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {projects.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no agregaste proyectos.
          </p>
        ) : (
          projects.map((item, index) => (
            <ItemRow
              key={item.id}
              title={item.name ?? ""}
              subtitle={item.description}
              onEdit={() => openEditDialog(item)}
              onRemove={() => removeProject(item.id)}
              onMoveUp={() => moveProject(item.id, "up")}
              onMoveDown={() => moveProject(item.id, "down")}
              canMoveUp={index > 0}
              canMoveDown={index < projects.length - 1}
            />
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar proyecto" : "Agregar proyecto"}
            </DialogTitle>
          </DialogHeader>
          <ProjectForm
            key={dialogInstance}
            defaultValues={projectItemToFormValues(editingItem)}
            onSubmit={onSubmit}
          />
        </DialogContent>
      </Dialog>
    </Card>
  )
}
