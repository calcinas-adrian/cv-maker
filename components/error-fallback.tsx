"use client"

import Link from "next/link"
import { TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

type ErrorFallbackProps = {
  error: Error & { digest?: string }
  reset: () => void
}

// Shared body for the route-level `error.tsx` boundaries. The raw error
// message is never shown: it is usually technical English text from a
// library. The digest is the only identifier that maps to the server log.
export function ErrorFallback({ error, reset }: ErrorFallbackProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <TriangleAlertIcon
          aria-hidden
          className="text-muted-foreground size-10"
        />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Algo salió mal</h1>
          <p className="text-muted-foreground text-sm">
            No pudimos cargar esta pantalla. Tus datos guardados no se
            perdieron. Probá de nuevo y, si el problema sigue, volvé al inicio.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={reset}>
            Reintentar
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Volver al inicio</Link>
          </Button>
        </div>
        {error.digest ? (
          <p className="text-muted-foreground text-xs">
            Código de referencia: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  )
}
