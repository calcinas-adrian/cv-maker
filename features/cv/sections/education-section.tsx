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
import type { EducationItem } from "@/schemas/cv.schema"
import { EMPTY_EDUCATION, useEditorStore } from "../editor-store"
import { ItemRow } from "./item-row"

const formSchema = z.object({
  institution: z.string().min(1, "Obligatorio"),
  degree: z.string().min(1, "Obligatorio"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

function toFormValues(item: EducationItem | null): FormValues {
  return {
    institution: item?.institution ?? "",
    degree: item?.degree ?? "",
    startDate: item?.startDate ?? "",
    endDate: item?.endDate ?? "",
  }
}

export function EducationSection() {
  const education = useEditorStore((s) => s.draft?.education ?? EMPTY_EDUCATION)
  const addEducation = useEditorStore((s) => s.addEducation)
  const updateEducation = useEditorStore((s) => s.updateEducation)
  const removeEducation = useEditorStore((s) => s.removeEducation)
  const moveEducation = useEditorStore((s) => s.moveEducation)

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

  function openEditDialog(item: EducationItem) {
    setEditingId(item.id)
    form.reset(toFormValues(item))
    setOpen(true)
  }

  function onSubmit(values: FormValues) {
    const item: EducationItem = {
      id: editingId ?? crypto.randomUUID(),
      institution: values.institution,
      degree: values.degree,
      startDate: values.startDate || null,
      endDate: values.endDate || null,
    }

    if (editingId) {
      updateEducation(editingId, item)
    } else {
      addEducation(item)
    }
    setOpen(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Educación</CardTitle>
        <CardAction>
          <Button type="button" size="sm" onClick={openAddDialog}>
            <PlusIcon /> Agregar
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {education.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no agregaste educación.
          </p>
        ) : (
          education.map((item, index) => (
            <ItemRow
              key={item.id}
              title={[item.degree, item.institution]
                .filter(Boolean)
                .join(" @ ")}
              subtitle={[item.startDate, item.endDate]
                .filter(Boolean)
                .join(" — ")}
              onEdit={() => openEditDialog(item)}
              onRemove={() => removeEducation(item.id)}
              onMoveUp={() => moveEducation(item.id, "up")}
              onMoveDown={() => moveEducation(item.id, "down")}
              canMoveUp={index > 0}
              canMoveDown={index < education.length - 1}
            />
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar educación" : "Agregar educación"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-3"
            >
              <FormField
                control={form.control}
                name="institution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institución</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="degree"
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
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Inicio</FormLabel>
                      <FormControl>
                        <Input placeholder="2018" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fin</FormLabel>
                      <FormControl>
                        <Input placeholder="2022" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
