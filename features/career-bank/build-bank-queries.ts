import "server-only"

import { and, eq, isNull } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { db } from "@/db"
import { bankEngagement, bankMaterial, bankMaterialVariant } from "@/db/schema"
import type { BankMaterialKind } from "@/schemas/bank.schema"
import type { BatchItem } from "drizzle-orm/batch"

/**
 * Bank-side write helpers shared by three callers that all need to mint
 * `bank_material`/`bank_material_variant` rows without duplicating the
 * insert shape: the material-import destination picker (Decision 8 —
 * `features/github-import/actions.ts`'s `promoteImportedItemToBank` and
 * `features/cv-import/actions.ts`'s `createCvFromImport` bank branch), per-
 * bullet "save to bank" promotion from the CV editor (Decision 6/Phase 5's
 * "Promote a CV bullet" spec scenarios), and `features/career-bank/
 * actions.ts`'s own material-create action, which needs the same one-
 * material-one-default-variant shape (see `buildNewMaterialWithDefaultVariant`
 * below).
 *
 * Same phase-typed-struct discipline as `features/cv/persist-sections.ts`'s
 * `CvSectionBatch`, and for the identical reason: `bank_material.
 * engagement_id` and `bank_material_variant.material_id` are IMMEDIATE FK
 * checks, so an engagement insert placed after the materials that reference
 * it aborts the whole batch. `BankImportBatch` is deliberately NOT an array;
 * `flattenBankImportBatch` is the only legal way back to one.
 */
export type BankImportBatch = {
  engagements: BatchItem<"pg">[]
  materials: BatchItem<"pg">[]
  variants: BatchItem<"pg">[]
}

export function flattenBankImportBatch(
  batch: BankImportBatch,
): BatchItem<"pg">[] {
  return [...batch.engagements, ...batch.materials, ...batch.variants]
}

export type BankEngagementSeed =
  | {
      kind: "job"
      organization: string
      role: string
      startDate?: string | null
      endDate?: string | null
      url?: string | null
      description?: string | null
    }
  | {
      kind: "project"
      name: string
      startDate?: string | null
      endDate?: string | null
      url?: string | null
      description?: string | null
    }

export type BankBulletSeed = {
  content: string
  label?: string | null
  techTags?: string[]
  skillTags?: string[]
}

function normalizeKey(value: string | null): string {
  return (value ?? "").trim().toLowerCase()
}

/**
 * Live-engagement match-or-mint (Decision 8): re-importing the same
 * company/project must REUSE the existing live `bank_engagement` rather
 * than duplicating it, and must NOT revive a soft-deleted one (a bulk
 * import is not the row-by-row user intent that `ai_provider_model`'s
 * revive-on-conflict precedent relies on — see
 * `architecture/deletion-policy` and the design's Decision 8). This is a
 * read-then-decide in app code, not a partial unique index, for the same
 * reason every other "exactly one of X" rule in this context is —
 * `architecture/deletion-policy` trap 2.
 */
export async function findLiveEngagementMatch(
  bankId: string,
  seed: BankEngagementSeed,
) {
  const rows = await db
    .select()
    .from(bankEngagement)
    .where(
      and(
        eq(bankEngagement.bankId, bankId),
        eq(bankEngagement.kind, seed.kind),
        isNull(bankEngagement.deletedAt),
      ),
    )

  if (seed.kind === "job") {
    return (
      rows.find(
        (row) =>
          normalizeKey(row.organization) === normalizeKey(seed.organization) &&
          normalizeKey(row.role) === normalizeKey(seed.role),
      ) ?? null
    )
  }

  return (
    rows.find((row) => normalizeKey(row.name) === normalizeKey(seed.name)) ??
    null
  )
}

/**
 * Builds the bank-side batch for importing N bullets under one engagement:
 * reuses (or mints) the engagement, then mints one `bank_material` +
 * one default `bank_material_variant` per bullet — the same 1:1:1 shape the
 * spec's "Promote an unlinked CV bullet" scenario requires for manual
 * promotion (see `buildNewMaterialWithDefaultVariant`, which this function
 * is built on top of). Consumed by both importers' destination pickers
 * (Decision 8) and by `promoteBulletToBank`'s unlinked-bullet path.
 */
export async function buildBankMaterialQueries(params: {
  bankId: string
  engagement: BankEngagementSeed | null
  bullets: BankBulletSeed[]
}): Promise<{
  batch: BankImportBatch
  engagementId: string | null
  materialIds: string[]
}> {
  const engagements: BatchItem<"pg">[] = []
  let engagementId: string | null = null

  if (params.engagement) {
    const existing = await findLiveEngagementMatch(
      params.bankId,
      params.engagement,
    )
    if (existing) {
      engagementId = existing.id
    } else {
      engagementId = createId()
      engagements.push(
        db.insert(bankEngagement).values({
          id: engagementId,
          bankId: params.bankId,
          sortOrder: 0,
          kind: params.engagement.kind,
          organization:
            params.engagement.kind === "job"
              ? params.engagement.organization
              : null,
          role:
            params.engagement.kind === "job" ? params.engagement.role : null,
          name:
            params.engagement.kind === "project"
              ? params.engagement.name
              : null,
          startDate: params.engagement.startDate ?? null,
          endDate: params.engagement.endDate ?? null,
          url: params.engagement.url ?? null,
          description: params.engagement.description ?? null,
        }),
      )
    }
  }

  const materials: BatchItem<"pg">[] = []
  const variants: BatchItem<"pg">[] = []
  const materialIds: string[] = []

  params.bullets.forEach((bullet, index) => {
    const built = buildNewMaterialWithDefaultVariant({
      bankId: params.bankId,
      engagementId,
      kind: "bullet",
      sortOrder: index,
      techTags: bullet.techTags,
      skillTags: bullet.skillTags,
      content: bullet.content,
      label: bullet.label,
    })
    materialIds.push(built.materialId)
    materials.push(built.materialStatement)
    variants.push(built.variantStatement)
  })

  return {
    batch: { engagements, materials, variants },
    engagementId,
    materialIds,
  }
}

/**
 * One `bank_material` + its ONE default `bank_material_variant`, minted
 * together. This is the shape every material creation path in this domain
 * shares: the material-editor's own "create material" action (consumed THIS
 * batch), the import destination picker (Decision 8), and promoting an
 * unlinked CV bullet (spec: "Promote an unlinked CV bullet").
 */
export function buildNewMaterialWithDefaultVariant(params: {
  bankId: string
  engagementId: string | null
  kind: BankMaterialKind
  sortOrder: number
  techTags?: string[]
  skillTags?: string[]
  content: string
  label?: string | null
}): {
  materialId: string
  variantId: string
  materialStatement: BatchItem<"pg">
  variantStatement: BatchItem<"pg">
} {
  const materialId = createId()
  const variantId = createId()

  return {
    materialId,
    variantId,
    materialStatement: db.insert(bankMaterial).values({
      id: materialId,
      bankId: params.bankId,
      engagementId: params.engagementId,
      sortOrder: params.sortOrder,
      kind: params.kind,
      techTags: params.techTags ?? [],
      skillTags: params.skillTags ?? [],
    }),
    variantStatement: db.insert(bankMaterialVariant).values({
      id: variantId,
      materialId,
      sortOrder: 0,
      label: params.label ?? null,
      content: params.content,
      isDefault: true,
    }),
  }
}

/**
 * Adds an alternate wording to an EXISTING material — spec: "Promote a CV
 * bullet to a new variant" (a bullet with `source_material_id` already
 * pointing at a material gets a new variant under that SAME material, not a
 * new material). Never marked `isDefault` here: which variant is the
 * default only ever changes through an explicit set-default action (the
 * same "exactly one default" invariant `bank_material_variant.isDefault`
 * enforces app-side — see `db/schema.ts`).
 */
export function buildNewVariantForMaterial(params: {
  materialId: string
  sortOrder: number
  content: string
  label?: string | null
}): { variantId: string; statement: BatchItem<"pg"> } {
  const variantId = createId()
  return {
    variantId,
    statement: db.insert(bankMaterialVariant).values({
      id: variantId,
      materialId: params.materialId,
      sortOrder: params.sortOrder,
      label: params.label ?? null,
      content: params.content,
      isDefault: false,
    }),
  }
}
