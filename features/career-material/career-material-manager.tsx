"use client"

import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import type { CorpusItem } from "@/features/cv-adapt/build-material-corpus"
import {
  careerMaterialInputSchema,
  careerMaterialKinds,
  type CareerMaterialInput,
  type CareerMaterialKind,
} from "@/schemas/career-material.schema"
import {
  createCareerMaterial,
  deleteCareerMaterial,
  listMaterialPage,
  promoteDerivedMaterial,
  updateCareerMaterial,
  type CareerMaterialRow,
} from "./actions"

const KIND_LABELS: Record<CareerMaterialKind, string> = {
  experience_bullet: "Viñeta de experiencia",
  project_bullet: "Viñeta de proyecto",
  skill: "Habilidad",
  summary_note: "Nota de resumen",
}

const EMPTY_VALUES: CareerMaterialInput = {
  kind: "experience_bullet",
  company: null,
  role: null,
  projectName: null,
  content: "",
  tags: [],
}

function rowToFormValues(row: CareerMaterialRow): CareerMaterialInput {
  return {
    kind: row.kind as CareerMaterialKind,
    company: row.company,
    role: row.role,
    projectName: row.projectName,
    content: row.content,
    tags: row.tags,
  }
}

/**
 * Add/edit form for one `career_material` item. Explicit Save/Cancel only
 * (D2 — no autosave anywhere in this feature). Which context fields are
 * shown/relevant depends on `kind`; the schema keeps all three
 * (`company`/`role`/`projectName`) as always-present-but-nullable fields, so
 * switching `kind` resets the ones that no longer apply rather than
 * silently persisting stale values from a previous kind.
 */
function MaterialForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = "Guardar",
}: {
  defaultValues: CareerMaterialInput
  onSubmit: (values: CareerMaterialInput) => void
  onCancel: () => void
  submitLabel?: string
}) {
  const form = useForm<CareerMaterialInput>({
    resolver: zodResolver(careerMaterialInputSchema),
    defaultValues,
  })
  const kind = useWatch({ control: form.control, name: "kind" })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-3"
      >
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
                  form.setValue("company", null)
                  form.setValue("role", null)
                  form.setValue("projectName", null)
                }}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {careerMaterialKinds.map((k) => (
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

        {kind === "experience_bullet" ? (
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="company"
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
        ) : kind === "project_bullet" ? (
          <FormField
            control={form.control}
            name="projectName"
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
        ) : null}

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
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Etiquetas (separadas por coma)</FormLabel>
              <FormControl>
                <Input
                  value={field.value.join(", ")}
                  onChange={(e) =>
                    field.onChange(
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
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit">{submitLabel}</Button>
        </div>
      </form>
    </Form>
  )
}

function itemSubtitle(
  kind: CareerMaterialKind,
  item: {
    company: string | null
    role: string | null
    projectName: string | null
  },
) {
  if (kind === "experience_bullet") {
    return [item.role, item.company].filter(Boolean).join(" @ ") || undefined
  }
  if (kind === "project_bullet") {
    return item.projectName ?? undefined
  }
  return undefined
}

/**
 * Top-level client component for `/career-material`. Receives the initial
 * lists from the RSC page (`listMaterialPage` ran there with the request's
 * session) and re-fetches BOTH after any add/edit/delete/promote —
 * mirroring `features/ai-providers/provider-settings.tsx`'s
 * fetch-then-refresh pattern, rather than merging partial state, since the
 * derived group's dedup depends on the saved group and a merge would
 * drift.
 */
export function CareerMaterialManager({
  initialSaved,
  initialDerived,
}: {
  initialSaved: CareerMaterialRow[]
  initialDerived: CorpusItem[]
}) {
  const [saved, setSaved] = useState(initialSaved)
  const [derived, setDerived] = useState(initialDerived)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  async function refresh() {
    const result = await listMaterialPage()
    if (result.ok) {
      setSaved(result.data.saved)
      setDerived(result.data.derived)
    }
  }

  async function handleCreate(values: CareerMaterialInput) {
    const result = await createCareerMaterial(values)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setIsAdding(false)
    void refresh()
  }

  async function handleUpdate(id: string, values: CareerMaterialInput) {
    const result = await updateCareerMaterial(id, values)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setEditingId(null)
    void refresh()
  }

  async function handleDelete(id: string) {
    setPendingKey(id)
    const result = await deleteCareerMaterial(id)
    setPendingKey(null)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    void refresh()
  }

  async function handlePromote(item: CorpusItem) {
    setPendingKey(item.key)
    const result = await promoteDerivedMaterial({
      kind: item.kind,
      company: item.company,
      role: item.role,
      projectName: item.projectName,
      content: item.content,
      tags: [],
    })
    setPendingKey(null)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Guardado en el banco")
    void refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Tu banco</h2>
          {!isAdding && (
            <Button type="button" size="sm" onClick={() => setIsAdding(true)}>
              Agregar material
            </Button>
          )}
        </div>

        {isAdding ? (
          <Card>
            <CardContent className="pt-6">
              <MaterialForm
                defaultValues={EMPTY_VALUES}
                onSubmit={handleCreate}
                onCancel={() => setIsAdding(false)}
              />
            </CardContent>
          </Card>
        ) : null}

        {saved.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no guardaste material en tu banco.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {saved.map((row) =>
              editingId === row.id ? (
                <Card key={row.id}>
                  <CardContent className="pt-6">
                    <MaterialForm
                      defaultValues={rowToFormValues(row)}
                      onSubmit={(values) => handleUpdate(row.id, values)}
                      onCancel={() => setEditingId(null)}
                    />
                  </CardContent>
                </Card>
              ) : (
                <Card key={row.id}>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      {KIND_LABELS[row.kind as CareerMaterialKind]}
                    </CardTitle>
                    <CardAction className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(row.id)}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={pendingKey === row.id}
                        onClick={() => handleDelete(row.id)}
                      >
                        Eliminar
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="text-muted-foreground flex flex-col gap-1 text-sm">
                    {itemSubtitle(row.kind as CareerMaterialKind, row) ? (
                      <p>{itemSubtitle(row.kind as CareerMaterialKind, row)}</p>
                    ) : null}
                    <p>{row.content}</p>
                    {row.tags.length > 0 ? (
                      <p className="text-xs">{row.tags.join(", ")}</p>
                    ) : null}
                  </CardContent>
                </Card>
              ),
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Derivado de tus CVs</h2>
        {derived.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No hay material derivado — todo tu contenido ya está en el banco o
            todavía no tenés otros CVs.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {derived.map((item) => (
              <Card key={item.key}>
                <CardHeader>
                  <CardTitle className="text-sm">
                    {KIND_LABELS[item.kind]}
                    {item.provenance ? ` · ${item.provenance.cvTitle}` : ""}
                  </CardTitle>
                  <CardAction>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pendingKey === item.key}
                      onClick={() => handlePromote(item)}
                    >
                      Guardar en el banco
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="text-muted-foreground flex flex-col gap-1 text-sm">
                  {item.label ? <p>{item.label}</p> : null}
                  <p>{item.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
