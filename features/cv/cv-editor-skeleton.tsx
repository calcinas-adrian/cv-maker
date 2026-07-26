import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

function Bar({ className }: { className?: string }) {
  return (
    <div className={cn("bg-muted h-4 animate-pulse rounded-md", className)} />
  )
}

function FieldSkeleton({ labelClassName }: { labelClassName: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Bar className={cn("h-3", labelClassName)} />
      <Bar className="h-9 w-full" />
    </div>
  )
}

/**
 * Mirrors `BasicInfoCard`'s shape: title bar, 2×2 grid of label+input
 * placeholder pairs, then one taller full-width bar for the textarea.
 */
function BasicInfoCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Bar className="h-5 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <FieldSkeleton labelClassName="w-24" />
          <FieldSkeleton labelClassName="w-12" />
          <FieldSkeleton labelClassName="w-16" />
          <FieldSkeleton labelClassName="w-20" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Bar className="h-3 w-16" />
          <Bar className="h-20 w-full" />
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Mirrors the shared shape of `ExperienceSection`/`ProjectSection`/
 * `EducationSection`/`SkillSection`: a title bar (with an "Agregar"-shaped
 * action bar) followed by a handful of item-row-shaped bars.
 */
function ListSectionSkeleton({
  titleClassName,
  rows,
}: {
  titleClassName: string
  rows: number
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <Bar className={cn("h-5", titleClassName)} />
        <Bar className="h-7 w-20" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Bar
            key={i}
            className={cn("h-10", i % 2 === 0 ? "w-full" : "w-11/12")}
          />
        ))}
      </CardContent>
    </Card>
  )
}

/**
 * Skeleton for the editor's form content area, shaped after the real form
 * branch in `CvEditor` (`BasicInfoCard` + the list sections). Shared by
 * `app/(dashboard)/cv/[id]/edit/loading.tsx` (route transition) and
 * `CvEditor` (client-side guard against rendering a different CV's stale
 * `draft` for one frame after a switch) so both placeholders look identical
 * instead of drifting apart.
 */
export function CvEditorSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <BasicInfoCardSkeleton />
      <ListSectionSkeleton titleClassName="w-28" rows={2} />
      <ListSectionSkeleton titleClassName="w-24" rows={3} />
      <ListSectionSkeleton titleClassName="w-20" rows={2} />
    </div>
  )
}
