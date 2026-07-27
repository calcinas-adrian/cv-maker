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
  DialogBody,
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
import { Textarea } from "@/components/ui/textarea"
import type { AchievementItem } from "@/schemas/cv.schema"
import { EMPTY_ACHIEVEMENTS, useEditorStore } from "../editor-store"
import { ItemRow } from "./item-row"

const formSchema = z.object({
  title: z.string().min(1, "Obligatorio"),
  issuer: z.string().optional(),
  date: z.string().optional(),
  description: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

function toFormValues(item: AchievementItem | null): FormValues {
  return {
    title: item?.title ?? "",
    issuer: item?.issuer ?? "",
    date: item?.date ?? "",
    description: item?.description ?? "",
  }
}

export function AchievementSection() {
  const achievements = useEditorStore(
    (s) => s.draft?.achievements ?? EMPTY_ACHIEVEMENTS,
  )
  const addAchievement = useEditorStore((s) => s.addAchievement)
  const updateAchievement = useEditorStore((s) => s.updateAchievement)
  const removeAchievement = useEditorStore((s) => s.removeAchievement)
  const moveAchievement = useEditorStore((s) => s.moveAchievement)
  const duplicateAchievement = useEditorStore((s) => s.duplicateAchievement)

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

  function openEditDialog(item: AchievementItem) {
    setEditingId(item.id)
    form.reset(toFormValues(item))
    setOpen(true)
  }

  function onSubmit(values: FormValues) {
    const item: AchievementItem = {
      id: editingId ?? crypto.randomUUID(),
      title: values.title,
      issuer: values.issuer || null,
      date: values.date || null,
      description: values.description || null,
    }

    if (editingId) {
      updateAchievement(editingId, item)
    } else {
      addAchievement(item)
    }
    setOpen(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logros</CardTitle>
        <CardAction>
          <Button type="button" size="sm" onClick={openAddDialog}>
            <PlusIcon /> Agregar
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {achievements.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no agregaste logros.
          </p>
        ) : (
          achievements.map((item, index) => (
            <ItemRow
              key={item.id}
              title={item.title ?? ""}
              subtitle={[item.issuer, item.date].filter(Boolean).join(" — ")}
              onEdit={() => openEditDialog(item)}
              onClone={() => duplicateAchievement(item.id, crypto.randomUUID())}
              onRemove={() => removeAchievement(item.id)}
              onMoveUp={() => moveAchievement(item.id, "up")}
              onMoveDown={() => moveAchievement(item.id, "down")}
              canMoveUp={index > 0}
              canMoveDown={index < achievements.length - 1}
            />
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar logro" : "Agregar logro"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
              <DialogBody className="flex flex-col gap-3">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Primer puesto en el hackathon interno"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="issuer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Otorgado por</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Empresa, institución…"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fecha</FormLabel>
                        <FormControl>
                          <Input placeholder="Mar 2023" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </DialogBody>
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
