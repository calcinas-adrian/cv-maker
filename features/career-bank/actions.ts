"use server"

import { and, asc, eq, isNull, ne } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { db } from "@/db"
import {
  bank,
  bankCredential,
  bankEducation,
  bankEngagement,
  bankLanguage,
  bankMaterial,
  bankMaterialVariant,
  bankSkill,
} from "@/db/schema"
import {
  bankCredentialInputSchema,
  bankEducationInputSchema,
  bankEngagementInputSchema,
  bankInputSchema,
  bankLanguageInputSchema,
  bankMaterialInputSchema,
  bankSkillInputSchema,
} from "@/schemas/bank.schema"
import {
  findOwnedCredential,
  findOwnedEducation,
  findOwnedEngagement,
  findOwnedLanguage,
  findOwnedMaterial,
  findOwnedSkill,
  findOwnedVariant,
  findPersonalBank,
  getOrCreatePersonalBank,
  getSessionUserId,
  type BankRow,
} from "@/features/career-bank/ownership"
import {
  buildBankMaterialQueries,
  buildNewMaterialWithDefaultVariant,
  buildNewVariantForMaterial,
  flattenBankImportBatch,
} from "@/features/career-bank/build-bank-queries"
import { computeSortOrderSwap } from "@/features/career-bank/reorder"
import type { BatchItem } from "drizzle-orm/batch"
import type { Result } from "@/lib/result"

/**
 * CRUD actions for the career bank — the successor to
 * `features/career-material/actions.ts`, covering `bank` itself plus its
 * seven `bank_*` children (see `sdd/career-bank-restructure/design`,
 * Decision 1). There is deliberately no "create bank" action: every action
 * below resolves the caller's ONE implicit personal bank via
 * `getOrCreatePersonalBank` first — see `architecture/bank-multiplicity-ui`.
 * No action ever accepts a `bankId` from the client; the resolved row's own
 * id is the only `bankId` ever written, which is what makes the ownership
 * invariant (`sdd/career-bank-restructure/spec`'s "Cross-user bank
 * assignment blocked") hold for every satellite table.
 */

export type BankEngagementRow = typeof bankEngagement.$inferSelect
export type BankMaterialRow = typeof bankMaterial.$inferSelect
export type BankMaterialVariantRow = typeof bankMaterialVariant.$inferSelect
export type BankEducationRow = typeof bankEducation.$inferSelect
export type BankCredentialRow = typeof bankCredential.$inferSelect
export type BankLanguageRow = typeof bankLanguage.$inferSelect
export type BankSkillRow = typeof bankSkill.$inferSelect

export type BankMaterialWithVariants = BankMaterialRow & {
  variants: BankMaterialVariantRow[]
}

export type BankPageData = {
  bank: BankRow
  engagements: BankEngagementRow[]
  materials: BankMaterialWithVariants[]
  education: BankEducationRow[]
  credentials: BankCredentialRow[]
  languages: BankLanguageRow[]
  skills: BankSkillRow[]
}

/**
 * One combined read for the whole bank editor screen — mirrors
 * `listMaterialPage`'s "one read, everything refreshes together" reasoning,
 * since the material list's variant grouping depends on both queries
 * finishing.
 */
export async function getBankPage(): Promise<Result<BankPageData>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)

  const [
    engagements,
    materials,
    variantRows,
    education,
    credentials,
    languages,
    skills,
  ] = await Promise.all([
    db
      .select()
      .from(bankEngagement)
      .where(
        and(
          eq(bankEngagement.bankId, bankRow.id),
          isNull(bankEngagement.deletedAt),
        ),
      )
      .orderBy(asc(bankEngagement.sortOrder)),
    db
      .select()
      .from(bankMaterial)
      .where(
        and(
          eq(bankMaterial.bankId, bankRow.id),
          isNull(bankMaterial.deletedAt),
        ),
      )
      .orderBy(asc(bankMaterial.sortOrder)),
    // Joined rather than a second round trip keyed off material ids: this
    // read only needs "every live variant of every live material in this
    // bank", which one join expresses directly.
    db
      .select({ variant: bankMaterialVariant })
      .from(bankMaterialVariant)
      .innerJoin(
        bankMaterial,
        eq(bankMaterialVariant.materialId, bankMaterial.id),
      )
      .where(
        and(
          eq(bankMaterial.bankId, bankRow.id),
          isNull(bankMaterialVariant.deletedAt),
        ),
      )
      .orderBy(asc(bankMaterialVariant.sortOrder)),
    db
      .select()
      .from(bankEducation)
      .where(
        and(
          eq(bankEducation.bankId, bankRow.id),
          isNull(bankEducation.deletedAt),
        ),
      )
      .orderBy(asc(bankEducation.sortOrder)),
    db
      .select()
      .from(bankCredential)
      .where(
        and(
          eq(bankCredential.bankId, bankRow.id),
          isNull(bankCredential.deletedAt),
        ),
      )
      .orderBy(asc(bankCredential.sortOrder)),
    db
      .select()
      .from(bankLanguage)
      .where(
        and(
          eq(bankLanguage.bankId, bankRow.id),
          isNull(bankLanguage.deletedAt),
        ),
      )
      .orderBy(asc(bankLanguage.sortOrder)),
    db
      .select()
      .from(bankSkill)
      .where(and(eq(bankSkill.bankId, bankRow.id), isNull(bankSkill.deletedAt)))
      .orderBy(asc(bankSkill.sortOrder)),
  ])

  const variantsByMaterialId = new Map<string, BankMaterialVariantRow[]>()
  for (const { variant } of variantRows) {
    const list = variantsByMaterialId.get(variant.materialId) ?? []
    list.push(variant)
    variantsByMaterialId.set(variant.materialId, list)
  }

  return {
    ok: true,
    data: {
      bank: bankRow,
      engagements,
      materials: materials.map((material) => ({
        ...material,
        variants: variantsByMaterialId.get(material.id) ?? [],
      })),
      education,
      credentials,
      languages,
      skills,
    },
  }
}

export async function updateBankProfile(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = bankInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos del banco inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)

  await db
    .update(bank)
    .set({
      name: parsed.data.name,
      fullName: parsed.data.fullName ?? null,
      headline: parsed.data.headline ?? null,
      location: parsed.data.location ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      linkedinUrl: parsed.data.linkedinUrl ?? null,
      websiteUrl: parsed.data.websiteUrl ?? null,
      githubUrl: parsed.data.githubUrl ?? null,
      updatedAt: new Date(),
    })
    .where(eq(bank.id, bankRow.id))

  return { ok: true, data: { id: bankRow.id } }
}

/**
 * Read-only check for the material-import destination picker (Decision 8):
 * "does this user have a live bank to write to", WITHOUT the create-on-miss
 * behavior `getOrCreatePersonalBank` has everywhere else in this file. Both
 * importers gate their "Banco" option on this before rendering it as
 * selectable — a file upload or a repo import must never silently mint a
 * bank the user never asked to create.
 */
export async function hasPersonalBank(): Promise<Result<{ hasBank: boolean }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const existing = await findPersonalBank(userId)
  return { ok: true, data: { hasBank: existing !== null } }
}

// ---------------------------------------------------------------------------
// CV bullet promotion ("Guardar en el banco" — Decision 6 / Phase 5)
// ---------------------------------------------------------------------------

const promoteBulletInputSchema = z.object({
  content: z.string().trim().min(3).max(2000),
  sourceMaterialId: z.string().nullable(),
})

/**
 * The one promotion path for "Guardar en el banco" on a CV bullet — both
 * `sdd/career-bank-restructure/spec`'s "Promote a CV bullet to a new
 * variant" and "Promote an unlinked CV bullet" scenarios, built on the SAME
 * `features/career-bank/build-bank-queries.ts` helpers the material-editor
 * UI and the (unwired) import destination picker already use, per the
 * design's explicit "do not write a second promotion path" instruction.
 *
 * Always returns the material id the bullet should stamp onto its own
 * `sourceMaterialId` — for the new-variant branch this is simply the SAME
 * id the caller already had, so the client can unconditionally overwrite
 * `sourceMaterialId` with the result on success, no branching needed there.
 */
export async function promoteBulletToBank(
  input: unknown,
): Promise<Result<{ materialId: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = promoteBulletInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de la viñeta inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)

  // Already linked to a LIVE material owned by this bank: add a new variant
  // under that SAME material (spec: "Promote a CV bullet to a new variant"),
  // never a new material.
  if (parsed.data.sourceMaterialId) {
    const owned = await findOwnedMaterial(
      parsed.data.sourceMaterialId,
      bankRow.id,
    )
    if (owned) {
      const siblings = await db
        .select({ id: bankMaterialVariant.id })
        .from(bankMaterialVariant)
        .where(
          and(
            eq(bankMaterialVariant.materialId, owned.id),
            isNull(bankMaterialVariant.deletedAt),
          ),
        )

      const built = buildNewVariantForMaterial({
        materialId: owned.id,
        sortOrder: siblings.length,
        content: parsed.data.content,
      })
      await built.statement

      return { ok: true, data: { materialId: owned.id } }
    }
    // A `sourceMaterialId` that no longer resolves to a LIVE, owned material
    // (its bank material was deleted, or it belongs to another user) falls
    // through to the unlinked-bullet path below rather than erroring — the
    // same dangling-pointer tolerance `cv_bullet.source_material_id` already
    // has everywhere else in this domain (no FK, by design).
  }

  // Unlinked (or now-dangling): mint a brand-new floating material — spec:
  // "Promote an unlinked CV bullet". `engagement: null` is the "Material
  // with no engagement" scenario, not a special case of this function.
  const { batch, materialIds } = await buildBankMaterialQueries({
    bankId: bankRow.id,
    engagement: null,
    bullets: [{ content: parsed.data.content }],
  })

  await db.batch(
    flattenBankImportBatch(batch) as [BatchItem<"pg">, ...BatchItem<"pg">[]],
  )

  return { ok: true, data: { materialId: materialIds[0] } }
}

// ---------------------------------------------------------------------------
// Engagements
// ---------------------------------------------------------------------------

export async function createEngagement(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = bankEngagementInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos del compromiso inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)
  const siblings = await db
    .select({ id: bankEngagement.id })
    .from(bankEngagement)
    .where(
      and(
        eq(bankEngagement.bankId, bankRow.id),
        isNull(bankEngagement.deletedAt),
      ),
    )

  const id = createId()
  await db.insert(bankEngagement).values({
    id,
    bankId: bankRow.id,
    sortOrder: siblings.length,
    kind: parsed.data.kind,
    organization: parsed.data.organization ?? null,
    role: parsed.data.role ?? null,
    name: parsed.data.name ?? null,
    startDate: parsed.data.startDate ?? null,
    endDate: parsed.data.endDate ?? null,
    url: parsed.data.url ?? null,
    description: parsed.data.description ?? null,
  })

  return { ok: true, data: { id } }
}

export async function updateEngagement(
  id: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = bankEngagementInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos del compromiso inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedEngagement(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .update(bankEngagement)
    .set({
      kind: parsed.data.kind,
      organization: parsed.data.organization ?? null,
      role: parsed.data.role ?? null,
      name: parsed.data.name ?? null,
      startDate: parsed.data.startDate ?? null,
      endDate: parsed.data.endDate ?? null,
      url: parsed.data.url ?? null,
      description: parsed.data.description ?? null,
      updatedAt: new Date(),
    })
    .where(eq(bankEngagement.id, id))

  return { ok: true, data: { id } }
}

/**
 * SOFT delete. `bank_material.engagement_id` is `onDelete: "set null"` at
 * the DB level, but that FK action only fires on a HARD delete — this is a
 * soft delete, so materials attached to this engagement keep their
 * `engagement_id` pointing at a now-dead row. That is intentional and
 * mirrors `cv_bullet.sourceMaterialId`'s dangling-pointer precedent: the
 * material still renders under "sin compromiso" grouping, and restoring the
 * engagement (`scripts/restore.mjs`) makes the link live again for free.
 */
export async function deleteEngagement(
  id: string,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedEngagement(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .update(bankEngagement)
    .set({ deletedAt: new Date() })
    .where(eq(bankEngagement.id, id))

  return { ok: true, data: { id } }
}

export async function duplicateEngagement(
  id: string,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedEngagement(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const siblings = await db
    .select({ id: bankEngagement.id })
    .from(bankEngagement)
    .where(
      and(
        eq(bankEngagement.bankId, bankRow.id),
        isNull(bankEngagement.deletedAt),
      ),
    )

  const newId = createId()
  await db.insert(bankEngagement).values({
    id: newId,
    bankId: bankRow.id,
    sortOrder: siblings.length,
    kind: owned.kind,
    organization: owned.organization,
    role: owned.role,
    name: owned.name,
    startDate: owned.startDate,
    endDate: owned.endDate,
    url: owned.url,
    description: owned.description,
  })

  return { ok: true, data: { id: newId } }
}

export async function moveEngagement(
  id: string,
  direction: "up" | "down",
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const siblings = await db
    .select({ id: bankEngagement.id, sortOrder: bankEngagement.sortOrder })
    .from(bankEngagement)
    .where(
      and(
        eq(bankEngagement.bankId, bankRow.id),
        isNull(bankEngagement.deletedAt),
      ),
    )

  const swap = computeSortOrderSwap(siblings, id, direction)
  if (!swap)
    return { ok: false, error: "No se puede mover", code: "invalid_input" }

  const [a, b] = swap
  await db.batch([
    db
      .update(bankEngagement)
      .set({ sortOrder: a.sortOrder })
      .where(eq(bankEngagement.id, a.id)),
    db
      .update(bankEngagement)
      .set({ sortOrder: b.sortOrder })
      .where(eq(bankEngagement.id, b.id)),
  ] as [BatchItem<"pg">, ...BatchItem<"pg">[]])

  return { ok: true, data: { id } }
}

// ---------------------------------------------------------------------------
// Materials + variants
// ---------------------------------------------------------------------------

/**
 * Creates a `bank_material` together with its first (or only)
 * `bank_material_variant` — see `schemas/bank.schema.ts`'s docstring on
 * `bankMaterialInputSchema`. Built on `buildNewMaterialWithDefaultVariant`
 * (`features/career-bank/build-bank-queries.ts`), the same helper the
 * (not-yet-wired) import destination picker and bullet-promotion flows will
 * use — one place mints the material+variant shape.
 */
export async function createMaterial(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = bankMaterialInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos del material inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)

  if (parsed.data.engagementId) {
    const ownedEngagement = await findOwnedEngagement(
      parsed.data.engagementId,
      bankRow.id,
    )
    if (!ownedEngagement) {
      return { ok: false, error: "Compromiso no encontrado", code: "not_found" }
    }
  }

  const siblings = await db
    .select({ id: bankMaterial.id })
    .from(bankMaterial)
    .where(
      and(eq(bankMaterial.bankId, bankRow.id), isNull(bankMaterial.deletedAt)),
    )

  const built = buildNewMaterialWithDefaultVariant({
    bankId: bankRow.id,
    engagementId: parsed.data.engagementId,
    kind: parsed.data.kind,
    sortOrder: siblings.length,
    techTags: parsed.data.techTags,
    skillTags: parsed.data.skillTags,
    content: parsed.data.content,
  })

  await db.batch([built.materialStatement, built.variantStatement] as [
    BatchItem<"pg">,
    ...BatchItem<"pg">[],
  ])

  return { ok: true, data: { id: built.materialId } }
}

/**
 * Updates the material's own fields (engagement, kind, tags) AND the
 * currently-default variant's content — the common case of a material with
 * exactly one wording. Adding a genuinely alternate wording goes through
 * `addMaterialVariant` instead, which never touches the material row.
 */
export async function updateMaterial(
  id: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = bankMaterialInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos del material inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedMaterial(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  if (parsed.data.engagementId) {
    const ownedEngagement = await findOwnedEngagement(
      parsed.data.engagementId,
      bankRow.id,
    )
    if (!ownedEngagement) {
      return { ok: false, error: "Compromiso no encontrado", code: "not_found" }
    }
  }

  await db
    .update(bankMaterial)
    .set({
      engagementId: parsed.data.engagementId,
      kind: parsed.data.kind,
      techTags: parsed.data.techTags,
      skillTags: parsed.data.skillTags,
      updatedAt: new Date(),
    })
    .where(eq(bankMaterial.id, id))

  const [defaultVariant] = await db
    .select()
    .from(bankMaterialVariant)
    .where(
      and(
        eq(bankMaterialVariant.materialId, id),
        eq(bankMaterialVariant.isDefault, true),
        isNull(bankMaterialVariant.deletedAt),
      ),
    )
    .limit(1)

  if (defaultVariant) {
    await db
      .update(bankMaterialVariant)
      .set({ content: parsed.data.content, updatedAt: new Date() })
      .where(eq(bankMaterialVariant.id, defaultVariant.id))
  }

  return { ok: true, data: { id } }
}

/**
 * SOFT delete. Deliberately does NOT cascade a soft-delete to this
 * material's variants: `build-material-corpus.ts`'s three-level filter
 * (bank/material/variant, Decision 4) already excludes a dead material's
 * variants from the corpus regardless of the variants' own `deleted_at`, so
 * leaving them live costs nothing and keeps restore trivial (undeleting the
 * material brings every variant back exactly as it was, with no
 * variant-level bookkeeping to reverse).
 */
export async function deleteMaterial(
  id: string,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedMaterial(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .update(bankMaterial)
    .set({ deletedAt: new Date() })
    .where(eq(bankMaterial.id, id))

  return { ok: true, data: { id } }
}

const variantContentSchema = z.object({
  content: z.string().trim().min(3).max(2000),
  label: z.string().max(200).nullable().optional(),
})

/**
 * Adds an alternate wording to an EXISTING material — spec: "Promote a CV
 * bullet to a new variant". Never marked default; use `setDefaultVariant`
 * to promote one.
 */
export async function addMaterialVariant(
  materialId: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = variantContentSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de la variante inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)
  const ownedMaterial = await findOwnedMaterial(materialId, bankRow.id)
  if (!ownedMaterial)
    return { ok: false, error: "No encontrado", code: "not_found" }

  const siblings = await db
    .select({ id: bankMaterialVariant.id })
    .from(bankMaterialVariant)
    .where(
      and(
        eq(bankMaterialVariant.materialId, materialId),
        isNull(bankMaterialVariant.deletedAt),
      ),
    )

  const id = createId()
  await db.insert(bankMaterialVariant).values({
    id,
    materialId,
    sortOrder: siblings.length,
    label: parsed.data.label ?? null,
    content: parsed.data.content,
    isDefault: false,
  })

  return { ok: true, data: { id } }
}

export async function updateVariant(
  id: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = variantContentSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de la variante inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedVariant(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .update(bankMaterialVariant)
    .set({
      content: parsed.data.content,
      label: parsed.data.label ?? null,
      updatedAt: new Date(),
    })
    .where(eq(bankMaterialVariant.id, id))

  return { ok: true, data: { id } }
}

/**
 * SOFT delete. If the deleted variant was the default, promotes the
 * lowest-`sort_order` remaining LIVE variant to default, so "exactly one
 * live default variant per material" (enforced app-side, see
 * `db/schema.ts`) never silently drops to zero while other wordings still
 * exist. If none remain, the material simply has no default — the corpus
 * builder already tolerates that (Decision 4) and this UI shows an empty
 * default slot until one is added.
 */
export async function deleteVariant(
  id: string,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedVariant(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .update(bankMaterialVariant)
    .set({ deletedAt: new Date() })
    .where(eq(bankMaterialVariant.id, id))

  if (owned.isDefault) {
    const [nextDefault] = await db
      .select()
      .from(bankMaterialVariant)
      .where(
        and(
          eq(bankMaterialVariant.materialId, owned.materialId),
          isNull(bankMaterialVariant.deletedAt),
          ne(bankMaterialVariant.id, id),
        ),
      )
      .orderBy(asc(bankMaterialVariant.sortOrder))
      .limit(1)

    if (nextDefault) {
      await db
        .update(bankMaterialVariant)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(bankMaterialVariant.id, nextDefault.id))
    }
  }

  return { ok: true, data: { id } }
}

/**
 * "Exactly one default variant per material" enforced app-side (read
 * every live sibling, unset, set the chosen one) rather than by a partial
 * unique index — see `db/schema.ts`'s note on `bank_material_variant` and
 * `architecture/deletion-policy` trap 2.
 */
export async function setDefaultVariant(
  id: string,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedVariant(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db.batch([
    db
      .update(bankMaterialVariant)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(bankMaterialVariant.materialId, owned.materialId),
          ne(bankMaterialVariant.id, id),
        ),
      ),
    db
      .update(bankMaterialVariant)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(bankMaterialVariant.id, id)),
  ] as [BatchItem<"pg">, ...BatchItem<"pg">[]])

  return { ok: true, data: { id } }
}

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------

export async function createEducation(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = bankEducationInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de educación inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)
  const siblings = await db
    .select({ id: bankEducation.id })
    .from(bankEducation)
    .where(
      and(
        eq(bankEducation.bankId, bankRow.id),
        isNull(bankEducation.deletedAt),
      ),
    )

  const id = createId()
  await db.insert(bankEducation).values({
    id,
    bankId: bankRow.id,
    sortOrder: siblings.length,
    institution: parsed.data.institution,
    degree: parsed.data.degree,
    startDate: parsed.data.startDate ?? null,
    endDate: parsed.data.endDate ?? null,
  })

  return { ok: true, data: { id } }
}

export async function updateEducation(
  id: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = bankEducationInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de educación inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedEducation(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .update(bankEducation)
    .set({
      institution: parsed.data.institution,
      degree: parsed.data.degree,
      startDate: parsed.data.startDate ?? null,
      endDate: parsed.data.endDate ?? null,
      updatedAt: new Date(),
    })
    .where(eq(bankEducation.id, id))

  return { ok: true, data: { id } }
}

export async function deleteEducation(
  id: string,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedEducation(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .update(bankEducation)
    .set({ deletedAt: new Date() })
    .where(eq(bankEducation.id, id))

  return { ok: true, data: { id } }
}

export async function duplicateEducation(
  id: string,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedEducation(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const siblings = await db
    .select({ id: bankEducation.id })
    .from(bankEducation)
    .where(
      and(
        eq(bankEducation.bankId, bankRow.id),
        isNull(bankEducation.deletedAt),
      ),
    )

  const newId = createId()
  await db.insert(bankEducation).values({
    id: newId,
    bankId: bankRow.id,
    sortOrder: siblings.length,
    institution: owned.institution,
    degree: owned.degree,
    startDate: owned.startDate,
    endDate: owned.endDate,
  })

  return { ok: true, data: { id: newId } }
}

export async function moveEducation(
  id: string,
  direction: "up" | "down",
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const siblings = await db
    .select({ id: bankEducation.id, sortOrder: bankEducation.sortOrder })
    .from(bankEducation)
    .where(
      and(
        eq(bankEducation.bankId, bankRow.id),
        isNull(bankEducation.deletedAt),
      ),
    )

  const swap = computeSortOrderSwap(siblings, id, direction)
  if (!swap)
    return { ok: false, error: "No se puede mover", code: "invalid_input" }

  const [a, b] = swap
  await db.batch([
    db
      .update(bankEducation)
      .set({ sortOrder: a.sortOrder })
      .where(eq(bankEducation.id, a.id)),
    db
      .update(bankEducation)
      .set({ sortOrder: b.sortOrder })
      .where(eq(bankEducation.id, b.id)),
  ] as [BatchItem<"pg">, ...BatchItem<"pg">[]])

  return { ok: true, data: { id } }
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export async function createCredential(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = bankCredentialInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de la credencial inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)
  const siblings = await db
    .select({ id: bankCredential.id })
    .from(bankCredential)
    .where(
      and(
        eq(bankCredential.bankId, bankRow.id),
        isNull(bankCredential.deletedAt),
      ),
    )

  const id = createId()
  await db.insert(bankCredential).values({
    id,
    bankId: bankRow.id,
    sortOrder: siblings.length,
    kind: parsed.data.kind,
    name: parsed.data.name,
    issuer: parsed.data.issuer ?? null,
    issuedAt: parsed.data.issuedAt ?? null,
    expiresAt: parsed.data.expiresAt ?? null,
    credentialId: parsed.data.credentialId ?? null,
    credentialUrl: parsed.data.credentialUrl ?? null,
    description: parsed.data.description ?? null,
  })

  return { ok: true, data: { id } }
}

export async function updateCredential(
  id: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = bankCredentialInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de la credencial inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedCredential(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .update(bankCredential)
    .set({
      kind: parsed.data.kind,
      name: parsed.data.name,
      issuer: parsed.data.issuer ?? null,
      issuedAt: parsed.data.issuedAt ?? null,
      expiresAt: parsed.data.expiresAt ?? null,
      credentialId: parsed.data.credentialId ?? null,
      credentialUrl: parsed.data.credentialUrl ?? null,
      description: parsed.data.description ?? null,
      updatedAt: new Date(),
    })
    .where(eq(bankCredential.id, id))

  return { ok: true, data: { id } }
}

export async function deleteCredential(
  id: string,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedCredential(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .update(bankCredential)
    .set({ deletedAt: new Date() })
    .where(eq(bankCredential.id, id))

  return { ok: true, data: { id } }
}

export async function duplicateCredential(
  id: string,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedCredential(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const siblings = await db
    .select({ id: bankCredential.id })
    .from(bankCredential)
    .where(
      and(
        eq(bankCredential.bankId, bankRow.id),
        isNull(bankCredential.deletedAt),
      ),
    )

  const newId = createId()
  await db.insert(bankCredential).values({
    id: newId,
    bankId: bankRow.id,
    sortOrder: siblings.length,
    kind: owned.kind,
    name: owned.name,
    issuer: owned.issuer,
    issuedAt: owned.issuedAt,
    expiresAt: owned.expiresAt,
    credentialId: owned.credentialId,
    credentialUrl: owned.credentialUrl,
    description: owned.description,
  })

  return { ok: true, data: { id: newId } }
}

export async function moveCredential(
  id: string,
  direction: "up" | "down",
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const siblings = await db
    .select({ id: bankCredential.id, sortOrder: bankCredential.sortOrder })
    .from(bankCredential)
    .where(
      and(
        eq(bankCredential.bankId, bankRow.id),
        isNull(bankCredential.deletedAt),
      ),
    )

  const swap = computeSortOrderSwap(siblings, id, direction)
  if (!swap)
    return { ok: false, error: "No se puede mover", code: "invalid_input" }

  const [a, b] = swap
  await db.batch([
    db
      .update(bankCredential)
      .set({ sortOrder: a.sortOrder })
      .where(eq(bankCredential.id, a.id)),
    db
      .update(bankCredential)
      .set({ sortOrder: b.sortOrder })
      .where(eq(bankCredential.id, b.id)),
  ] as [BatchItem<"pg">, ...BatchItem<"pg">[]])

  return { ok: true, data: { id } }
}

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

export async function createLanguage(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = bankLanguageInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos del idioma inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)
  const siblings = await db
    .select({ id: bankLanguage.id })
    .from(bankLanguage)
    .where(
      and(eq(bankLanguage.bankId, bankRow.id), isNull(bankLanguage.deletedAt)),
    )

  const id = createId()
  await db.insert(bankLanguage).values({
    id,
    bankId: bankRow.id,
    sortOrder: siblings.length,
    name: parsed.data.name,
    level: parsed.data.level ?? null,
  })

  return { ok: true, data: { id } }
}

export async function updateLanguage(
  id: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = bankLanguageInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos del idioma inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedLanguage(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .update(bankLanguage)
    .set({
      name: parsed.data.name,
      level: parsed.data.level ?? null,
      updatedAt: new Date(),
    })
    .where(eq(bankLanguage.id, id))

  return { ok: true, data: { id } }
}

export async function deleteLanguage(
  id: string,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedLanguage(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .update(bankLanguage)
    .set({ deletedAt: new Date() })
    .where(eq(bankLanguage.id, id))

  return { ok: true, data: { id } }
}

export async function duplicateLanguage(
  id: string,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedLanguage(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const siblings = await db
    .select({ id: bankLanguage.id })
    .from(bankLanguage)
    .where(
      and(eq(bankLanguage.bankId, bankRow.id), isNull(bankLanguage.deletedAt)),
    )

  const newId = createId()
  await db.insert(bankLanguage).values({
    id: newId,
    bankId: bankRow.id,
    sortOrder: siblings.length,
    name: owned.name,
    level: owned.level,
  })

  return { ok: true, data: { id: newId } }
}

export async function moveLanguage(
  id: string,
  direction: "up" | "down",
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const siblings = await db
    .select({ id: bankLanguage.id, sortOrder: bankLanguage.sortOrder })
    .from(bankLanguage)
    .where(
      and(eq(bankLanguage.bankId, bankRow.id), isNull(bankLanguage.deletedAt)),
    )

  const swap = computeSortOrderSwap(siblings, id, direction)
  if (!swap)
    return { ok: false, error: "No se puede mover", code: "invalid_input" }

  const [a, b] = swap
  await db.batch([
    db
      .update(bankLanguage)
      .set({ sortOrder: a.sortOrder })
      .where(eq(bankLanguage.id, a.id)),
    db
      .update(bankLanguage)
      .set({ sortOrder: b.sortOrder })
      .where(eq(bankLanguage.id, b.id)),
  ] as [BatchItem<"pg">, ...BatchItem<"pg">[]])

  return { ok: true, data: { id } }
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export async function createSkill(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = bankSkillInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de la habilidad inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)
  const siblings = await db
    .select({ id: bankSkill.id })
    .from(bankSkill)
    .where(and(eq(bankSkill.bankId, bankRow.id), isNull(bankSkill.deletedAt)))

  const id = createId()
  await db.insert(bankSkill).values({
    id,
    bankId: bankRow.id,
    sortOrder: siblings.length,
    name: parsed.data.name,
    category: parsed.data.category ?? null,
  })

  return { ok: true, data: { id } }
}

export async function updateSkill(
  id: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = bankSkillInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Datos de la habilidad inválidos",
      code: "invalid_input",
    }
  }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedSkill(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .update(bankSkill)
    .set({
      name: parsed.data.name,
      category: parsed.data.category ?? null,
      updatedAt: new Date(),
    })
    .where(eq(bankSkill.id, id))

  return { ok: true, data: { id } }
}

export async function deleteSkill(id: string): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedSkill(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  await db
    .update(bankSkill)
    .set({ deletedAt: new Date() })
    .where(eq(bankSkill.id, id))

  return { ok: true, data: { id } }
}

export async function duplicateSkill(
  id: string,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const owned = await findOwnedSkill(id, bankRow.id)
  if (!owned) return { ok: false, error: "No encontrado", code: "not_found" }

  const siblings = await db
    .select({ id: bankSkill.id })
    .from(bankSkill)
    .where(and(eq(bankSkill.bankId, bankRow.id), isNull(bankSkill.deletedAt)))

  const newId = createId()
  await db.insert(bankSkill).values({
    id: newId,
    bankId: bankRow.id,
    sortOrder: siblings.length,
    name: owned.name,
    category: owned.category,
  })

  return { ok: true, data: { id: newId } }
}

export async function moveSkill(
  id: string,
  direction: "up" | "down",
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const bankRow = await getOrCreatePersonalBank(userId)
  const siblings = await db
    .select({ id: bankSkill.id, sortOrder: bankSkill.sortOrder })
    .from(bankSkill)
    .where(and(eq(bankSkill.bankId, bankRow.id), isNull(bankSkill.deletedAt)))

  const swap = computeSortOrderSwap(siblings, id, direction)
  if (!swap)
    return { ok: false, error: "No se puede mover", code: "invalid_input" }

  const [a, b] = swap
  await db.batch([
    db
      .update(bankSkill)
      .set({ sortOrder: a.sortOrder })
      .where(eq(bankSkill.id, a.id)),
    db
      .update(bankSkill)
      .set({ sortOrder: b.sortOrder })
      .where(eq(bankSkill.id, b.id)),
  ] as [BatchItem<"pg">, ...BatchItem<"pg">[]])

  return { ok: true, data: { id } }
}
