import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

function Bar({ className }: { className?: string }) {
  return (
    <div className={cn("bg-muted h-4 animate-pulse rounded-md", className)} />
  )
}

/**
 * Mirrors one material card: a title-shaped bar (in place of `CardTitle` +
 * its Editar/Eliminar `CardAction` buttons) then a couple of
 * content-line-shaped bars, same shape as `settings/loading.tsx`'s
 * `ProviderCardSkeleton`.
 */
function MaterialCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <Bar className="h-5 w-32" />
        <Bar className="h-8 w-20" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Bar className="h-3 w-48" />
        <Bar className="h-3 w-64" />
      </CardContent>
    </Card>
  )
}

/**
 * Mirrors `CareerMaterialPage`'s shape: the "Tu material" title +
 * description block, then the "Tu banco" group's add-button row and a
 * handful of material cards, then the "Derivado de tus CVs" group.
 */
export default function CareerMaterialLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex flex-col gap-1.5">
        <Bar className="h-6 w-40" />
        <Bar className="h-3 w-full" />
        <Bar className="h-3 w-2/3" />
      </div>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Bar className="h-4 w-20" />
            <Bar className="h-9 w-36" />
          </div>
          <div className="flex flex-col gap-2">
            <MaterialCardSkeleton />
            <MaterialCardSkeleton />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Bar className="h-4 w-32" />
          <MaterialCardSkeleton />
        </div>
      </div>
    </div>
  )
}
