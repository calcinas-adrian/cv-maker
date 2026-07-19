import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { and, asc, eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/db"
import { cv, education, experience, project, skill } from "@/db/schema"
import type { CvData } from "@/schemas/cv.schema"
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
  const [cvRow] = await db
    .select()
    .from(cv)
    .where(and(eq(cv.id, id), eq(cv.userId, session.user.id)))
    .limit(1)

  if (!cvRow) {
    notFound()
  }

  const [experiences, projects, educations, skills] = await Promise.all([
    db
      .select()
      .from(experience)
      .where(eq(experience.cvId, id))
      .orderBy(asc(experience.sortOrder)),
    db
      .select()
      .from(project)
      .where(eq(project.cvId, id))
      .orderBy(asc(project.sortOrder)),
    db
      .select()
      .from(education)
      .where(eq(education.cvId, id))
      .orderBy(asc(education.sortOrder)),
    db
      .select()
      .from(skill)
      .where(eq(skill.cvId, id))
      .orderBy(asc(skill.sortOrder)),
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
  }

  return (
    <CvEditor
      cvId={id}
      initialData={initialData}
      initialUpdatedAt={cvRow.updatedAt.toISOString()}
    />
  )
}
