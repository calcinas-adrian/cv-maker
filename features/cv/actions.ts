"use server"

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { db } from "@/db"
import {
  cv,
  cvVersion,
  education,
  experience,
  project,
  skill,
} from "@/db/schema"
import { cvDraftSchema, type CvData } from "@/schemas/cv.schema"
import { buildCvSectionQueries } from "@/features/cv/persist-sections"
import { getSessionUserId, findOwnedCv } from "@/features/cv/ownership"
import type { BatchItem } from "drizzle-orm/batch"
import type { Result } from "@/lib/result"

const MAX_AUTOMATIC_VERSIONS = 20

export async function createCv(title: string): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const id = createId()
  await db.insert(cv).values({ id, userId, title })

  return { ok: true, data: { id } }
}

/**
 * Reads the full CvData shape for a cv, verifying ownership first.
 *
 * Used internally by `saveVersion` to build a snapshot. The `/cv/[id]/edit`
 * RSC page does NOT call this — it needs the row's `updatedAt` too (for the
 * editor's optimistic-concurrency check), which this function's contracted
 * `Result<CvData>` return type doesn't carry, so the page queries `db`
 * directly instead (see that page's file for the full read).
 */
export async function getCvDraft(cvId: string): Promise<Result<CvData>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const owned = await findOwnedCv(cvId, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const [experiences, projects, educations, skills] = await Promise.all([
    db
      .select()
      .from(experience)
      .where(eq(experience.cvId, cvId))
      .orderBy(asc(experience.sortOrder)),
    db
      .select()
      .from(project)
      .where(eq(project.cvId, cvId))
      .orderBy(asc(project.sortOrder)),
    db
      .select()
      .from(education)
      .where(eq(education.cvId, cvId))
      .orderBy(asc(education.sortOrder)),
    db
      .select()
      .from(skill)
      .where(eq(skill.cvId, cvId))
      .orderBy(asc(skill.sortOrder)),
  ])

  return {
    ok: true,
    data: {
      fullName: owned.fullName ?? undefined,
      email: owned.email ?? undefined,
      phone: owned.phone ?? undefined,
      location: owned.location ?? undefined,
      summary: owned.summary ?? undefined,
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
    },
  }
}

export async function saveDraft(
  cvId: string,
  input: unknown,
  expectedUpdatedAt: string,
): Promise<Result<{ updatedAt: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const owned = await findOwnedCv(cvId, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const parsed = cvDraftSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos del borrador inválidos",
      code: "invalid_input",
    }
  }

  // Optimistic concurrency: reject stale writes instead of silently
  // overwriting newer data saved elsewhere (another tab, another device).
  if (owned.updatedAt.toISOString() !== expectedUpdatedAt) {
    return {
      ok: false,
      error: "Hay cambios más nuevos guardados; recargá la página.",
      code: "conflict",
    }
  }

  const data = parsed.data
  const now = new Date()

  // neon-http has no real transaction support (`db.transaction` throws),
  // so the atomic unit here is `db.batch`, which Neon executes as a single
  // implicit transaction over one HTTP round trip.
  const queries: BatchItem<"pg">[] = [
    db
      .update(cv)
      .set({
        fullName: data.fullName ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        location: data.location ?? null,
        summary: data.summary ?? null,
        updatedAt: now,
      })
      .where(eq(cv.id, cvId)),
    ...buildCvSectionQueries(cvId, data),
  ]

  await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]])

  return { ok: true, data: { updatedAt: now.toISOString() } }
}

export async function saveVersion(
  cvId: string,
  label: string | null,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const owned = await findOwnedCv(cvId, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const draft = await getCvDraft(cvId)
  if (!draft.ok) return draft

  const id = createId()
  await db.insert(cvVersion).values({
    id,
    cvId,
    label,
    snapshot: draft.data,
  })

  // Prune automatic snapshots beyond the most recent N, in the same
  // operation. Labeled versions are never pruned, regardless of age/count.
  const automaticVersions = await db
    .select({ id: cvVersion.id })
    .from(cvVersion)
    .where(and(eq(cvVersion.cvId, cvId), isNull(cvVersion.label)))
    .orderBy(desc(cvVersion.createdAt))

  const staleIds = automaticVersions
    .slice(MAX_AUTOMATIC_VERSIONS)
    .map((v) => v.id)

  if (staleIds.length > 0) {
    await db.delete(cvVersion).where(inArray(cvVersion.id, staleIds))
  }

  return { ok: true, data: { id } }
}

/**
 * Loads a version's snapshot so the CLIENT can re-hydrate the editable
 * draft with it. This never writes to the `cv` table directly — the user
 * reviews the restored draft and it autosaves like any other edit.
 */
export async function restoreVersion(
  cvId: string,
  versionId: string,
): Promise<Result<CvData>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const owned = await findOwnedCv(cvId, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const [versionRow] = await db
    .select()
    .from(cvVersion)
    .where(and(eq(cvVersion.id, versionId), eq(cvVersion.cvId, cvId)))
    .limit(1)

  if (!versionRow)
    return { ok: false, error: "Versión no encontrada", code: "not_found" }

  return { ok: true, data: versionRow.snapshot }
}

export type VersionSummary = {
  id: string
  label: string | null
  createdAt: string
}

export async function listVersions(
  cvId: string,
): Promise<Result<VersionSummary[]>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const owned = await findOwnedCv(cvId, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const rows = await db
    .select({
      id: cvVersion.id,
      label: cvVersion.label,
      createdAt: cvVersion.createdAt,
    })
    .from(cvVersion)
    .where(eq(cvVersion.cvId, cvId))
    .orderBy(desc(cvVersion.createdAt))

  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      label: r.label,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}
