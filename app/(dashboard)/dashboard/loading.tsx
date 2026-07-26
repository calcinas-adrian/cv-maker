import { Card, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

function Bar({ className }: { className?: string }) {
  return (
    <div className={cn("bg-muted h-4 animate-pulse rounded-md", className)} />
  )
}

/**
 * Mirrors one `DashboardCvList` card row: a `Card`/`CardHeader` with a
 * title-shaped bar in place of `CardTitle`.
 */
function CvCardSkeleton({ titleClassName }: { titleClassName: string }) {
  return (
    <Card>
      <CardHeader>
        <Bar className={cn("h-5", titleClassName)} />
      </CardHeader>
    </Card>
  )
}

/**
 * Mirrors `DashboardPage`'s shape: the "Tus CVs" header row (title +
 * `AddPasskeyButton`/`ImportFromFileDialog`/`CreateCvButton`) followed by a
 * handful of `DashboardCvList` card rows.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <Bar className="h-7 w-24" />
        <div className="flex items-center gap-2">
          <Bar className="h-9 w-9" />
          <Bar className="h-9 w-32" />
          <Bar className="h-9 w-28" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <CvCardSkeleton titleClassName="w-40" />
        <CvCardSkeleton titleClassName="w-32" />
        <CvCardSkeleton titleClassName="w-48" />
      </div>
    </div>
  )
}
