import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { listUserCvs } from "@/features/cv/list"
import { CvWorkspaceShell } from "@/features/cv/workspace/cv-workspace-shell"

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
 */
export default async function CvWorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const cvs = await listUserCvs(session.user.id)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CvWorkspaceShell cvs={cvs}>{children}</CvWorkspaceShell>
    </div>
  )
}
