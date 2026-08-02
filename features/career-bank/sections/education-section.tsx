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
import {
  bankEducationInputSchema,
  type BankEducationInput,
} from "@/schemas/bank.schema"
import {
  createEducation,
  deleteEducation,
  duplicateEducation,
  moveEducation,
  updateEducation,
  type BankEducationRow,
} from "@/features/career-bank/actions"
import { ItemRow } from "@/features/cv/sections/item-row"

const EMPTY_VALUES: BankEducationInput = {
  institution: "",
  degree: "",
  startDate: null,
  endDate: null,
}

function rowToFormValues(row: BankEducationRow): BankEducationInput {
  return {
    institution: row.institution,
    degree: row.degree,
    startDate: row.startDate,
    endDate: row.endDate,
  }
}

export function EducationSection({
  education,
  onChanged,
}: {
  education: BankEducationRow[]
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Bank items are hand-written and, unlike a CV's derived children, cannot
  // be recovered from anywhere else in the app — see
  // `architecture/deletion-policy`. Gates a `ConfirmDialog` instead of
  // calling `deleteEducation` straight from `ItemRow`'s trash button.
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const form = useForm<BankEducationInput>({
    resolver: zodResolver(bankEducationInputSchema),
    defaultValues: EMPTY_VALUES,
  })

  function openAddDialog() {
    setEditingId(null)
    form.reset(EMPTY_VALUES)
    setOpen(true)
  }

  function openEditDialog(row: BankEducationRow) {
    setEditingId(row.id)
    form.reset(rowToFormValues(row))
    setOpen(true)
  }

  async function onSubmit(values: BankEducationInput) {
    const result = editingId
      ? await updateEducation(editingId, values)
      : await createEducation(values)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setOpen(false)
    onChanged()
  }

  async function handleRemove(id: string) {
    const result = await deleteEducation(id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  async function handleClone(id: string) {
    const result = await duplicateEducation(id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  async function handleMove(id: string, direction: "up" | "down") {
    const result = await moveEducation(id, direction)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  const deletingRow = deleteId
    ? (education.find((e) => e.id === deleteId) ?? null)
    : null

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
              onClone={() => void handleClone(item.id)}
              onRemove={() => setDeleteId(item.id)}
              onMoveUp={() => void handleMove(item.id, "up")}
              onMoveDown={() => void handleMove(item.id, "down")}
              canMoveUp={index > 0}
              canMoveDown={index < education.length - 1}
            />
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar educación" : "Agregar educación"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
              <DialogBody className="flex flex-col gap-3">
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
                          <Input
                            placeholder="2018"
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
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fin</FormLabel>
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
                </div>
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
        title="¿Eliminar esta educación?"
        description={
          <>
            {deletingRow ? (
              <strong>
                {[deletingRow.degree, deletingRow.institution]
                  .filter(Boolean)
                  .join(" @ ")}
              </strong>
            ) : (
              "Esta entrada"
            )}{" "}
            se elimina del banco. Esta acción no se puede deshacer desde la app.
          </>
        }
        onConfirm={() => (deleteId ? handleRemove(deleteId) : undefined)}
      />
    </Card>
  )
}
