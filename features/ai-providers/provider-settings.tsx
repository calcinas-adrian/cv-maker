"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CheckIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ConfirmDeleteButton } from "@/components/ui/confirm-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  PROVIDER_LABELS,
  getModelCatalog,
  type AiProviderId,
} from "@/lib/ai/catalog"
import {
  addProviderModel,
  deleteProviderKey,
  deleteProviderModel,
  listProviderKeys,
  setDefaultProviderModel,
  type ProviderKeySummary,
} from "./actions"
import { ProviderKeyDialog } from "./provider-key-dialog"

/**
 * Top-level client component for `/settings`. Receives the initial,
 * already-masked list from the RSC page (`listProviderKeys` ran there with
 * the request's session) and re-fetches the same masked list after any
 * mutation — mirroring `features/cv/version-history.tsx`'s
 * fetch-then-refresh pattern rather than trying to merge partial state,
 * since the only source of truth for the masked key is the server.
 *
 * Since the credential/model split, each card renders its credential once
 * and its models as a list underneath. Adding a model here never asks for
 * the API key: the server reuses the stored ciphertext, which is the whole
 * point of the split (one secret, one row, rotation stays a one-row job).
 */
export function ProviderSettings({
  initialProviders,
}: {
  initialProviders: ProviderKeySummary[]
}) {
  const [providers, setProviders] = useState(initialProviders)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function refresh() {
    const result = await listProviderKeys()
    if (result.ok) setProviders(result.data)
  }

  /**
   * Every mutation here is the same shape: mark busy, call, surface the
   * error or refetch, clear busy. `busyId` is keyed by whichever row the
   * action targets so only that row's controls disable, not the page.
   */
  async function run(
    id: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setBusyId(id)
    const result = await action()
    setBusyId(null)
    if (result.ok) {
      void refresh()
    } else {
      toast.error(result.error ?? "No se pudo completar la acción")
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <ProviderKeyDialog
          trigger={<Button type="button">Agregar proveedor</Button>}
          onSaved={refresh}
        />
      </div>

      {providers.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Todavía no configuraste ningún proveedor.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {providers.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>
                  {PROVIDER_LABELS[p.provider as AiProviderId] ?? p.provider}
                </CardTitle>
                <CardAction className="flex gap-2">
                  <ProviderKeyDialog
                    trigger={
                      <Button type="button" size="sm" variant="outline">
                        Editar
                      </Button>
                    }
                    editing={{
                      id: p.id,
                      provider: p.provider as AiProviderId,
                      baseURL: p.baseURL,
                      modelId: p.models[0]?.modelId ?? null,
                    }}
                    onSaved={refresh}
                  />
                  <ConfirmDeleteButton
                    size="sm"
                    variant="destructive"
                    disabled={busyId === p.id}
                    title="¿Eliminar este proveedor?"
                    description={
                      <>
                        Se eliminará la clave de{" "}
                        <strong>
                          {PROVIDER_LABELS[p.provider as AiProviderId] ??
                            p.provider}
                        </strong>{" "}
                        junto con sus {p.models.length} modelo
                        {p.models.length === 1 ? "" : "s"}. Los flujos que la
                        usen dejarán de funcionar hasta que configures otra.
                      </>
                    }
                    onConfirm={() => run(p.id, () => deleteProviderKey(p.id))}
                  >
                    Eliminar
                  </ConfirmDeleteButton>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="text-muted-foreground flex flex-col gap-1">
                  <p>Clave: {p.maskedKey}</p>
                  {p.baseURL && <p>Base URL: {p.baseURL}</p>}
                  <p>
                    {p.lastValidatedAt
                      ? `Validado: ${new Date(p.lastValidatedAt).toLocaleString()}`
                      : "Sin validar"}
                  </p>
                </div>

                <ModelList
                  provider={p}
                  busyId={busyId}
                  onSetDefault={(modelRowId) =>
                    void run(modelRowId, () =>
                      setDefaultProviderModel(modelRowId),
                    )
                  }
                  // Returns the promise (rather than `void`-ing it) so the
                  // confirmation dialog can keep its buttons disabled until
                  // the action actually resolves.
                  onDelete={(modelRowId) =>
                    run(modelRowId, () => deleteProviderModel(modelRowId))
                  }
                  onAdded={refresh}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function ModelList({
  provider,
  busyId,
  onSetDefault,
  onDelete,
  onAdded,
}: {
  provider: ProviderKeySummary
  busyId: string | null
  onSetDefault: (modelRowId: string) => void
  onDelete: (modelRowId: string) => Promise<void>
  onAdded: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium">Modelos</p>
      {provider.models.length === 0 ? (
        <p className="text-muted-foreground">
          Esta clave no tiene modelos registrados.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {provider.models.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              <span className="flex items-center gap-2">
                <span>{m.modelId}</span>
                {m.isDefault && (
                  <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                    <CheckIcon className="size-3" />
                    por defecto
                  </span>
                )}
              </span>
              <span className="flex gap-1.5">
                {!m.isDefault && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busyId === m.id}
                    onClick={() => onSetDefault(m.id)}
                  >
                    Usar por defecto
                  </Button>
                )}
                <ConfirmDeleteButton
                  size="sm"
                  variant="ghost"
                  disabled={busyId === m.id}
                  title="¿Quitar este modelo?"
                  description={
                    <>
                      Se quitará <strong>{m.modelId}</strong> de esta clave. La
                      clave y el resto de sus modelos no se tocan, y si lo
                      volvés a registrar más adelante se reactiva el mismo
                      registro.
                    </>
                  }
                  confirmLabel="Quitar"
                  onConfirm={() => onDelete(m.id)}
                >
                  Quitar
                </ConfirmDeleteButton>
              </span>
            </li>
          ))}
        </ul>
      )}

      <AddModelForm providerKey={provider} onAdded={onAdded} />
    </div>
  )
}

/**
 * Inline "add another model to this credential" form. Explicit save, no
 * autosave — consistent with the rest of the settings surface.
 *
 * Models already registered on this credential are filtered out of the
 * select so the duplicate case is mostly unreachable from the UI; the
 * server still rejects it, since the select is not the security boundary.
 */
function AddModelForm({
  providerKey,
  onAdded,
}: {
  providerKey: ProviderKeySummary
  onAdded: () => void
}) {
  const [modelId, setModelId] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  const isCompatible = providerKey.provider === "compatible"
  const alreadyAdded = new Set(providerKey.models.map((m) => m.modelId))
  const available = getModelCatalog(
    providerKey.provider as AiProviderId,
  ).filter((m) => !alreadyAdded.has(m.id))

  async function handleAdd() {
    const trimmed = modelId.trim()
    if (!trimmed) return

    setIsAdding(true)
    const result = await addProviderModel({
      providerKeyId: providerKey.id,
      modelId: trimmed,
    })
    setIsAdding(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success("Modelo agregado")
    setModelId("")
    onAdded()
  }

  // A named provider with every catalog model already registered has
  // nothing left to offer. "compatible" always keeps the free-text input,
  // since its models live on an arbitrary endpoint and cannot be listed.
  if (!isCompatible && available.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      {isCompatible ? (
        <Input
          placeholder="id del modelo"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
        />
      ) : (
        <Select value={modelId} onValueChange={setModelId}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Agregar otro modelo con esta misma clave" />
          </SelectTrigger>
          <SelectContent>
            {available.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label}
                {!model.recommendedForExtraction ? " (básico)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isAdding || !modelId.trim()}
        onClick={() => void handleAdd()}
      >
        <PlusIcon data-icon="inline-start" />
        {isAdding ? "Validando…" : "Agregar"}
      </Button>
    </div>
  )
}
