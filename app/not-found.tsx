import Link from "next/link"
import { SearchXIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <SearchXIcon aria-hidden className="text-muted-foreground size-10" />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">No encontramos esta página</h1>
          <p className="text-muted-foreground text-sm">
            El enlace puede estar mal escrito, o el CV que buscás fue eliminado
            o pertenece a otra cuenta.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard">Volver al inicio</Link>
        </Button>
      </div>
    </div>
  )
}
