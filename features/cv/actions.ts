"use server"

import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { db } from "@/db"
import {
  cv,
  cvBullet,
  cvCredential,
  cvEducation,
  cvExperience,
  cvLanguage,
  cvProject,
  cvReference,
  cvSkill,
  cvVersion,
} from "@/db/schema"
import {
  cvDraftSchema,
  type CvData,
  type CredentialKind,
} from "@/schemas/cv.schema"
import {
  buildCvSectionQueries,
  flattenSectionBatch,
} from "@/features/cv/persist-sections"
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
 * Renames a CV — deliberately does NOT touch `cv.updatedAt`, same reasoning
 * as `saveTheme` (see `features/cv/theme/actions.ts`): a title change is
 * metadata, not a content edit, so it must never conflict with `saveDraft`'s
 * optimistic-concurrency check on content.
 */
export async function renameCv(
  cvId: string,
  title: string,
): Promise<Result<{ title: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const owned = await findOwnedCv(cvId, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const trimmed = title.trim()
  if (!trimmed) {
    return {
      ok: false,
      error: "El título no puede estar vacío",
      code: "invalid_input",
    }
  }

  await db.update(cv).set({ title: trimmed }).where(eq(cv.id, cvId))

  return { ok: true, data: { title: trimmed } }
}

/**
 * SOFT-deletes a CV: stamps `cv.deleted_at` and touches nothing else.
 *
 * Every child table, every `cv_version` snapshot and every `adaptation`
 * row is left exactly as it is. That is the whole design — because nothing
 * is destroyed, recovery is a single `UPDATE ... SET deleted_at = NULL`
 * (see `scripts/restore.mjs`) and the CV comes back with its sections,
 * history and provenance intact. There is deliberately no trash UI: this
 * app's recovery path is the owner running that script on request.
 *
 * `adaptation.cvId` is `onDelete: "cascade"` — since the bank restructure,
 * `adaptation` has no `sourceCvId` to preserve (it reads only the bank, not
 * sibling CVs — see `db/schema.ts`'s note on `adaptation`), so soft delete
 * here has no cross-adaptation side effect left to worry about; the only
 * remaining concern is `adaptation.bankId`'s `set null`, unrelated to `cv`
 * deletion.
 *
 * `updatedAt` is deliberately not touched, same reasoning as `renameCv`:
 * deleting is not a content edit and must not collide with `saveDraft`'s
 * optimistic-concurrency check.
 */
export async function deleteCv(cvId: string): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  // `findOwnedCv` already excludes soft-deleted rows, so deleting the same
  // CV twice reports "No encontrado" rather than silently re-stamping a
  // newer `deleted_at` over the original deletion time.
  const owned = await findOwnedCv(cvId, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db.update(cv).set({ deletedAt: new Date() }).where(eq(cv.id, cvId))

  return { ok: true, data: { id: cvId } }
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

  const [
    experiences,
    projects,
    educations,
    skills,
    credentials,
    languages,
    references,
  ] = await Promise.all([
    db
      .select()
      .from(cvExperience)
      .where(eq(cvExperience.cvId, cvId))
      .orderBy(asc(cvExperience.sortOrder)),
    db
      .select()
      .from(cvProject)
      .where(eq(cvProject.cvId, cvId))
      .orderBy(asc(cvProject.sortOrder)),
    db
      .select()
      .from(cvEducation)
      .where(eq(cvEducation.cvId, cvId))
      .orderBy(asc(cvEducation.sortOrder)),
    db
      .select()
      .from(cvSkill)
      .where(eq(cvSkill.cvId, cvId))
      .orderBy(asc(cvSkill.sortOrder)),
    db
      .select()
      .from(cvCredential)
      .where(eq(cvCredential.cvId, cvId))
      .orderBy(asc(cvCredential.sortOrder)),
    db
      .select()
      .from(cvLanguage)
      .where(eq(cvLanguage.cvId, cvId))
      .orderBy(asc(cvLanguage.sortOrder)),
    db
      .select()
      .from(cvReference)
      .where(eq(cvReference.cvId, cvId))
      .orderBy(asc(cvReference.sortOrder)),
  ])

  // `cv_bullet` has no `cv_id` column (see `db/schema.ts`), so its rows are
  // reached through the parent experience/project ids fetched above, not
  // through `cvId` directly. Skip the query entirely when there are no
  // parents to match — an empty `inArray(...)` is a needless round trip.
  const experienceIds = experiences.map((e) => e.id)
  const projectIds = projects.map((p) => p.id)
  const bulletParentConditions = [
    ...(experienceIds.length > 0
      ? [inArray(cvBullet.experienceId, experienceIds)]
      : []),
    ...(projectIds.length > 0 ? [inArray(cvBullet.projectId, projectIds)] : []),
  ]
  const bullets =
    bulletParentConditions.length > 0
      ? await db
          .select()
          .from(cvBullet)
          .where(or(...bulletParentConditions))
          .orderBy(asc(cvBullet.sortOrder))
      : []

  const bulletsByExperienceId = new Map<string, typeof bullets>()
  const bulletsByProjectId = new Map<string, typeof bullets>()
  for (const b of bullets) {
    if (b.experienceId) {
      const list = bulletsByExperienceId.get(b.experienceId) ?? []
      list.push(b)
      bulletsByExperienceId.set(b.experienceId, list)
    } else if (b.projectId) {
      const list = bulletsByProjectId.get(b.projectId) ?? []
      list.push(b)
      bulletsByProjectId.set(b.projectId, list)
    }
  }

  return {
    ok: true,
    data: {
      fullName: owned.fullName ?? undefined,
      email: owned.email ?? undefined,
      phone: owned.phone ?? undefined,
      location: owned.location ?? undefined,
      linkedinUrl: owned.linkedinUrl ?? undefined,
      websiteUrl: owned.websiteUrl ?? undefined,
      summary: owned.summary ?? undefined,
      experiences: experiences.map((e) => ({
        id: e.id,
        company: e.company,
        role: e.role,
        startDate: e.startDate,
        endDate: e.endDate,
        bullets: (bulletsByExperienceId.get(e.id) ?? []).map((b) => ({
          id: b.id,
          content: b.content,
          sourceMaterialId: b.sourceMaterialId,
        })),
      })),
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? undefined,
        url: p.url,
        bullets: (bulletsByProjectId.get(p.id) ?? []).map((b) => ({
          id: b.id,
          content: b.content,
          sourceMaterialId: b.sourceMaterialId,
        })),
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
      credentials: credentials.map((c) => ({
        id: c.id,
        kind: c.kind as CredentialKind,
        name: c.name,
        issuer: c.issuer,
        issuedAt: c.issuedAt,
        expiresAt: c.expiresAt,
        credentialId: c.credentialId,
        credentialUrl: c.credentialUrl,
        description: c.description,
      })),
      languages: languages.map((l) => ({
        id: l.id,
        name: l.name,
        level: l.level,
      })),
      references: references.map((r) => ({
        id: r.id,
        name: r.name,
        role: r.role,
        company: r.company,
        email: r.email,
        phone: r.phone,
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
        linkedinUrl: data.linkedinUrl ?? null,
        websiteUrl: data.websiteUrl ?? null,
        summary: data.summary ?? null,
        updatedAt: now,
      })
      .where(eq(cv.id, cvId)),
    ...flattenSectionBatch(buildCvSectionQueries(cvId, data)),
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
