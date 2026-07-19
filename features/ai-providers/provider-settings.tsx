"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PROVIDER_LABELS, type AiProviderId } from "@/lib/ai/catalog"
import {
  deleteProviderKey,
  listProviderKeys,
  type ProviderKeySummary,
} from "./actions"
import { ProviderKeyDialog } from "./provider-key-dialog"

/**
 * Top-level client component for `/settings`. Receives the initial,
 * already-masked list from the RSC page (`listProviderKeys` ran there with
 * the request's session) and re-fetches the same masked list after any
 * add/edit/delete — mirroring `features/cv/version-history.tsx`'s
 * fetch-then-refresh pattern rather than trying to merge partial state,
 * since the only source of truth for the masked key is the server.
 */
export function ProviderSettings({
  initialProviders,
}: {
  initialProviders: ProviderKeySummary[]
}) {
  const [providers, setProviders] = useState(initialProviders)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function refresh() {
    const result = await listProviderKeys()
    if (result.ok) setProviders(result.data)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    const result = await deleteProviderKey(id)
    setDeletingId(null)
    if (result.ok) {
      void refresh()
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
                      defaultModel: p.defaultModel,
                    }}
                    onSaved={refresh}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={deletingId === p.id}
                    onClick={() => handleDelete(p.id)}
                  >
                    Eliminar
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="text-muted-foreground flex flex-col gap-1 text-sm">
                <p>Clave: {p.maskedKey}</p>
                {p.defaultModel && <p>Modelo: {p.defaultModel}</p>}
                {p.baseURL && <p>Base URL: {p.baseURL}</p>}
                <p>
                  {p.lastValidatedAt
                    ? `Validado: ${new Date(p.lastValidatedAt).toLocaleString()}`
                    : "Sin validar"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
