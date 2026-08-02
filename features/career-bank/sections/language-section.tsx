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
  bankLanguageInputSchema,
  type BankLanguageInput,
} from "@/schemas/bank.schema"
import {
  createLanguage,
  deleteLanguage,
  duplicateLanguage,
  moveLanguage,
  updateLanguage,
  type BankLanguageRow,
} from "@/features/career-bank/actions"
import { ItemRow } from "@/features/cv/sections/item-row"

const EMPTY_VALUES: BankLanguageInput = { name: "", level: null }

function rowToFormValues(row: BankLanguageRow): BankLanguageInput {
  return { name: row.name, level: row.level }
}

export function LanguageSection({
  languages,
  onChanged,
}: {
  languages: BankLanguageRow[]
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Bank items are hand-written and, unlike a CV's derived children, cannot
  // be recovered from anywhere else in the app — see
  // `architecture/deletion-policy`. Gates a `ConfirmDialog` instead of
  // calling `deleteLanguage` straight from `ItemRow`'s trash button.
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const form = useForm<BankLanguageInput>({
    resolver: zodResolver(bankLanguageInputSchema),
    defaultValues: EMPTY_VALUES,
  })

  function openAddDialog() {
    setEditingId(null)
    form.reset(EMPTY_VALUES)
    setOpen(true)
  }

  function openEditDialog(row: BankLanguageRow) {
    setEditingId(row.id)
    form.reset(rowToFormValues(row))
    setOpen(true)
  }

  async function onSubmit(values: BankLanguageInput) {
    const result = editingId
      ? await updateLanguage(editingId, values)
      : await createLanguage(values)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setOpen(false)
    onChanged()
  }

  async function handleRemove(id: string) {
    const result = await deleteLanguage(id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  async function handleClone(id: string) {
    const result = await duplicateLanguage(id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  async function handleMove(id: string, direction: "up" | "down") {
    const result = await moveLanguage(id, direction)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  const deletingRow = deleteId
    ? (languages.find((l) => l.id === deleteId) ?? null)
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Idiomas</CardTitle>
        <CardAction>
          <Button type="button" size="sm" onClick={openAddDialog}>
            <PlusIcon /> Agregar
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {languages.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no agregaste idiomas.
          </p>
        ) : (
          languages.map((item, index) => (
            <ItemRow
              key={item.id}
              title={item.name}
              subtitle={item.level ?? undefined}
              onEdit={() => openEditDialog(item)}
              onClone={() => void handleClone(item.id)}
              onRemove={() => setDeleteId(item.id)}
              onMoveUp={() => void handleMove(item.id, "up")}
              onMoveDown={() => void handleMove(item.id, "down")}
              canMoveUp={index > 0}
              canMoveDown={index < languages.length - 1}
            />
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar idioma" : "Agregar idioma"}
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
                      <FormLabel>Idioma</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="level"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nivel</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Nativo, Avanzado, …"
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
        title="¿Eliminar este idioma?"
        description={
          <>
            {deletingRow ? <strong>{deletingRow.name}</strong> : "Este idioma"}{" "}
            se elimina del banco. Esta acción no se puede deshacer desde la app.
          </>
        }
        onConfirm={() => (deleteId ? handleRemove(deleteId) : undefined)}
      />
    </Card>
  )
}
