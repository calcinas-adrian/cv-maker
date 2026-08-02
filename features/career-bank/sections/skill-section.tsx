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
  bankSkillInputSchema,
  type BankSkillInput,
} from "@/schemas/bank.schema"
import {
  createSkill,
  deleteSkill,
  duplicateSkill,
  moveSkill,
  updateSkill,
  type BankSkillRow,
} from "@/features/career-bank/actions"
import { ItemRow } from "@/features/cv/sections/item-row"

const EMPTY_VALUES: BankSkillInput = { name: "", category: null }

function rowToFormValues(row: BankSkillRow): BankSkillInput {
  return { name: row.name, category: row.category }
}

export function SkillSection({
  skills,
  onChanged,
}: {
  skills: BankSkillRow[]
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Bank items are hand-written and, unlike a CV's derived children, cannot
  // be recovered from anywhere else in the app — see
  // `architecture/deletion-policy`. Gates a `ConfirmDialog` instead of
  // calling `deleteSkill` straight from `ItemRow`'s trash button.
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const form = useForm<BankSkillInput>({
    resolver: zodResolver(bankSkillInputSchema),
    defaultValues: EMPTY_VALUES,
  })

  function openAddDialog() {
    setEditingId(null)
    form.reset(EMPTY_VALUES)
    setOpen(true)
  }

  function openEditDialog(row: BankSkillRow) {
    setEditingId(row.id)
    form.reset(rowToFormValues(row))
    setOpen(true)
  }

  async function onSubmit(values: BankSkillInput) {
    const result = editingId
      ? await updateSkill(editingId, values)
      : await createSkill(values)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setOpen(false)
    onChanged()
  }

  async function handleRemove(id: string) {
    const result = await deleteSkill(id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  async function handleClone(id: string) {
    const result = await duplicateSkill(id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  async function handleMove(id: string, direction: "up" | "down") {
    const result = await moveSkill(id, direction)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  const deletingRow = deleteId
    ? (skills.find((s) => s.id === deleteId) ?? null)
    : null

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
              title={item.name}
              subtitle={item.category ?? undefined}
              onEdit={() => openEditDialog(item)}
              onClone={() => void handleClone(item.id)}
              onRemove={() => setDeleteId(item.id)}
              onMoveUp={() => void handleMove(item.id, "up")}
              onMoveDown={() => void handleMove(item.id, "down")}
              canMoveUp={index > 0}
              canMoveDown={index < skills.length - 1}
            />
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar habilidad" : "Agregar habilidad"}
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
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoría</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Idiomas, Herramientas, …"
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
        title="¿Eliminar esta habilidad?"
        description={
          <>
            {deletingRow ? (
              <strong>{deletingRow.name}</strong>
            ) : (
              "Esta habilidad"
            )}{" "}
            se elimina del banco. Esta acción no se puede deshacer desde la app.
          </>
        }
        onConfirm={() => (deleteId ? handleRemove(deleteId) : undefined)}
      />
    </Card>
  )
}
