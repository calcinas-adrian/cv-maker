"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
import {
  bankCredentialInputSchema,
  bankCredentialKinds,
  type BankCredentialInput,
} from "@/schemas/bank.schema"
import {
  createCredential,
  deleteCredential,
  duplicateCredential,
  moveCredential,
  updateCredential,
  type BankCredentialRow,
} from "@/features/career-bank/actions"
import { ItemRow } from "@/features/cv/sections/item-row"

const KIND_LABELS = { certification: "Certificación", award: "Premio" } as const

const EMPTY_VALUES: BankCredentialInput = {
  kind: "certification",
  name: "",
  issuer: null,
  issuedAt: null,
  expiresAt: null,
  credentialId: null,
  credentialUrl: null,
  description: null,
}

function rowToFormValues(row: BankCredentialRow): BankCredentialInput {
  return {
    kind: row.kind === "award" ? "award" : "certification",
    name: row.name,
    issuer: row.issuer,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    credentialId: row.credentialId,
    credentialUrl: row.credentialUrl,
    description: row.description,
  }
}

/**
 * "Credenciales" — the bank's successor to `cv/sections/achievement-
 * section.tsx`'s `AchievementItem` field set, per Decision 3's rename
 * (`title`->`name`, `date`->`issuedAt`/`expiresAt`, plus `kind`,
 * `credentialId`, `credentialUrl`).
 */
export function CredentialSection({
  credentials,
  onChanged,
}: {
  credentials: BankCredentialRow[]
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Bank items are hand-written and, unlike a CV's derived children, cannot
  // be recovered from anywhere else in the app — see
  // `architecture/deletion-policy`. Gates a `ConfirmDialog` instead of
  // calling `deleteCredential` straight from `ItemRow`'s trash button.
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const form = useForm<BankCredentialInput>({
    resolver: zodResolver(bankCredentialInputSchema),
    defaultValues: EMPTY_VALUES,
  })

  function openAddDialog() {
    setEditingId(null)
    form.reset(EMPTY_VALUES)
    setOpen(true)
  }

  function openEditDialog(row: BankCredentialRow) {
    setEditingId(row.id)
    form.reset(rowToFormValues(row))
    setOpen(true)
  }

  async function onSubmit(values: BankCredentialInput) {
    const result = editingId
      ? await updateCredential(editingId, values)
      : await createCredential(values)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setOpen(false)
    onChanged()
  }

  async function handleRemove(id: string) {
    const result = await deleteCredential(id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  async function handleClone(id: string) {
    const result = await duplicateCredential(id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  async function handleMove(id: string, direction: "up" | "down") {
    const result = await moveCredential(id, direction)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  const deletingRow = deleteId
    ? (credentials.find((c) => c.id === deleteId) ?? null)
    : null

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
              title={item.name}
              subtitle={[
                KIND_LABELS[item.kind === "award" ? "award" : "certification"],
                item.issuer,
              ]
                .filter(Boolean)
                .join(" · ")}
              onEdit={() => openEditDialog(item)}
              onClone={() => void handleClone(item.id)}
              onRemove={() => setDeleteId(item.id)}
              onMoveUp={() => void handleMove(item.id, "up")}
              onMoveDown={() => void handleMove(item.id, "down")}
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
                          {bankCredentialKinds.map((k) => (
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
                        <Input {...field} />
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
                        <Input
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value || null)
                          }
                        />
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
                          <Input
                            placeholder="2022"
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(e.target.value || null)
                            }
                          />
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
                          <Input
                            placeholder="2025"
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(e.target.value || null)
                            }
                          />
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
                        <Input
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value || null)
                          }
                        />
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
                        <Input
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value || null)
                          }
                        />
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
                        <Textarea
                          rows={3}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value || null)
                          }
                        />
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

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteId(null)
        }}
        title="¿Eliminar esta credencial?"
        description={
          <>
            {deletingRow ? (
              <strong>{deletingRow.name}</strong>
            ) : (
              "Esta credencial"
            )}{" "}
            se elimina del banco. Esta acción no se puede deshacer desde la app.
          </>
        }
        onConfirm={() => (deleteId ? handleRemove(deleteId) : undefined)}
      />
    </Card>
  )
}
