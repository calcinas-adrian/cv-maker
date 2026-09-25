"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
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
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  // The version pending confirmation, not the one currently restoring —
  // `restoringId` (below) still tracks the in-flight restore itself, once
  // confirmed.
  const [restoreTarget, setRestoreTarget] = useState<VersionSummary | null>(
    null,
  )
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
    setRestoringId(versionId)
    const result = await restoreVersion(cvId, versionId)
    setRestoringId(null)
    if (result.ok) {
      // Restoring only re-hydrates the client draft — it never writes to
      // the cv table directly. The user's next edit/autosave persists it.
      // Same CV as before (a version restore never changes which CV is
      // open), so `cvId` here is just the already-active one.
      hydrate(result.data, cvId)
    } else {
      toast.error(result.error)
    }
  }

  async function handleNameVersion() {
    setIsSaving(true)
    const result = await saveVersion(cvId, label || null)
    setIsSaving(false)
    if (result.ok) {
      setLabel("")
      setLabelDialogOpen(false)
      void refresh()
    } else {
      toast.error(result.error)
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
            <DialogContent size="sm">
              <DialogHeader>
                <DialogTitle>Nombrar esta versión</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="ej. Antes de postularme a Acme"
                />
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  disabled={isSaving}
                  onClick={handleNameVersion}
                >
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
            Todavía no hay versiones. Se crean con &quot;Nombrar esta
            versión&quot; (arriba) o automáticamente como resguardo antes de
            aplicar una importación desde GitHub.
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
                disabled={restoringId === version.id}
                onClick={() => setRestoreTarget(version)}
              >
                Restaurar
              </Button>
            </div>
          ))
        )}
      </CardContent>
      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null)
        }}
        title="Restaurar esta versión"
        description={
          <>
            Vas a reemplazar el contenido actual del editor por el de{" "}
            <strong>{restoreTarget?.label ?? "Snapshot automático"}</strong>. Tu
            versión actual no se guarda automáticamente antes de reemplazarla:
            si te arrepentís, podés deshacerlo con Ctrl+Z mientras no recargues
            ni cierres esta pestaña. Si preferís conservar el estado actual
            antes de restaurar, cerrá esto y usá &quot;Nombrar esta
            versión&quot; primero.
          </>
        }
        confirmLabel="Restaurar"
        pendingLabel="Restaurando…"
        onConfirm={() => {
          if (restoreTarget) return handleRestore(restoreTarget.id)
        }}
      />
    </Card>
  )
}
