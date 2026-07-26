"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

export function AddPasskeyButton() {
  const [isLoading, setIsLoading] = useState(false)

  async function handleAddPasskey() {
    setIsLoading(true)
    try {
      await authClient.passkey.addPasskey()
    } catch {
      toast.error("No se pudo agregar la passkey")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button type="button" disabled={isLoading} onClick={handleAddPasskey}>
      {isLoading ? "Agregando…" : "Agregar una passkey"}
    </Button>
  )
}
