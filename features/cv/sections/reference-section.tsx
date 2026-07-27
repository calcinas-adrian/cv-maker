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
  CardDescription,
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
import type { ReferenceItem } from "@/schemas/cv.schema"
import { EMPTY_REFERENCES, useEditorStore } from "../editor-store"
import { ItemRow } from "./item-row"

/**
 * Unlike every other section, the email here belongs to a THIRD PARTY, so
 * an unnoticed typo silently breaks someone else's contactability rather
 * than the user's own. It is optional, but validated when filled — hence
 * the `"" | email` union instead of a plain optional string.
 */
const formSchema = z.object({
  name: z.string().min(1, "Obligatorio"),
  role: z.string().optional(),
  company: z.string().optional(),
  email: z.literal("").or(z.email("Email inválido")).optional(),
  phone: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

function toFormValues(item: ReferenceItem | null): FormValues {
  return {
    name: item?.name ?? "",
    role: item?.role ?? "",
    company: item?.company ?? "",
    email: item?.email ?? "",
    phone: item?.phone ?? "",
  }
}

export function ReferenceSection() {
  const references = useEditorStore(
    (s) => s.draft?.references ?? EMPTY_REFERENCES,
  )
  const addReference = useEditorStore((s) => s.addReference)
  const updateReference = useEditorStore((s) => s.updateReference)
  const removeReference = useEditorStore((s) => s.removeReference)
  const moveReference = useEditorStore((s) => s.moveReference)
  const duplicateReference = useEditorStore((s) => s.duplicateReference)

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

  function openEditDialog(item: ReferenceItem) {
    setEditingId(item.id)
    form.reset(toFormValues(item))
    setOpen(true)
  }

  function onSubmit(values: FormValues) {
    const item: ReferenceItem = {
      id: editingId ?? crypto.randomUUID(),
      name: values.name,
      role: values.role || null,
      company: values.company || null,
      email: values.email || null,
      phone: values.phone || null,
    }

    if (editingId) {
      updateReference(editingId, item)
    } else {
      addReference(item)
    }
    setOpen(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referencias</CardTitle>
        <CardDescription>
          Datos de contacto de otras personas. Pediles permiso antes de
          incluirlas.
        </CardDescription>
        <CardAction>
          <Button type="button" size="sm" onClick={openAddDialog}>
            <PlusIcon /> Agregar
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {references.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no agregaste referencias.
          </p>
        ) : (
          references.map((item, index) => (
            <ItemRow
              key={item.id}
              title={item.name ?? ""}
              subtitle={[item.role, item.company].filter(Boolean).join(" @ ")}
              onEdit={() => openEditDialog(item)}
              onClone={() => duplicateReference(item.id, crypto.randomUUID())}
              onRemove={() => removeReference(item.id)}
              onMoveUp={() => moveReference(item.id, "up")}
              onMoveDown={() => moveReference(item.id, "down")}
              canMoveUp={index > 0}
              canMoveDown={index < references.length - 1}
            />
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar referencia" : "Agregar referencia"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
              <DialogBody className="flex flex-col gap-3">
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
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Puesto</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Empresa</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teléfono</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
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
