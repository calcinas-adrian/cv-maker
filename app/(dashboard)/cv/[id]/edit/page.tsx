import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { DEFAULT_THEME } from "@/schemas/cv.schema"
import { findOwnedCv } from "@/features/cv/ownership"
import { getCvDraft } from "@/features/cv/actions"
import { CvEditor } from "@/features/cv/cv-editor"

/**
 * `updatedAt` (for the editor's optimistic-concurrency check) comes from
 * `findOwnedCv`'s own row — it is fetched separately from `getCvDraft`,
 * whose contracted `Result<CvData>` return type doesn't carry it.
 *
 * Previously this page duplicated `getCvDraft`'s read logic inline against
 * the old flat table names (`experience`, `project`, `education`, `skill`,
 * `achievement`, `reference`), which the `cv_experience`/`cv_bullet`/etc.
 * schema rewrite broke. It now calls `getCvDraft` directly instead of
 * re-duplicating that query — the extra `findOwnedCv` lookup inside
 * `getCvDraft` is a second round trip, not a second copy of the "which CVs
 * may this user see" rule.
 */
export default async function EditCvPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/login")
  }

  // The cv is resolved FIRST, on its own, through the same `findOwnedCv`
  // every server action uses. This used to be seven parallel queries that
  // each re-proved ownership inline via `cv.userId` (directly or through an
  // `innerJoin`). That was safe, but it meant seven copies of the rule for
  // "which CVs may this user see" — and once soft delete landed, seven
  // places that would each have to remember `isNull(cv.deletedAt)`. Missing
  // it in exactly one of them would keep rendering a deleted CV at a URL
  // whose id still resolves.
  //
  // The cost is one extra round trip before the children load, in exchange
  // for the rule living in exactly one function. Worth it: the children
  // below no longer need to join back to `cv` at all, since reaching this
  // point already proves the CV exists, is live, and belongs to the caller.
  const cvRow = await findOwnedCv(id, session.user.id)

  if (!cvRow) {
    notFound()
  }

  const draftResult = await getCvDraft(id)
  if (!draftResult.ok) {
    notFound()
  }

  const initialData = draftResult.data

  return (
    // Keying on `id` alone forces a clean unmount+remount of `CvEditor` on
    // every CV switch — required because `editor-store` is a module-level
    // singleton and the persistent `/cv/*` sidebar layout does not remount
    // on sibling-route navigation, so without this key the previous CV's
    // hydrated draft, autosave concurrency ref, and undo history would
    // otherwise leak into the newly opened CV (see
    // `sdd/cv-editor-panel/design` Decision 1 addendum). Also folding in
    // `updatedAt` reuses that same remount mechanism for the "Recargar"
    // button: `CvEditor`'s hydrate effect is mount-only (by design, so
    // ordinary re-renders never clobber in-progress edits), so a bare
    // `router.refresh()` would fetch fresh props server-side but never flow
    // into the client store unless the key actually changes. A refresh
    // that finds no real change to the row keeps the same key (no-op); one
    // that finds the row genuinely changed gets a new key and remounts.
    <CvEditor
      key={`${id}:${cvRow.updatedAt.toISOString()}`}
      cvId={id}
      initialData={initialData}
      initialUpdatedAt={cvRow.updatedAt.toISOString()}
      initialTheme={cvRow.theme ?? DEFAULT_THEME}
      initialTitle={cvRow.title}
    />
  )
}
