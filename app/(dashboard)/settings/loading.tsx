import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

function Bar({ className }: { className?: string }) {
  return (
    <div className={cn("bg-muted h-4 animate-pulse rounded-md", className)} />
  )
}

/**
 * Mirrors one `ProviderSettings` card: a title-shaped bar (in place of
 * `CardTitle` + its edit/delete `CardAction` buttons) then a few
 * detail-line-shaped bars (key/model/base URL/validated status).
 */
function ProviderCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <Bar className="h-5 w-24" />
        <div className="flex gap-2">
          <Bar className="h-8 w-16" />
          <Bar className="h-8 w-16" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Bar className="h-3 w-48" />
        <Bar className="h-3 w-32" />
        <Bar className="h-3 w-40" />
      </CardContent>
    </Card>
  )
}

/**
 * Mirrors `SettingsPage`'s shape: the "Proveedores de IA" title + description
 * block, then `ProviderSettings`' "Agregar proveedor" action row and a
 * handful of provider card rows.
 */
export default function SettingsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex flex-col gap-1.5">
        <Bar className="h-6 w-48" />
        <Bar className="h-3 w-full" />
        <Bar className="h-3 w-2/3" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <Bar className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-2">
          <ProviderCardSkeleton />
          <ProviderCardSkeleton />
        </div>
      </div>
    </div>
  )
}
