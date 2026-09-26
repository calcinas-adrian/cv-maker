"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { KeyRoundIcon } from "lucide-react"
import type { Passkey } from "@better-auth/passkey/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmDeleteButton } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { authClient } from "@/lib/auth-client"
import { getPasskeyErrorCode, mapPasskeyError } from "./passkey-errors"

/**
 * Pinned locale AND timeZone, matching
 * `features/cv-adapt/adaptation-history.tsx` — this list only ever renders
 * client-side (fetched after the dialog opens), so there is no hydration
 * mismatch to guard against here, but pinning keeps every passkey date in
 * the app's own Rioplatense format regardless of the visitor's OS locale.
 */
const DATE_FORMAT = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
})

/**
 * Dashboard-header entry point for passkey management: list, add, rename,
 * delete. Replaces the old bare "Agregar una passkey" button, which had no
 * way to see or remove a passkey once added — see `odd/tasks/
 * passkey-fixes.md` (T3).
 *
 * The list is re-fetched with a plain action call every time the dialog
 * opens, rather than kept in `authClient.useListPasskeys()`'s nanostore
 * subscription — that hook starts fetching as soon as ANY component calls
 * it, which here would mean on every dashboard load instead of only when
 * the user actually opens this dialog. This also keeps the same
 * fetch-then-refresh shape as `features/ai-providers/provider-settings.tsx`.
 */
export function PasskeyDialog() {
  const [open, setOpen] = useState(false)
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null)
  const [listErrorMessage, setListErrorMessage] = useState<string | null>(null)

  async function refresh() {
    const { data, error } = await authClient.passkey.listUserPasskeys()
    if (error) {
      const message =
        mapPasskeyError(error)?.message ?? "No se pudieron cargar tus passkeys."
      setListErrorMessage(message)
      toast.error(message)
      return
    }
    setListErrorMessage(null)
    setPasskeys(data)
  }

  // `.then` here (rather than an awaited call to `refresh`) keeps this
  // effect's body free of a synchronous setState call up front — only the
  // async continuation below updates state. Mirrors
  // `features/cv/version-history.tsx`'s initial-load effect.
  useEffect(() => {
    if (!open) return
    let cancelled = false

    authClient.passkey.listUserPasskeys().then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        const message =
          mapPasskeyError(error)?.message ??
          "No se pudieron cargar tus passkeys."
        setListErrorMessage(message)
        toast.error(message)
        return
      }
      setListErrorMessage(null)
      setPasskeys(data)
    })

    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <KeyRoundIcon data-icon="inline-start" />
          Passkeys
        </Button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Passkeys</DialogTitle>
          <DialogDescription>
            Usá la huella, el rostro o el PIN de tu dispositivo para entrar sin
            pasar por GitHub.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {passkeys === null ? (
            <p className="text-muted-foreground text-sm">
              {listErrorMessage ?? "Cargando…"}
            </p>
          ) : passkeys.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {passkeys.map((passkey) => (
                <PasskeyRow
                  key={passkey.id}
                  passkey={passkey}
                  onChanged={refresh}
                />
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              Todavía no agregaste ninguna passkey.
            </p>
          )}

          <AddPasskeyForm onAdded={refresh} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function PasskeyRow({
  passkey,
  onChanged,
}: {
  passkey: Passkey
  onChanged: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(passkey.name ?? "")
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const busy = isSaving || isDeleting

  async function handleRename() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === (passkey.name ?? "")) {
      setName(passkey.name ?? "")
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    const { error } = await authClient.passkey.updatePasskey({
      id: passkey.id,
      name: trimmed,
    })
    setIsSaving(false)

    if (error) {
      toast.error(
        mapPasskeyError(error)?.message ?? "No se pudo renombrar la passkey.",
      )
      return
    }

    setIsEditing(false)
    onChanged()
  }

  async function handleDelete() {
    setIsDeleting(true)
    const { error } = await authClient.passkey.deletePasskey({
      id: passkey.id,
    })
    setIsDeleting(false)

    if (error) {
      toast.error(
        mapPasskeyError(error)?.message ?? "No se pudo eliminar la passkey.",
      )
      return
    }

    onChanged()
  }

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
      {isEditing ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            autoFocus
            value={name}
            disabled={isSaving}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRename()
              if (e.key === "Escape") {
                setName(passkey.name ?? "")
                setIsEditing(false)
              }
            }}
            className="h-8"
          />
          <Button
            type="button"
            size="sm"
            disabled={isSaving}
            onClick={() => void handleRename()}
          >
            {isSaving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="min-w-0 truncate text-sm font-medium">
            {passkey.name || "Passkey sin nombre"}
          </p>
          <p className="text-muted-foreground min-w-0 truncate text-xs">
            Agregada el {DATE_FORMAT.format(new Date(passkey.createdAt))}
          </p>
        </div>
      )}

      {!isEditing && (
        <div className="flex shrink-0 gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setIsEditing(true)}
          >
            Renombrar
          </Button>
          <ConfirmDeleteButton
            size="sm"
            variant="ghost"
            disabled={busy}
            title="¿Eliminar esta passkey?"
            description="Si la borrás, no vas a poder entrar con ella desde ese dispositivo."
            onConfirm={handleDelete}
          >
            Eliminar
          </ConfirmDeleteButton>
        </div>
      )}
    </li>
  )
}

/**
 * The name is optional on purpose: most people have exactly one passkey per
 * device and don't need to label it, but a placeholder nudges toward naming
 * once a second one shows up in the list.
 */
function AddPasskeyForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  async function handleAdd() {
    setIsAdding(true)
    const trimmed = name.trim()
    const { data, error } = await authClient.passkey.addPasskey({
      name: trimmed || undefined,
    })
    setIsAdding(false)

    if (data) {
      toast.success("Passkey agregada. La próxima vez podés entrar sin GitHub.")
      setName("")
      onAdded()
      return
    }

    // Adding a passkey requires a fresh session (see `lib/auth.ts`'s
    // `passkey` plugin); a GitHub session older than 24h lands here instead
    // of the generic mapping, so the user can fix it in one click.
    if (getPasskeyErrorCode(error) === "SESSION_NOT_FRESH") {
      toast.error(
        mapPasskeyError(error)?.message ??
          "Iniciá sesión de nuevo para agregar una passkey.",
        {
          action: {
            label: "Volver a iniciar sesión",
            onClick: () =>
              void authClient.signIn.social({
                provider: "github",
                callbackURL: "/dashboard",
              }),
          },
        },
      )
      return
    }

    const mapped = mapPasskeyError(error)
    if (mapped) toast.error(mapped.message)
  }

  return (
    <div className="flex items-center gap-2 border-t pt-4">
      <Input
        placeholder="Ej.: Notebook, Celular"
        value={name}
        disabled={isAdding}
        onChange={(e) => setName(e.target.value)}
      />
      <Button
        type="button"
        disabled={isAdding}
        onClick={() => void handleAdd()}
      >
        {isAdding ? "Agregando…" : "Agregar passkey"}
      </Button>
    </div>
  )
}
