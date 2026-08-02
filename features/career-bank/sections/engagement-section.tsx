"use client"

import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  bankEngagementInputSchema,
  bankEngagementKinds,
  type BankEngagementInput,
} from "@/schemas/bank.schema"
import {
  createEngagement,
  deleteEngagement,
  duplicateEngagement,
  moveEngagement,
  updateEngagement,
  type BankEngagementRow,
} from "@/features/career-bank/actions"
import { ItemRow } from "@/features/cv/sections/item-row"

const KIND_LABELS = { job: "Empleo", project: "Proyecto" } as const

const EMPTY_VALUES: BankEngagementInput = {
  kind: "job",
  organization: null,
  role: null,
  name: null,
  startDate: null,
  endDate: null,
  url: null,
  description: null,
}

function rowToFormValues(row: BankEngagementRow): BankEngagementInput {
  return {
    kind: row.kind === "project" ? "project" : "job",
    organization: row.organization,
    role: row.role,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    url: row.url,
    description: row.description,
  }
}

function engagementTitle(row: BankEngagementRow): string {
  if (row.kind === "project") return row.name || "Proyecto sin nombre"
  return (
    [row.role, row.organization].filter(Boolean).join(" @ ") ||
    "Empleo sin datos"
  )
}

function engagementSubtitle(row: BankEngagementRow): string | undefined {
  return [row.startDate, row.endDate].filter(Boolean).join(" — ") || undefined
}

function EngagementForm({
  defaultValues,
  onSubmit,
  onCancel,
}: {
  defaultValues: BankEngagementInput
  onSubmit: (values: BankEngagementInput) => void
  onCancel: () => void
}) {
  const form = useForm<BankEngagementInput>({
    resolver: zodResolver(bankEngagementInputSchema),
    defaultValues,
  })
  const kind = useWatch({ control: form.control, name: "kind" })

  return (
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
                  onValueChange={(value) => {
                    field.onChange(value)
                    form.setValue("organization", null)
                    form.setValue("role", null)
                    form.setValue("name", null)
                  }}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {bankEngagementKinds.map((k) => (
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

          {kind === "job" ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="organization"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Empresa</FormLabel>
                    <FormControl>
                      <Input
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Puesto</FormLabel>
                    <FormControl>
                      <Input
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ) : (
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proyecto</FormLabel>
                  <FormControl>
                    <Input
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Inicio</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="2020"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
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
                    <Input
                      placeholder="2023"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>URL</FormLabel>
                <FormControl>
                  <Input
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value || null)}
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
                    onChange={(e) => field.onChange(e.target.value || null)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit">Guardar</Button>
        </DialogFooter>
      </form>
    </Form>
  )
}

/**
 * "Trayectoria" — empleos y proyectos del banco. Each `bank_engagement`
 * groups the `bank_material`s attached to it (`MaterialSection` renders
 * those). Mirrors `features/cv/sections/education-section.tsx`'s
 * Card+ItemRow+Dialog shape; the difference is every mutation here is a
 * `career-bank` server action instead of a zustand store call, so each
 * handler calls `onChanged` (the parent's `getBankPage` refresh) on
 * success instead of updating local draft state directly.
 */
export function EngagementSection({
  engagements,
  onChanged,
}: {
  engagements: BankEngagementRow[]
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Bank items are hand-written and, unlike a CV's derived children, cannot
  // be recovered from anywhere else in the app (`restore.mjs` is disaster
  // recovery, not a UI safety net) — see `architecture/deletion-policy`.
  // `deleteId` gates a `ConfirmDialog` rather than calling `deleteEngagement`
  // straight from `ItemRow`'s trash button.
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function openAddDialog() {
    setEditingId(null)
    setOpen(true)
  }

  function openEditDialog(id: string) {
    setEditingId(id)
    setOpen(true)
  }

  async function handleSubmit(values: BankEngagementInput) {
    const result = editingId
      ? await updateEngagement(editingId, values)
      : await createEngagement(values)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setOpen(false)
    onChanged()
  }

  async function handleRemove(id: string) {
    const result = await deleteEngagement(id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  async function handleClone(id: string) {
    const result = await duplicateEngagement(id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  async function handleMove(id: string, direction: "up" | "down") {
    const result = await moveEngagement(id, direction)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  const editingRow = editingId
    ? (engagements.find((e) => e.id === editingId) ?? null)
    : null
  const deletingRow = deleteId
    ? (engagements.find((e) => e.id === deleteId) ?? null)
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trayectoria</CardTitle>
        <CardAction>
          <Button type="button" size="sm" onClick={openAddDialog}>
            <PlusIcon /> Agregar
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {engagements.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no agregaste empleos ni proyectos.
          </p>
        ) : (
          engagements.map((row, index) => (
            <ItemRow
              key={row.id}
              title={engagementTitle(row)}
              subtitle={engagementSubtitle(row)}
              onEdit={() => openEditDialog(row.id)}
              onClone={() => void handleClone(row.id)}
              onRemove={() => setDeleteId(row.id)}
              onMoveUp={() => void handleMove(row.id, "up")}
              onMoveDown={() => void handleMove(row.id, "down")}
              canMoveUp={index > 0}
              canMoveDown={index < engagements.length - 1}
            />
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar compromiso" : "Agregar compromiso"}
            </DialogTitle>
          </DialogHeader>
          <EngagementForm
            key={editingId ?? "new"}
            defaultValues={
              editingRow ? rowToFormValues(editingRow) : EMPTY_VALUES
            }
            onSubmit={(values) => void handleSubmit(values)}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteId(null)
        }}
        title="¿Eliminar este compromiso?"
        description={
          <>
            {deletingRow ? (
              <strong>{engagementTitle(deletingRow)}</strong>
            ) : (
              "Este compromiso"
            )}{" "}
            se elimina del banco. Los materiales vinculados no se borran, pero
            quedan sin compromiso asociado. Esta acción no se puede deshacer
            desde la app.
          </>
        }
        onConfirm={() => (deleteId ? handleRemove(deleteId) : undefined)}
      />
    </Card>
  )
}
