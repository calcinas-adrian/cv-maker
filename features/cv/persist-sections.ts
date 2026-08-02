import "server-only"

import { eq } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { db } from "@/db"
import {
  cvBullet,
  cvCredential,
  cvEducation,
  cvExperience,
  cvLanguage,
  cvProject,
  cvReference,
  cvSkill,
} from "@/db/schema"
import type { CvData } from "@/schemas/cv.schema"
import type { BatchItem } from "drizzle-orm/batch"

/**
 * The delete-then-reinsert batch queries for a cv's child sections
 * (experiences/projects/bullets/education/skills/credentials/languages/
 * references), phase-typed so statement ORDER survives `tsc`.
 *
 * `db.batch` on neon-http is Neon's single implicit transaction over one
 * HTTP round trip (`db.transaction` throws — see `features/cv/actions.ts`),
 * so partial failure inside one batch is not the risk. The real risk is
 * statement ORDER: Postgres FK checks are IMMEDIATE, so a `cv_bullet`
 * insert placed before its `cv_experience` insert aborts the whole save
 * with an FK violation, on every save, forever — and `tsc` is blind to
 * array order. This struct is deliberately NOT an array and NOT
 * spreadable: `flattenSectionBatch` below is the ONLY legal way back to a
 * `BatchItem[]`, so the ordering invariant is a compile-time property of
 * the type rather than a comment someone can silently violate by
 * reordering a spread.
 *
 * - `deletes` — wholesale section deletes. `cv_bullet` has no `cv_id`
 *   column (see `db/schema.ts`), so it is never deleted directly here; it
 *   is removed for free by `ON DELETE CASCADE` off the wholesale-deleted
 *   `cv_experience`/`cv_project` row.
 * - `parents` — `cv_experience`/`cv_project` inserts (whose ids the
 *   `children` below reference) plus every flat, childless section
 *   (education/skills/credentials/languages/references).
 * - `children` — `cv_bullet` inserts, referencing the experience/project
 *   ids minted while building `parents`.
 *
 * Every child row always gets a freshly minted id here — client-supplied
 * item ids (including bullet ids) are UI-only (React keys / undo-stack
 * identity) and never persisted as the actual row id, so a full replace on
 * every save is safe and doesn't leak ids across saves. Provenance for a
 * bullet rides on `sourceMaterialId`, which IS in the payload and IS
 * persisted — that's the one field this docstring's rule doesn't apply to.
 *
 * Shared by `features/cv/actions.ts`'s `saveDraft`, `features/cv-import/
 * actions.ts`'s `createCvFromImport`, `features/cv-adapt/actions.ts`'s
 * `createCvFromAdaptation`, and `features/cv-translate/actions.ts`'s
 * `createCvFromTranslation` — this is the ONE place that batch-upserts
 * these eight tables; no caller duplicates it.
 *
 * Deliberately NOT exported from `features/cv/actions.ts` itself: that
 * file has a top-level `"use server"` directive, and Next.js requires
 * every export of a `"use server"` module to be an async function — a
 * plain synchronous helper like this one fails the production build
 * ("Server Actions must be async functions") if it lives there. This
 * module has no directive, so it can export plain functions that both
 * `"use server"` files call internally.
 */
export type CvSectionBatch = {
  deletes: BatchItem<"pg">[]
  parents: BatchItem<"pg">[]
  children: BatchItem<"pg">[]
}

export function buildCvSectionQueries(
  cvId: string,
  data: CvData,
): CvSectionBatch {
  const deletes: BatchItem<"pg">[] = [
    db.delete(cvExperience).where(eq(cvExperience.cvId, cvId)),
    db.delete(cvProject).where(eq(cvProject.cvId, cvId)),
    db.delete(cvEducation).where(eq(cvEducation.cvId, cvId)),
    db.delete(cvSkill).where(eq(cvSkill.cvId, cvId)),
    db.delete(cvCredential).where(eq(cvCredential.cvId, cvId)),
    db.delete(cvLanguage).where(eq(cvLanguage.cvId, cvId)),
    db.delete(cvReference).where(eq(cvReference.cvId, cvId)),
  ]

  const parents: BatchItem<"pg">[] = []
  const children: BatchItem<"pg">[] = []

  // Experiences + their bullets. Experience ids are minted here, in JS,
  // before any statement runs — so the bullet rows below can reference
  // them even though the experience insert hasn't executed yet.
  const experienceRows = data.experiences.map((e, index) => ({
    id: createId(),
    cvId,
    sortOrder: index,
    company: e.company ?? "",
    role: e.role ?? "",
    startDate: e.startDate ?? null,
    endDate: e.endDate ?? null,
  }))

  const projectRows = data.projects.map((p, index) => ({
    id: createId(),
    cvId,
    sortOrder: index,
    name: p.name ?? "",
    description: p.description ?? null,
    url: p.url ?? null,
  }))

  if (experienceRows.length > 0) {
    parents.push(db.insert(cvExperience).values(experienceRows))
  }
  if (projectRows.length > 0) {
    parents.push(db.insert(cvProject).values(projectRows))
  }

  const bulletRows = [
    ...data.experiences.flatMap((e, experienceIndex) =>
      (e.bullets ?? []).map((b, bulletIndex) => ({
        id: createId(),
        experienceId: experienceRows[experienceIndex].id,
        projectId: null,
        sortOrder: bulletIndex,
        content: b.content,
        sourceMaterialId: b.sourceMaterialId ?? null,
      })),
    ),
    ...data.projects.flatMap((p, projectIndex) =>
      (p.bullets ?? []).map((b, bulletIndex) => ({
        id: createId(),
        experienceId: null,
        projectId: projectRows[projectIndex].id,
        sortOrder: bulletIndex,
        content: b.content,
        sourceMaterialId: b.sourceMaterialId ?? null,
      })),
    ),
  ]

  if (bulletRows.length > 0) {
    children.push(db.insert(cvBullet).values(bulletRows))
  }

  if (data.education.length > 0) {
    parents.push(
      db.insert(cvEducation).values(
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
    parents.push(
      db.insert(cvSkill).values(
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

  if (data.credentials.length > 0) {
    parents.push(
      db.insert(cvCredential).values(
        data.credentials.map((c, index) => ({
          id: createId(),
          cvId,
          sortOrder: index,
          // `cv_credential.kind` is NOT NULL at the DB level but optional on
          // the Zod contract (a half-filled row mid-edit); "certification"
          // is an arbitrary but harmless fallback, same spirit as the empty-
          // string fallbacks below for other required text columns.
          kind: c.kind ?? "certification",
          name: c.name ?? "",
          issuer: c.issuer ?? null,
          issuedAt: c.issuedAt ?? null,
          expiresAt: c.expiresAt ?? null,
          credentialId: c.credentialId ?? null,
          credentialUrl: c.credentialUrl ?? null,
          description: c.description ?? null,
        })),
      ),
    )
  }

  if (data.languages.length > 0) {
    parents.push(
      db.insert(cvLanguage).values(
        data.languages.map((l, index) => ({
          id: createId(),
          cvId,
          sortOrder: index,
          name: l.name ?? "",
          level: l.level ?? null,
        })),
      ),
    )
  }

  if (data.references.length > 0) {
    parents.push(
      db.insert(cvReference).values(
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

  return { deletes, parents, children }
}

/**
 * The ONLY way to turn a `CvSectionBatch` back into a flat `BatchItem[]`
 * for `db.batch`. Order is expressed once, here: deletes, then parents
 * (which mint the ids children reference), then children.
 */
export function flattenSectionBatch(batch: CvSectionBatch): BatchItem<"pg">[] {
  return [...batch.deletes, ...batch.parents, ...batch.children]
}
