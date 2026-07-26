import { Suspense } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { listUserCvs } from "@/features/cv/list"
import { CvWorkspaceShell } from "@/features/cv/workspace/cv-workspace-shell"
import { CvWorkspaceShellSkeleton } from "@/features/cv/workspace/cv-workspace-shell-skeleton"

/**
 * Persistent-sidebar shell for everything under `/cv/*` (currently just
 * `/cv/[id]/edit`). Fetches the CV list ONCE here, in the nested layout —
 * Next does not remount a layout on sibling-route navigation, so switching
 * between CVs from inside the editor keeps the sidebar mounted and does
 * NOT refetch the list. `/dashboard` (the top-level "your CVs" landing
 * page) is untouched structurally and stays a separate full-page route —
 * it and this layout's sidebar both read through the same
 * `listUserCvs` helper (dedup'd query, not a dedup'd fetch) so they can
 * never drift in shape. See `sdd/cv-editor-panel/design` Decision 1.
 *
 * This layout itself is synchronous — the `getSession()` + `listUserCvs()`
 * work lives in `CvWorkspaceData` below, behind its own inline `<Suspense>`.
 * An async layout's body has to fully resolve before React can produce ANY
 * tree to hang a Suspense boundary off of, so those awaits can't live
 * directly in this component without freezing the previous screen for
 * their duration — pushing them into a nested component wrapped HERE is
 * the only way to show `CvWorkspaceShellSkeleton` immediately instead.
 */
export default function CvWorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<CvWorkspaceShellSkeleton />}>
        <CvWorkspaceData>{children}</CvWorkspaceData>
      </Suspense>
    </div>
  )
}

async function CvWorkspaceData({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const cvs = await listUserCvs(session.user.id)

  return <CvWorkspaceShell cvs={cvs}>{children}</CvWorkspaceShell>
}
