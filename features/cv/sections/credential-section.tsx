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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { credentialKinds, type CredentialItem } from "@/schemas/cv.schema"
import { EMPTY_CREDENTIALS, useEditorStore } from "../editor-store"
import { ItemRow } from "./item-row"

const KIND_LABELS = { certification: "Certificación", award: "Premio" } as const

const formSchema = z.object({
  kind: z.enum(credentialKinds),
  name: z.string().min(1, "Obligatorio"),
  issuer: z.string().optional(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  credentialId: z.string().optional(),
  credentialUrl: z.string().optional(),
  description: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

function toFormValues(item: CredentialItem | null): FormValues {
  return {
    kind: item?.kind ?? "certification",
    name: item?.name ?? "",
    issuer: item?.issuer ?? "",
    issuedAt: item?.issuedAt ?? "",
    expiresAt: item?.expiresAt ?? "",
    credentialId: item?.credentialId ?? "",
    credentialUrl: item?.credentialUrl ?? "",
    description: item?.description ?? "",
  }
}

/**
 * CV-side "Credenciales" — the successor to `AchievementSection`, renamed
 * and reshaped per `sdd/career-bank-restructure/design` Decision 3
 * (`title`->`name`, `date`->`issuedAt`/`expiresAt`, plus `kind`,
 * `credentialId`, `credentialUrl`). Field set and dialog layout mirror
 * `features/career-bank/sections/credential-section.tsx`, the bank-side
 * equivalent for the same entity shape — the difference is every mutation
 * here is a synchronous zustand store call (this section edits a CV draft,
 * not the bank), same convention every other `features/cv/sections/*`
 * component already uses.
 */
export function CredentialSection() {
  const credentials = useEditorStore(
    (s) => s.draft?.credentials ?? EMPTY_CREDENTIALS,
  )
  const addCredential = useEditorStore((s) => s.addCredential)
  const updateCredential = useEditorStore((s) => s.updateCredential)
  const removeCredential = useEditorStore((s) => s.removeCredential)
  const moveCredential = useEditorStore((s) => s.moveCredential)
  const duplicateCredential = useEditorStore((s) => s.duplicateCredential)

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

  function openEditDialog(item: CredentialItem) {
    setEditingId(item.id)
    form.reset(toFormValues(item))
    setOpen(true)
  }

  function onSubmit(values: FormValues) {
    const item: CredentialItem = {
      id: editingId ?? crypto.randomUUID(),
      kind: values.kind,
      name: values.name,
      issuer: values.issuer || null,
      issuedAt: values.issuedAt || null,
      expiresAt: values.expiresAt || null,
      credentialId: values.credentialId || null,
      credentialUrl: values.credentialUrl || null,
      description: values.description || null,
    }

    if (editingId) {
      updateCredential(editingId, item)
    } else {
      addCredential(item)
    }
    setOpen(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credenciales</CardTitle>
        <CardAction>
          <Button type="button" size="sm" onClick={openAddDialog}>
            <PlusIcon /> Agregar
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {credentials.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no agregaste certificaciones ni premios.
          </p>
        ) : (
          credentials.map((item, index) => (
            <ItemRow
              key={item.id}
              title={item.name ?? ""}
              subtitle={[KIND_LABELS[item.kind ?? "certification"], item.issuer]
                .filter(Boolean)
                .join(" · ")}
              onEdit={() => openEditDialog(item)}
              onClone={() => duplicateCredential(item.id, crypto.randomUUID())}
              onRemove={() => removeCredential(item.id)}
              onMoveUp={() => moveCredential(item.id, "up")}
              onMoveDown={() => moveCredential(item.id, "down")}
              canMoveUp={index > 0}
              canMoveDown={index < credentials.length - 1}
            />
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar credencial" : "Agregar credencial"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
              <DialogBody className="flex flex-col gap-3">
                <FormField
                  control={form.control}
                  name="kind"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {credentialKinds.map((k) => (
                            <SelectItem key={k} value={k}>
                              {KIND_LABELS[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="AWS Certified Solutions Architect"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="issuer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emisor</FormLabel>
                      <FormControl>
                        <Input placeholder="Empresa, institución…" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="issuedAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Emitida</FormLabel>
                        <FormControl>
                          <Input placeholder="Mar 2023" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expiresAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vence</FormLabel>
                        <FormControl>
                          <Input placeholder="Mar 2026" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="credentialId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID de credencial</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="credentialUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://…" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
