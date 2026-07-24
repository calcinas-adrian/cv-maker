"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { createCv } from "@/features/cv/actions"

export function CreateCvButton() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  async function handleCreate() {
    setIsLoading(true)
    const createdAt = new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date())
    const result = await createCv(`CV sin título — ${createdAt}`)
    setIsLoading(false)
    if (result.ok) {
      router.push(`/cv/${result.data.id}/edit`)
    }
  }

  return (
    <Button type="button" disabled={isLoading} onClick={handleCreate}>
      {isLoading ? "Creando…" : "Nuevo CV"}
    </Button>
  )
}
