import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

function Bar({ className }: { className?: string }) {
  return <div className={cn("bg-muted animate-pulse rounded-md", className)} />
}

function ApplicationCardSkeleton() {
  return (
    <Card>
      <CardHeader className="py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Bar className="h-5 w-44" />
            <Bar className="h-3 w-64 max-w-full" />
          </div>
          <Bar className="h-6 w-20 shrink-0 rounded-full" />
          <Bar className="mt-1 size-4 shrink-0" />
        </div>
      </CardHeader>
      <CardContent className="border-t pt-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Bar className="h-16" />
          <Bar className="h-16" />
          <Bar className="h-16" />
          <Bar className="h-16" />
        </div>
        <Bar className="mt-5 h-8 w-36" />
      </CardContent>
    </Card>
  )
}

export default function ApplicationsLoading() {
  return (
    <div className="flex w-full flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
      <div className="space-y-2">
        <Bar className="h-6 w-40" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-2/3" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Bar className="h-4 w-52" />
        <Bar className="h-9 w-44" />
      </div>
      <div className="flex flex-col gap-3">
        <ApplicationCardSkeleton />
        <ApplicationCardSkeleton />
      </div>
    </div>
  )
}
