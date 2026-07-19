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
    const result = await createCv("CV sin título")
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
