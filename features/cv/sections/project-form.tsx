"use client"

import type { ReactNode } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
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
import type { ProjectItem } from "@/schemas/cv.schema"

/**
 * Shared form contract for a single `project` item — used both by the
 * manual add/edit dialog (`ProjectSection`) and the GitHub-import review
 * step (`features/github-import/import-dialog.tsx`), so an AI-extracted
 * draft is edited with the exact same fields/validation a manually-entered
 * project would be, never a parallel/forked form.
 */
export const projectFormSchema = z.object({
  name: z.string().min(1, "Obligatorio"),
  description: z.string().optional(),
  url: z.string().optional(),
  bulletsText: z.string().optional(),
})

export type ProjectFormValues = z.infer<typeof projectFormSchema>

export function projectItemToFormValues(
  item: ProjectItem | null,
): ProjectFormValues {
  return {
    name: item?.name ?? "",
    description: item?.description ?? "",
    url: item?.url ?? "",
    bulletsText: item?.bullets?.join("\n") ?? "",
  }
}

export function formValuesToProjectItem(
  values: ProjectFormValues,
  id: string,
): ProjectItem {
  const bullets = values.bulletsText
    ? values.bulletsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : []

  return {
    id,
    name: values.name,
    description: values.description || undefined,
    url: values.url || null,
    bullets,
  }
}

/**
 * Presentational form only — deliberately has no `<Dialog>`/`<DialogContent>`
 * wrapper of its own. `ProjectSection` renders it inside its own Dialog;
 * the GitHub-import review step renders it as a step inside ITS dialog
 * (nesting two Radix Dialogs would be its own headache), so the chrome
 * stays the caller's responsibility and only the fields + submit button
 * are shared here.
 *
 * `submitLabel` default is "Guardar" (Spanish) rather than "Save" — this
 * form has no `<Dialog>`/wrapper of its own, and every current caller
 * (`ProjectSection`'s manual add/edit dialog) is Spanish UI, so the
 * default matches rather than requiring every call site to override it.
 */
export function ProjectForm({
  defaultValues,
  onSubmit,
  submitLabel = "Guardar",
  submitDisabled = false,
  notice,
}: {
  defaultValues: ProjectFormValues
  onSubmit: (values: ProjectFormValues) => void
  submitLabel?: string
  submitDisabled?: boolean
  notice?: ReactNode
}) {
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues,
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-3"
      >
        {notice}
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
          name="url"
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
                <Textarea rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bulletsText"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Viñetas (una por línea)</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
