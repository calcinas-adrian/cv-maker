import { CvEditorSkeleton } from "@/features/cv/cv-editor-skeleton"

/**
 * Route-segment loading UI — Next auto-wraps the page in a `<Suspense>`
 * boundary with this as the fallback, so CV switches show immediate
 * feedback instead of freezing on the previous CV until the new one
 * resolves. This fallback only ever occupies the "editor" panel slot in
 * `CvWorkspaceShell`'s single flat resizable Group — the sidebar
 * (`CvListSidebar`) and preview (`TypstPreviewLazy`) live in the persistent
 * `cv/layout.tsx` above and stay mounted the whole time, so this mirrors
 * ONLY `CvEditor`'s own top-level shape in that slot: header bar + the
 * theme/toggle bar + the content skeleton.
 */
export default function EditCvLoading() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex items-center justify-between border-b p-4">
        <div className="bg-muted h-7 w-32 animate-pulse rounded-md" />
        <div className="flex items-center gap-3">
          <div className="bg-muted h-5 w-20 animate-pulse rounded-md" />
          <div className="bg-muted h-8 w-32 animate-pulse rounded-md" />
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
        <div className="bg-muted h-8 w-40 animate-pulse rounded-md" />
        <div className="bg-muted h-8 w-32 animate-pulse rounded-md" />
      </div>
      <CvEditorSkeleton />
    </div>
  )
}
