import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

function Bar({ className }: { className?: string }) {
  return (
    <div className={cn("bg-muted h-4 animate-pulse rounded-md", className)} />
  )
}

/**
 * Mirrors one section card: a title-shaped bar (in place of `CardTitle` +
 * its `CardAction` "Agregar" button) then a couple of item-row-shaped bars.
 * Same skeleton vocabulary as `settings/loading.tsx`'s `ProviderCardSkeleton`
 * and the deleted `career-material/loading.tsx`'s `MaterialCardSkeleton`.
 */
function SectionCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <Bar className="h-5 w-32" />
        <Bar className="h-8 w-20" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Bar className="h-10 w-full" />
        <Bar className="h-10 w-full" />
      </CardContent>
    </Card>
  )
}

/**
 * Mirrors `BankPage`'s shape: the "Tu banco" title + description block,
 * the profile card, then one skeleton per section (Trayectoria, Material,
 * Educación, Credenciales, Idiomas, Habilidades).
 */
export default function BankLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex flex-col gap-1.5">
        <Bar className="h-6 w-40" />
        <Bar className="h-3 w-full" />
        <Bar className="h-3 w-2/3" />
      </div>
      <div className="flex flex-col gap-6">
        <SectionCardSkeleton />
        <SectionCardSkeleton />
        <SectionCardSkeleton />
        <SectionCardSkeleton />
        <SectionCardSkeleton />
        <SectionCardSkeleton />
      </div>
    </div>
  )
}
