import { cn } from "@/lib/utils"
import { CvEditorSkeleton } from "@/features/cv/cv-editor-skeleton"
import { DocumentSkeleton } from "@/features/render/cv-preview-skeleton"

// Same convention as `cv-editor-skeleton.tsx`'s `Bar` helper — kept as a
// local duplicate since that file's `Bar` is not exported (see
// `cv-preview-skeleton.tsx`'s identical note).
function Bar({ className }: { className?: string }) {
  return (
    <div className={cn("bg-muted h-4 animate-pulse rounded-md", className)} />
  )
}

function SidebarSkeleton() {
  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-2">
      <Bar className="mb-2 h-3 w-20" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Bar key={i} className={cn("h-7", i % 2 === 0 ? "w-full" : "w-4/5")} />
      ))}
    </nav>
  )
}

/**
 * Full 3-panel (sidebar | editor | preview) fallback for the `<Suspense>`
 * boundary in `app/(dashboard)/cv/layout.tsx`. Unlike a per-segment
 * `loading.tsx`, which only ever occupies one slot inside an already-
 * mounted `CvWorkspaceShell`, this boundary stands in for the ENTIRE shell
 * before any of it exists — so a full mockup is honest here, not a lie
 * about position. Static (no `react-resizable-panels`) since nothing is
 * interactive yet; widths mirror `CvWorkspaceShell`'s panel `defaultSize`s.
 */
export function CvWorkspaceShellSkeleton() {
  return (
    <div className="flex h-full w-full">
      <div className="h-full w-[22%] shrink-0 overflow-hidden border-r">
        <SidebarSkeleton />
      </div>
      <div className="h-full w-[43%] shrink-0 overflow-hidden">
        <CvEditorSkeleton />
      </div>
      <div className="h-full w-[35%] shrink-0 overflow-hidden border-l">
        <DocumentSkeleton
          experienceCount={2}
          projectCount={1}
          educationCount={1}
          skillCount={1}
          className="h-full"
        />
      </div>
    </div>
  )
}
