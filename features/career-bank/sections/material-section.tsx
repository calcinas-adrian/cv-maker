"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { PencilIcon, PlusIcon, StarIcon, TrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDeleteButton } from "@/components/ui/confirm-dialog"
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
  bankMaterialInputSchema,
  bankMaterialKinds,
  type BankMaterialInput,
} from "@/schemas/bank.schema"
import {
  addMaterialVariant,
  createMaterial,
  deleteMaterial,
  deleteVariant,
  setDefaultVariant,
  updateMaterial,
  type BankEngagementRow,
  type BankMaterialWithVariants,
} from "@/features/career-bank/actions"

const KIND_LABELS = { bullet: "Viñeta", summary: "Resumen" } as const

// Radix `Select.Item` cannot take an empty-string `value`, so "no engagement"
// needs a real sentinel converted back to `null` at the form boundary — same
// idiom the repo already uses wherever a nullable field is driven by
// `Select` (see `career-material-manager.tsx`'s `kind` reset-on-change).
const NO_ENGAGEMENT = "none"

const EMPTY_VALUES: BankMaterialInput = {
  engagementId: null,
  kind: "bullet",
  techTags: [],
  skillTags: [],
  content: "",
}

function rowToFormValues(row: BankMaterialWithVariants): BankMaterialInput {
  const defaultVariant =
    row.variants.find((v) => v.isDefault) ?? row.variants[0]
  return {
    engagementId: row.engagementId,
    kind: row.kind === "summary" ? "summary" : "bullet",
    techTags: row.techTags,
    skillTags: row.skillTags,
    content: defaultVariant?.content ?? "",
  }
}

function engagementLabel(engagement: BankEngagementRow): string {
  if (engagement.kind === "project") return engagement.name || "Proyecto"
  return (
    [engagement.role, engagement.organization].filter(Boolean).join(" @ ") ||
    "Empleo"
  )
}

function TagListInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string[]
  onChange: (tags: string[]) => void
}) {
  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <FormControl>
        <Input
          value={value.join(", ")}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )
}

function MaterialForm({
  defaultValues,
  engagements,
  onSubmit,
  onCancel,
}: {
  defaultValues: BankMaterialInput
  engagements: BankEngagementRow[]
  onSubmit: (values: BankMaterialInput) => void
  onCancel: () => void
}) {
  const form = useForm<BankMaterialInput>({
    resolver: zodResolver(bankMaterialInputSchema),
    defaultValues,
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
        <DialogBody className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {bankMaterialKinds.map((k) => (
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
              name="engagementId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Compromiso</FormLabel>
                  <Select
                    value={field.value ?? NO_ENGAGEMENT}
                    onValueChange={(value) =>
                      field.onChange(value === NO_ENGAGEMENT ? null : value)
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_ENGAGEMENT}>
                        Sin compromiso
                      </SelectItem>
                      {engagements.map((engagement) => (
                        <SelectItem key={engagement.id} value={engagement.id}>
                          {engagementLabel(engagement)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contenido</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="techTags"
            render={({ field }) => (
              <TagListInput
                label="Tecnologías (separadas por coma)"
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <FormField
            control={form.control}
            name="skillTags"
            render={({ field }) => (
              <TagListInput
                label="Habilidades (separadas por coma)"
                value={field.value}
                onChange={field.onChange}
              />
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
 * The variant list for ONE material. A material with a single (default)
 * variant just shows "Agregar variante"; once a second wording exists, every
 * variant is listed with a "Predeterminada" marker or a button to promote it
 * — spec: "Promote a CV bullet to a new variant" (adding a variant) and the
 * app-side "exactly one default" invariant (`setDefaultVariant`).
 */
function VariantList({
  material,
  onChanged,
}: {
  material: BankMaterialWithVariants
  onChanged: () => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [content, setContent] = useState("")
  const [label, setLabel] = useState("")

  async function handleAdd() {
    const result = await addMaterialVariant(material.id, {
      content,
      label: label || null,
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setAddOpen(false)
    setContent("")
    setLabel("")
    onChanged()
  }

  async function handleSetDefault(id: string) {
    const result = await setDefaultVariant(id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  async function handleDeleteVariant(id: string) {
    const result = await deleteVariant(id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  return (
    <div className="flex flex-col gap-1.5">
      {material.variants.length > 1
        ? material.variants.map((variant) => (
            <div
              key={variant.id}
              className="bg-muted/40 flex items-center justify-between gap-2 rounded-md p-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate">{variant.content}</p>
                {variant.label ? (
                  <p className="text-muted-foreground truncate text-xs">
                    {variant.label}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {variant.isDefault ? (
                  <span className="text-muted-foreground text-xs">
                    Predeterminada
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Marcar como predeterminada"
                    onClick={() => void handleSetDefault(variant.id)}
                  >
                    <StarIcon />
                  </Button>
                )}
                <ConfirmDeleteButton
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Eliminar variante"
                  title="¿Eliminar esta variante?"
                  description={
                    <>
                      Se pierde esta redacción del material
                      {variant.label ? (
                        <>
                          {" "}
                          (<strong>{variant.label}</strong>)
                        </>
                      ) : null}
                      . Esta acción no se puede deshacer desde la app.
                    </>
                  }
                  onConfirm={() => handleDeleteVariant(variant.id)}
                >
                  <TrashIcon />
                </ConfirmDeleteButton>
              </div>
            </div>
          ))
        : null}

      {addOpen ? (
        <div className="flex flex-col gap-2 rounded-md border p-2">
          <Textarea
            rows={2}
            placeholder="Otra redacción de este material"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <Input
            placeholder="Etiqueta (opcional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAddOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={content.trim().length < 3}
              onClick={() => void handleAdd()}
            >
              Agregar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="self-start"
          onClick={() => setAddOpen(true)}
        >
          <PlusIcon /> Agregar variante
        </Button>
      )}
    </div>
  )
}

/**
 * "Material" — the bank's successor to `career-material-manager.tsx`'s
 * single-table list, now backed by `bank_material` + `bank_material_variant`
 * (Decision 1). Rendered as Cards (not `ItemRow`, unlike every other section
 * in this feature) because a material's variant sub-list does not fit
 * `ItemRow`'s single-line row model — the same reasoning
 * `career-material-manager.tsx` itself already applied to this exact entity.
 * There is deliberately no manual reorder here: materials are grouped by
 * engagement and read in `(engagement.sortOrder, material.sortOrder)` order
 * by the corpus builder, so their relative position is derived from the
 * engagement list rather than dragged around per material.
 */
export function MaterialSection({
  materials,
  engagements,
  onChanged,
}: {
  materials: BankMaterialWithVariants[]
  engagements: BankEngagementRow[]
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  function openAddDialog() {
    setEditingId(null)
    setOpen(true)
  }

  function openEditDialog(id: string) {
    setEditingId(id)
    setOpen(true)
  }

  async function handleSubmit(values: BankMaterialInput) {
    const result = editingId
      ? await updateMaterial(editingId, values)
      : await createMaterial(values)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setOpen(false)
    onChanged()
  }

  async function handleRemove(id: string) {
    const result = await deleteMaterial(id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  const editingRow = editingId
    ? (materials.find((m) => m.id === editingId) ?? null)
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Material</CardTitle>
        <CardAction>
          <Button type="button" size="sm" onClick={openAddDialog}>
            <PlusIcon /> Agregar
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {materials.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no agregaste viñetas ni notas de resumen.
          </p>
        ) : (
          materials.map((material) => {
            const defaultVariant =
              material.variants.find((v) => v.isDefault) ?? material.variants[0]
            const engagement = material.engagementId
              ? engagements.find((e) => e.id === material.engagementId)
              : undefined

            return (
              <div
                key={material.id}
                className="flex flex-col gap-2 rounded-lg border p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {defaultVariant?.content ?? "(sin contenido)"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {[
                        KIND_LABELS[
                          material.kind === "summary" ? "summary" : "bullet"
                        ],
                        engagement ? engagementLabel(engagement) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {material.techTags.length > 0 ||
                    material.skillTags.length > 0 ? (
                      <p className="text-muted-foreground text-xs">
                        {[...material.techTags, ...material.skillTags].join(
                          ", ",
                        )}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Editar"
                      onClick={() => openEditDialog(material.id)}
                    >
                      <PencilIcon />
                    </Button>
                    <ConfirmDeleteButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Eliminar"
                      title="¿Eliminar este material?"
                      description={
                        <>
                          Se elimina también
                          {material.variants.length > 1
                            ? ` sus ${material.variants.length} variantes (las demás redacciones)`
                            : " su variante"}
                          . Esta acción no se puede deshacer desde la app.
                        </>
                      }
                      onConfirm={() => handleRemove(material.id)}
                    >
                      <TrashIcon />
                    </ConfirmDeleteButton>
                  </div>
                </div>
                <VariantList material={material} onChanged={onChanged} />
              </div>
            )
          })
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar material" : "Agregar material"}
            </DialogTitle>
          </DialogHeader>
          <MaterialForm
            key={editingId ?? "new"}
            defaultValues={
              editingRow ? rowToFormValues(editingRow) : EMPTY_VALUES
            }
            engagements={engagements}
            onSubmit={(values) => void handleSubmit(values)}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Card>
  )
}
