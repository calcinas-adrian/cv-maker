"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

export function AddPasskeyButton() {
  const [isLoading, setIsLoading] = useState(false)

  async function handleAddPasskey() {
    setIsLoading(true)
    await authClient.passkey.addPasskey()
    setIsLoading(false)
  }

  return (
    <Button type="button" disabled={isLoading} onClick={handleAddPasskey}>
      {isLoading ? "Agregando…" : "Agregar una passkey"}
    </Button>
  )
}
