import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { asc, eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/db"
import {
  achievement,
  education,
  experience,
  project,
  reference,
  skill,
} from "@/db/schema"
import { DEFAULT_THEME, type CvData } from "@/schemas/cv.schema"
import { findOwnedCv } from "@/features/cv/ownership"
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

  const [experiences, projects, educations, skills, achievements, references] =
    await Promise.all([
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
        .where(eq(experience.cvId, id))
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
        .where(eq(project.cvId, id))
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
        .where(eq(education.cvId, id))
        .orderBy(asc(education.sortOrder)),
      db
        .select({
          id: skill.id,
          sortOrder: skill.sortOrder,
          name: skill.name,
          category: skill.category,
        })
        .from(skill)
        .where(eq(skill.cvId, id))
        .orderBy(asc(skill.sortOrder)),
      db
        .select({
          id: achievement.id,
          sortOrder: achievement.sortOrder,
          title: achievement.title,
          issuer: achievement.issuer,
          date: achievement.date,
          description: achievement.description,
        })
        .from(achievement)
        .where(eq(achievement.cvId, id))
        .orderBy(asc(achievement.sortOrder)),
      db
        .select({
          id: reference.id,
          sortOrder: reference.sortOrder,
          name: reference.name,
          role: reference.role,
          company: reference.company,
          email: reference.email,
          phone: reference.phone,
        })
        .from(reference)
        .where(eq(reference.cvId, id))
        .orderBy(asc(reference.sortOrder)),
    ])

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
    achievements: achievements.map((a) => ({
      id: a.id,
      title: a.title,
      issuer: a.issuer,
      date: a.date,
      description: a.description,
    })),
    references: references.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      company: r.company,
      email: r.email,
      phone: r.phone,
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
