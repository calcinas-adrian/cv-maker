"use client"

import { useEffect, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  AI_PROVIDERS,
  PROVIDER_LABELS,
  getModelCatalog,
  type AiProviderId,
} from "@/lib/ai/catalog"
import {
  providerKeyInputSchema,
  type ProviderKeyInput,
} from "@/schemas/ai-provider-key.schema"
import { saveProviderKey } from "./actions"

export type EditingProvider = {
  id: string
  provider: AiProviderId
  baseURL: string | null
  modelId: string | null
}

type ProviderKeyDialogProps = {
  trigger: React.ReactNode
  editing?: EditingProvider
  onSaved: () => void
}

/**
 * Add/update form for a single credential.
 *
 * On edit the API key field starts blank and is now OPTIONAL: leaving it
 * empty means "keep the stored key". The server still never sends a
 * decryptable key back to the client (see `listProviderKeys`, which only
 * returns a mask), so the field cannot be pre-filled — but it no longer has
 * to be re-entered either. Requiring it was a dead end: since the user
 * cannot read their stored key from the app, changing any other setting
 * pushed them to mint a fresh key at the provider just to get past this
 * form.
 *
 * The model chosen here is registered against the credential. Adding FURTHER
 * models to an existing credential is a separate, lighter flow that never
 * touches the key at all — see `addProviderModel` and the "Agregar modelo"
 * control in `provider-settings.tsx`.
 */
export function ProviderKeyDialog({
  trigger,
  editing,
  onSaved,
}: ProviderKeyDialogProps) {
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<ProviderKeyInput>({
    resolver: zodResolver(providerKeyInputSchema),
    defaultValues: {
      id: editing?.id,
      provider: editing?.provider ?? "anthropic",
      apiKey: "",
      baseURL: editing?.baseURL ?? undefined,
      modelId: editing?.modelId ?? "",
    },
  })

  // Dialog content is kept mounted by Radix between opens; reset the form
  // to this row's values (with a blank key) each time it's opened so a
  // previous edit's leftover input never leaks into the next one.
  useEffect(() => {
    if (open) {
      form.reset({
        id: editing?.id,
        provider: editing?.provider ?? "anthropic",
        apiKey: "",
        baseURL: editing?.baseURL ?? undefined,
        modelId: editing?.modelId ?? "",
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // `useWatch` (not `form.watch()`) — the latter returns a plain function
  // reference that the React Compiler can't safely memoize around.
  const provider = useWatch({ control: form.control, name: "provider" })
  const catalog = getModelCatalog(provider)

  async function onSubmit(values: ProviderKeyInput) {
    setIsSubmitting(true)
    const result = await saveProviderKey(values)
    setIsSubmitting(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success("Proveedor guardado")
    setOpen(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar proveedor" : "Agregar proveedor"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Dejá la API key vacía para conservar la actual — por seguridad no se muestra. Se valida contra el proveedor antes de guardarse."
              : "Se valida contra el proveedor antes de guardarse."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            {/* Explicitly registered (rather than relying on an
                unrendered defaultValues key) so the row id reliably
                round-trips into `onSubmit` for the edit case. */}
            <input type="hidden" {...form.register("id")} />

            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proveedor</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value)
                      form.setValue("modelId", "")
                    }}
                    disabled={!!editing}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {AI_PROVIDERS.map((id) => (
                        <SelectItem key={id} value={id}>
                          {PROVIDER_LABELS[id]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {provider === "compatible" && (
              <FormField
                control={form.control}
                name="baseURL"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base URL</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://api.ejemplo.com/v1"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    API key
                    {editing ? (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        — opcional
                      </span>
                    ) : null}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder={
                        editing ? "Dejala vacía para no cambiarla" : ""
                      }
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="modelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modelo</FormLabel>
                  {provider === "compatible" ? (
                    <FormControl>
                      <Input placeholder="id del modelo" {...field} />
                    </FormControl>
                  ) : (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Elegí un modelo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {catalog.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.label}
                            {!model.recommendedForExtraction ? " (básico)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Validando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
