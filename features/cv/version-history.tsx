"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  listVersions,
  restoreVersion,
  saveVersion,
  type VersionSummary,
} from "./actions"
import { useEditorStore } from "./editor-store"

export function VersionHistory({ cvId }: { cvId: string }) {
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [labelDialogOpen, setLabelDialogOpen] = useState(false)
  const [label, setLabel] = useState("")
  const hydrate = useEditorStore((s) => s.hydrate)

  async function refresh() {
    setLoading(true)
    const result = await listVersions(cvId)
    if (result.ok) setVersions(result.data)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false

    // `.then` here (rather than an awaited call to `refresh`) keeps this
    // effect's body free of a synchronous setState call up front — only
    // the async continuation below updates state.
    listVersions(cvId).then((result) => {
      if (cancelled) return
      if (result.ok) setVersions(result.data)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [cvId])

  async function handleRestore(versionId: string) {
    const result = await restoreVersion(cvId, versionId)
    if (result.ok) {
      // Restoring only re-hydrates the client draft — it never writes to
      // the cv table directly. The user's next edit/autosave persists it.
      hydrate(result.data)
    }
  }

  async function handleNameVersion() {
    const result = await saveVersion(cvId, label || null)
    if (result.ok) {
      setLabel("")
      setLabelDialogOpen(false)
      void refresh()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de versiones</CardTitle>
        <CardAction>
          <Dialog open={labelDialogOpen} onOpenChange={setLabelDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                Nombrar esta versión
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nombrar esta versión</DialogTitle>
              </DialogHeader>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="ej. Antes de postularme a Acme"
              />
              <DialogFooter>
                <Button type="button" onClick={handleNameVersion}>
                  Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {loading ? (
          <p className="text-muted-foreground text-sm">Cargando…</p>
        ) : versions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no hay versiones.
          </p>
        ) : (
          versions.map((version) => (
            <div
              key={version.id}
              className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {version.label ?? "Snapshot automático"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {new Date(version.createdAt).toLocaleString()}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleRestore(version.id)}
              >
                Restaurar
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
