import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { and, asc, eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/db"
import { cv, education, experience, project, skill } from "@/db/schema"
import { DEFAULT_THEME, type CvData } from "@/schemas/cv.schema"
import { CvEditor } from "@/features/cv/cv-editor"

/**
 * Reads directly via `db` rather than through the `getCvDraft` server
 * action: this page additionally needs the row's `updatedAt` for the
 * editor's optimistic-concurrency check, which `getCvDraft`'s contracted
 * `Result<CvData>` return type doesn't carry. `getCvDraft` still exists in
 * `features/cv/actions.ts` per spec and is used internally by
 * `saveVersion` to build snapshots.
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

  // cvId comes from the URL — never trust it alone, scope by userId too.
  // Each of the 5 queries below independently proves ownership (either via
  // `cv.userId` directly, or via an `innerJoin` back to `cv` for the child
  // tables), so none of them depends on call-order for its security — a
  // future reordering of this array can't accidentally leak an
  // unauthorized read.
  const [cvRows, experiences, projects, educations, skills] = await Promise.all(
    [
      db
        .select()
        .from(cv)
        .where(and(eq(cv.id, id), eq(cv.userId, session.user.id)))
        .limit(1),
      db
        .select({
          id: experience.id,
          sortOrder: experience.sortOrder,
          company: experience.company,
          role: experience.role,
          startDate: experience.startDate,
          endDate: experience.endDate,
          bullets: experience.bullets,
        })
        .from(experience)
        .innerJoin(cv, eq(cv.id, experience.cvId))
        .where(and(eq(experience.cvId, id), eq(cv.userId, session.user.id)))
        .orderBy(asc(experience.sortOrder)),
      db
        .select({
          id: project.id,
          sortOrder: project.sortOrder,
          name: project.name,
          description: project.description,
          url: project.url,
          bullets: project.bullets,
        })
        .from(project)
        .innerJoin(cv, eq(cv.id, project.cvId))
        .where(and(eq(project.cvId, id), eq(cv.userId, session.user.id)))
        .orderBy(asc(project.sortOrder)),
      db
        .select({
          id: education.id,
          sortOrder: education.sortOrder,
          institution: education.institution,
          degree: education.degree,
          startDate: education.startDate,
          endDate: education.endDate,
        })
        .from(education)
        .innerJoin(cv, eq(cv.id, education.cvId))
        .where(and(eq(education.cvId, id), eq(cv.userId, session.user.id)))
        .orderBy(asc(education.sortOrder)),
      db
        .select({
          id: skill.id,
          sortOrder: skill.sortOrder,
          name: skill.name,
          category: skill.category,
        })
        .from(skill)
        .innerJoin(cv, eq(cv.id, skill.cvId))
        .where(and(eq(skill.cvId, id), eq(cv.userId, session.user.id)))
        .orderBy(asc(skill.sortOrder)),
    ],
  )

  const [cvRow] = cvRows

  if (!cvRow) {
    notFound()
  }

  const initialData: CvData = {
    fullName: cvRow.fullName ?? undefined,
    email: cvRow.email ?? undefined,
    phone: cvRow.phone ?? undefined,
    location: cvRow.location ?? undefined,
    summary: cvRow.summary ?? undefined,
    experiences: experiences.map((e) => ({
      id: e.id,
      company: e.company,
      role: e.role,
      startDate: e.startDate,
      endDate: e.endDate,
      bullets: e.bullets,
    })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? undefined,
      url: p.url,
      bullets: p.bullets,
    })),
    education: educations.map((ed) => ({
      id: ed.id,
      institution: ed.institution,
      degree: ed.degree,
      startDate: ed.startDate,
      endDate: ed.endDate,
    })),
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
    })),
  }

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
    />
  )
}
