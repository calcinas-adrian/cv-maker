import { cn } from "@/lib/utils"

// Same convention as `features/cv/cv-editor-skeleton.tsx`'s `Bar` helper —
// kept as a local duplicate rather than a shared import since that file's
// `Bar` is not exported.
function Bar({ className }: { className?: string }) {
  return (
    <div className={cn("bg-muted h-4 animate-pulse rounded-md", className)} />
  )
}

function Pill({ className }: { className?: string }) {
  return (
    <div
      className={cn("bg-muted h-5 w-20 animate-pulse rounded-full", className)}
    />
  )
}

// Real CV sections only render once they have content (see
// `features/cv/sections/*`) — this mirrors that by rendering `count`
// item-shaped blocks (0 renders nothing) and capping the visual weight so a
// CV with 20 experiences doesn't produce a wall of skeleton blocks.
const MAX_ITEMS = 4

function SectionSkeleton({
  titleClassName,
  count,
}: {
  titleClassName: string
  count: number
}) {
  const items = Math.min(count, MAX_ITEMS)
  if (items <= 0) return null

  return (
    <div className="flex flex-col gap-2">
      <Bar className={cn("h-4", titleClassName)} />
      <div className="flex flex-col gap-3">
        {Array.from({ length: items }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Bar className="h-3.5 w-2/3" />
            <Bar className={cn("h-3", i % 2 === 0 ? "w-full" : "w-4/5")} />
            <Bar className="h-3 w-11/12" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Skeleton shaped like a rendered CV document (name bar, contact pills,
 * summary paragraph, then a labeled block per content section) rather than
 * a form — used for both the generic pre-hydration placeholder
 * (`CvWorkspaceShell`) and the data-aware in-progress-compile placeholder
 * (`TypstPreview`), which pass generic defaults vs. real item counts
 * respectively.
 */
export function DocumentSkeleton({
  experienceCount,
  projectCount,
  educationCount,
  skillCount,
  achievementCount,
  referenceCount,
  className,
}: {
  experienceCount: number
  projectCount: number
  educationCount: number
  skillCount: number
  achievementCount: number
  referenceCount: number
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-6 p-8", className)}>
      <div className="flex flex-col gap-3">
        <Bar className="h-6 w-1/2" />
        <div className="flex flex-wrap gap-2">
          <Pill className="w-24" />
          <Pill className="w-28" />
          <Pill className="w-20" />
          <Pill className="w-32" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Bar className="w-full" />
        <Bar className="w-11/12" />
        <Bar className="w-4/5" />
      </div>

      <SectionSkeleton titleClassName="w-28" count={experienceCount} />
      <SectionSkeleton titleClassName="w-24" count={projectCount} />
      <SectionSkeleton titleClassName="w-32" count={educationCount} />
      <SectionSkeleton titleClassName="w-20" count={skillCount} />
      <SectionSkeleton titleClassName="w-28" count={achievementCount} />
      <SectionSkeleton titleClassName="w-24" count={referenceCount} />
    </div>
  )
}
