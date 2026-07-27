"use server"

import { and, desc, eq, isNull } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { db } from "@/db"
import { careerMaterial } from "@/db/schema"
import {
  getSessionUserId,
  findOwnedMaterial,
} from "@/features/career-material/ownership"
import {
  listDerivedMaterial,
  type CorpusItem,
} from "@/features/cv-adapt/build-material-corpus"
import { careerMaterialInputSchema } from "@/schemas/career-material.schema"
import type { Result } from "@/lib/result"

export type CareerMaterialRow = typeof careerMaterial.$inferSelect

/**
 * One combined read so both `/career-material` groups ("Tu banco" and
 * "Derivado de tus CVs") always refresh together and stay consistent —
 * the derived group's dedup depends on the saved group, so fetching them
 * separately at different times could drift.
 */
export async function listMaterialPage(): Promise<
  Result<{ saved: CareerMaterialRow[]; derived: CorpusItem[] }>
> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const [saved, derived] = await Promise.all([
    db
      .select()
      .from(careerMaterial)
      .where(
        and(
          eq(careerMaterial.userId, userId),
          isNull(careerMaterial.deletedAt),
        ),
      )
      .orderBy(desc(careerMaterial.createdAt)),
    listDerivedMaterial(userId),
  ])

  return { ok: true, data: { saved, derived } }
}

export async function createCareerMaterial(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = careerMaterialInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de material inválidos",
      code: "invalid_input",
    }
  }

  const id = createId()
  await db.insert(careerMaterial).values({ id, userId, ...parsed.data })

  return { ok: true, data: { id } }
}

export async function updateCareerMaterial(
  id: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const owned = await findOwnedMaterial(id, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const parsed = careerMaterialInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de material inválidos",
      code: "invalid_input",
    }
  }

  // Drizzle has no `$onUpdate` on this table, so `updatedAt` is set
  // explicitly here rather than relying on a column default (which only
  // fires on insert).
  await db
    .update(careerMaterial)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(careerMaterial.id, id))

  return { ok: true, data: { id } }
}

/**
 * SOFT delete: stamps `deleted_at` instead of removing the row. The item
 * stops being listed and stops feeding the AI corpus immediately, but the
 * content survives and `scripts/restore.mjs` can bring it back by id.
 *
 * One visible consequence worth knowing: if this item was originally
 * promoted from a CV, its derived twin reappears in the "Derivado de tus
 * CVs" group on the next read. That falls out of `listDerivedMaterial`'s
 * dedup running against LIVE bank rows only, and it is the right behavior —
 * deleting your saved copy should not also hide the CV it came from.
 *
 * Reported as "No encontrado" rather than silently no-op'd if the id
 * doesn't resolve to an owned live row, same discipline as
 * `features/ai-providers/actions.ts`'s `deleteProviderKey` — so the UI can
 * distinguish "deleted" from "nothing happened".
 */
export async function deleteCareerMaterial(
  id: string,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const owned = await findOwnedMaterial(id, userId)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .update(careerMaterial)
    .set({ deletedAt: new Date() })
    .where(eq(careerMaterial.id, id))

  return { ok: true, data: { id } }
}

/**
 * Moves a derived (CV-sourced) item into the bank. The payload is just the
 * derived item's fields, validated by the same `careerMaterialInputSchema`
 * every other write in this file uses — no separate "promote" schema.
 *
 * Idempotent for free: once this insert lands, `listDerivedMaterial`'s
 * read-time dedup against the bank (`normalizeMaterial`) makes the derived
 * twin stop appearing on the next read. No flag to flip, no row to
 * reconcile.
 */
export async function promoteDerivedMaterial(
  input: unknown,
): Promise<Result<{ id: string }>> {
  return createCareerMaterial(input)
}
