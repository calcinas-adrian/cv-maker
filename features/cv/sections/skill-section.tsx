"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import type { SkillItem } from "@/schemas/cv.schema"
import { EMPTY_SKILLS, useEditorStore } from "../editor-store"
import { ItemRow } from "./item-row"

const formSchema = z.object({
  name: z.string().min(1, "Obligatorio"),
  category: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

function toFormValues(item: SkillItem | null): FormValues {
  return {
    name: item?.name ?? "",
    category: item?.category ?? "",
  }
}

export function SkillSection() {
  const skills = useEditorStore((s) => s.draft?.skills ?? EMPTY_SKILLS)
  const addSkill = useEditorStore((s) => s.addSkill)
  const updateSkill = useEditorStore((s) => s.updateSkill)
  const removeSkill = useEditorStore((s) => s.removeSkill)
  const moveSkill = useEditorStore((s) => s.moveSkill)
  const duplicateSkill = useEditorStore((s) => s.duplicateSkill)

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(null),
  })

  function openAddDialog() {
    setEditingId(null)
    form.reset(toFormValues(null))
    setOpen(true)
  }

  function openEditDialog(item: SkillItem) {
    setEditingId(item.id)
    form.reset(toFormValues(item))
    setOpen(true)
  }

  function onSubmit(values: FormValues) {
    const item: SkillItem = {
      id: editingId ?? crypto.randomUUID(),
      name: values.name,
      category: values.category || null,
    }

    if (editingId) {
      updateSkill(editingId, item)
    } else {
      addSkill(item)
    }
    setOpen(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Habilidades</CardTitle>
        <CardAction>
          <Button type="button" size="sm" onClick={openAddDialog}>
            <PlusIcon /> Agregar
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {skills.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no agregaste habilidades.
          </p>
        ) : (
          skills.map((item, index) => (
            <ItemRow
              key={item.id}
              title={item.name ?? ""}
              subtitle={item.category ?? undefined}
              onEdit={() => openEditDialog(item)}
              onClone={() => duplicateSkill(item.id, crypto.randomUUID())}
              onRemove={() => removeSkill(item.id)}
              onMoveUp={() => moveSkill(item.id, "up")}
              onMoveDown={() => moveSkill(item.id, "down")}
              canMoveUp={index > 0}
              canMoveDown={index < skills.length - 1}
            />
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar habilidad" : "Agregar habilidad"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-3"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Idiomas, Herramientas, …"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit">Guardar</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
