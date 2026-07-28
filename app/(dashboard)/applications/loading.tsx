import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

function Bar({ className }: { className?: string }) {
  return (
    <div className={cn("bg-muted h-4 animate-pulse rounded-md", className)} />
  )
}

/**
 * Mirrors one `AdaptationHistory` card: title + date row, the "adaptado
 * desde" line, the notes block, the two-line posting preview, and the
 * action row. Same skeleton vocabulary as `career-material/loading.tsx`.
 */
function AdaptationCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Bar className="h-5 w-44" />
          <Bar className="h-3 w-20" />
        </div>
        <Bar className="h-3 w-36" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Bar className="h-12 w-full" />
        <div className="flex flex-col gap-1.5">
          <Bar className="h-3 w-full" />
          <Bar className="h-3 w-3/4" />
        </div>
        <div className="flex items-center justify-between">
          <Bar className="h-7 w-36" />
          <Bar className="h-7 w-24" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function ApplicationsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex flex-col gap-1.5">
        <Bar className="h-6 w-44" />
        <Bar className="h-3 w-full" />
        <Bar className="h-3 w-2/3" />
      </div>
      <div className="flex flex-col gap-2">
        <AdaptationCardSkeleton />
        <AdaptationCardSkeleton />
      </div>
    </div>
  )
}
