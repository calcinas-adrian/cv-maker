"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import {
  getPasskeyErrorCode,
  mapPasskeyError,
} from "@/features/auth/passkey-errors"

export function AddPasskeyButton() {
  const [isLoading, setIsLoading] = useState(false)

  async function handleAddPasskey() {
    setIsLoading(true)
    const { data, error } = await authClient.passkey.addPasskey()
    setIsLoading(false)

    if (data) {
      toast.success("Passkey agregada. La próxima vez podés entrar sin GitHub.")
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
    <Button
      type="button"
      disabled={isLoading}
      onClick={() => void handleAddPasskey()}
    >
      {isLoading ? "Agregando…" : "Agregar una passkey"}
    </Button>
  )
}
