"use client"

import type { ReactNode } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { DialogBody, DialogFooter } from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import type { ExperienceItem } from "@/schemas/cv.schema"
import { BulletListField } from "./bullet-list-field"

/**
 * Shared form contract for a single `experience` item — used both by the
 * manual add/edit dialog (`ExperienceSection`) and the GitHub-import review
 * step (`features/github-import/import-dialog.tsx`), mirroring
 * `project-form.tsx`'s extraction so an AI-extracted draft is edited with
 * the exact same fields/validation a manually-entered experience would be,
 * never a parallel/forked form.
 *
 * `company`/`startDate`/`endDate` stay required-by-convention here even
 * though a GitHub-extracted draft never fills them (see
 * `schemas/github-import.schema.ts`'s `experienceExtractSchema` — a repo's
 * code doesn't reliably tell you who employed the person or when) — the
 * empty defaults simply mean the "Guardar" button stays blocked by
 * `company`'s `min(1)` validation until the user fills it in during review,
 * exactly like the manual add flow already requires.
 *
 * `bullets: BulletDraft[]` replaces the old `bulletsText: string` per
 * `sdd/career-bank-restructure/design` Decision 6 — itemized, addressable
 * rows instead of a single multi-line textarea re-split on every save.
 */
export const experienceFormSchema = z.object({
  company: z.string().min(1, "Obligatorio"),
  role: z.string().min(1, "Obligatorio"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  // No `.optional().default([])` here (unlike `cvBulletSchema`'s array in
  // `schemas/cv.schema.ts`): `experienceItemToFormValues` below always
  // supplies a concrete array as `defaultValues`, and giving this field an
  // input/output split via zod's default splits `zodResolver`'s inferred
  // `Resolver<...>` generic into two incompatible shapes — required-with-
  // no-default keeps the form's field type and the schema's parsed type
  // identical, which is what `useForm<ExperienceFormValues>` needs.
  bullets: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      sourceMaterialId: z.string().nullable(),
    }),
  ),
})

export type ExperienceFormValues = z.infer<typeof experienceFormSchema>

export function experienceItemToFormValues(
  item: ExperienceItem | null,
): ExperienceFormValues {
  return {
    company: item?.company ?? "",
    role: item?.role ?? "",
    startDate: item?.startDate ?? "",
    endDate: item?.endDate ?? "",
    bullets: item?.bullets ?? [],
  }
}

export function formValuesToExperienceItem(
  values: ExperienceFormValues,
  id: string,
): ExperienceItem {
  return {
    id,
    company: values.company,
    role: values.role,
    startDate: values.startDate || null,
    endDate: values.endDate || null,
    bullets: values.bullets,
  }
}

/**
 * Presentational form only — deliberately has no `<Dialog>`/`<DialogContent>`
 * wrapper of its own, same reasoning as `ProjectForm`: `ExperienceSection`
 * renders it inside its own Dialog; the GitHub-import review step renders it
 * inside ITS sheet, so the shell stays the caller's responsibility and only
 * the fields + submit button are shared here.
 *
 * It DOES own its `DialogBody`/`DialogFooter` pair, so it must be mounted as
 * a direct child of a dialog or sheet shell — never nested inside another
 * body, which would stack two scroll containers. Callers that need to show
 * something above the fields pass it through `notice` rather than wrapping.
 */
export function ExperienceForm({
  defaultValues,
  onSubmit,
  submitLabel = "Guardar",
  submitDisabled = false,
  notice,
}: {
  defaultValues: ExperienceFormValues
  onSubmit: (values: ExperienceFormValues) => void
  submitLabel?: string
  submitDisabled?: boolean
  notice?: ReactNode
}) {
  const form = useForm<ExperienceFormValues>({
    resolver: zodResolver(experienceFormSchema),
    defaultValues,
  })

  return (
    <Form {...form}>
      {/* `contents` so the form box disappears from layout and `DialogBody` /
          `DialogFooter` become direct flex children of the dialog (or sheet)
          shell — the body scrolls, the submit row stays pinned — while the
          submit button remains inside the form element. */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
        <DialogBody className="flex flex-col gap-3">
          {notice}
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
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Inicio</FormLabel>
                  <FormControl>
                    <Input placeholder="Ene 2022" {...field} />
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
                    <Input placeholder="Actualidad" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="bullets"
            render={({ field }) => (
              <FormItem>
                <BulletListField
                  bullets={field.value}
                  onChange={field.onChange}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </DialogBody>
        <DialogFooter>
          <Button type="submit" disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
