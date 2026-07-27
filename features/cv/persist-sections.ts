import "server-only"

import { eq } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { db } from "@/db"
import {
  achievement,
  education,
  experience,
  project,
  reference,
  skill,
} from "@/db/schema"
import type { CvData } from "@/schemas/cv.schema"
import type { BatchItem } from "drizzle-orm/batch"

/**
 * Builds the delete-then-reinsert batch queries for a cv's child sections
 * (experiences/projects/education/skills/achievements/references) from a
 * full `CvData` payload.
 * Every child row always gets a freshly minted id here — client-supplied
 * item ids are UI-only (React keys / undo-stack identity) and never
 * persisted as the actual row id, so a full replace on every save is safe
 * and doesn't leak ids across saves.
 *
 * Shared by `features/cv/actions.ts`'s `saveDraft` (updating an existing
 * cv's sections) and `features/cv-import/actions.ts`'s
 * `createCvFromImport` (seeding a brand new cv's sections from a reviewed
 * AI extraction) — this is the ONE place that batch-upserts these four
 * tables; neither caller duplicates it.
 *
 * Deliberately NOT exported from `features/cv/actions.ts` itself: that
 * file has a top-level `"use server"` directive, and Next.js requires
 * every export of a `"use server"` module to be an async function — a
 * plain synchronous helper like this one fails the production build
 * ("Server Actions must be async functions") if it lives there. This
 * module has no directive, so it can export a plain function that both
 * `"use server"` files call internally.
 */
export function buildCvSectionQueries(
  cvId: string,
  data: CvData,
): BatchItem<"pg">[] {
  const queries: BatchItem<"pg">[] = [
    db.delete(experience).where(eq(experience.cvId, cvId)),
    db.delete(project).where(eq(project.cvId, cvId)),
    db.delete(education).where(eq(education.cvId, cvId)),
    db.delete(skill).where(eq(skill.cvId, cvId)),
    db.delete(achievement).where(eq(achievement.cvId, cvId)),
    db.delete(reference).where(eq(reference.cvId, cvId)),
  ]

  if (data.experiences.length > 0) {
    queries.push(
      db.insert(experience).values(
        data.experiences.map((e, index) => ({
          id: createId(),
          cvId,
          sortOrder: index,
          company: e.company ?? "",
          role: e.role ?? "",
          startDate: e.startDate ?? null,
          endDate: e.endDate ?? null,
          bullets: e.bullets ?? [],
        })),
      ),
    )
  }

  if (data.projects.length > 0) {
    queries.push(
      db.insert(project).values(
        data.projects.map((p, index) => ({
          id: createId(),
          cvId,
          sortOrder: index,
          name: p.name ?? "",
          description: p.description ?? null,
          url: p.url ?? null,
          bullets: p.bullets ?? [],
        })),
      ),
    )
  }

  if (data.education.length > 0) {
    queries.push(
      db.insert(education).values(
        data.education.map((ed, index) => ({
          id: createId(),
          cvId,
          sortOrder: index,
          institution: ed.institution ?? "",
          degree: ed.degree ?? "",
          startDate: ed.startDate ?? null,
          endDate: ed.endDate ?? null,
        })),
      ),
    )
  }

  if (data.skills.length > 0) {
    queries.push(
      db.insert(skill).values(
        data.skills.map((s, index) => ({
          id: createId(),
          cvId,
          sortOrder: index,
          name: s.name ?? "",
          category: s.category ?? null,
        })),
      ),
    )
  }

  if (data.achievements.length > 0) {
    queries.push(
      db.insert(achievement).values(
        data.achievements.map((a, index) => ({
          id: createId(),
          cvId,
          sortOrder: index,
          title: a.title ?? "",
          issuer: a.issuer ?? null,
          date: a.date ?? null,
          description: a.description ?? null,
        })),
      ),
    )
  }

  if (data.references.length > 0) {
    queries.push(
      db.insert(reference).values(
        data.references.map((r, index) => ({
          id: createId(),
          cvId,
          sortOrder: index,
          name: r.name ?? "",
          role: r.role ?? null,
          company: r.company ?? null,
          email: r.email ?? null,
          phone: r.phone ?? null,
        })),
      ),
    )
  }

  return queries
}
