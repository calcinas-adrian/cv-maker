import "server-only"
import { headers } from "next/headers"
import { and, eq, isNull } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { auth } from "@/lib/auth"
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
import { findOwnedCv } from "@/features/cv/ownership"

/**
 * Shared ownership-check helpers for the bank domain, mirroring
 * `features/cv/ownership.ts` and `features/career-material/ownership.ts`:
 * every mutation in `features/career-bank/actions.ts` goes through one of
 * these before touching a row. IDs always come from the client and are
 * never trusted alone.
 */

export type BankRow = typeof bank.$inferSelect

export async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user.id ?? null
}

/**
 * Loads a LIVE `bank` row scoped to both its id AND the given userId in a
 * single query. `bankId` always comes from the client and is never trusted
 * alone.
 */
export async function findOwnedBank(
  bankId: string,
  userId: string,
): Promise<BankRow | null> {
  const [row] = await db
    .select()
    .from(bank)
    .where(
      and(eq(bank.id, bankId), eq(bank.userId, userId), isNull(bank.deletedAt)),
    )
    .limit(1)
  return row ?? null
}

/**
 * Read-only lookup for a user's live personal bank — does NOT create one.
 * Split out of `getOrCreatePersonalBank` so callers that must NOT mint a
 * bank as a side effect (the material-import destination picker's
 * degenerate case, Decision 8: "PDF import when the user has no live bank
 * defaults to CV-only... does not silently auto-create a bank during a file
 * upload") can check existence without the create-on-miss behavior.
 */
export async function findPersonalBank(
  userId: string,
): Promise<BankRow | null> {
  const [existing] = await db
    .select()
    .from(bank)
    .where(
      and(
        eq(bank.userId, userId),
        eq(bank.isPersonal, true),
        isNull(bank.deletedAt),
      ),
    )
    .limit(1)
  return existing ?? null
}

/**
 * The single creation point for a user's implicit personal bank — see
 * `architecture/bank-multiplicity-ui`. "At most one live personal bank per
 * user" is enforced HERE, in app code, by reading before minting, rather
 * than by a partial unique index (`WHERE deleted_at IS NULL`), which
 * `architecture/deletion-policy` forbids on soft-deleted tables. Every
 * caller that needs "the" bank for a user (the bank editor page, and every
 * `career-bank` action) goes through this rather than querying `bank`
 * directly, so there is exactly one place this invariant can be violated.
 *
 * The id is minted here, in JS, same convention as every other create path
 * in this repo — no `.returning()`, the freshly-inserted row is built
 * in-memory from the values just written instead of a second round trip.
 */
export async function getOrCreatePersonalBank(
  userId: string,
): Promise<BankRow> {
  const existing = await findPersonalBank(userId)
  if (existing) return existing

  const id = createId()
  const now = new Date()
  await db
    .insert(bank)
    .values({ id, userId, name: "Mi banco", isPersonal: true })

  return {
    id,
    userId,
    name: "Mi banco",
    fullName: null,
    isPersonal: true,
    headline: null,
    location: null,
    email: null,
    phone: null,
    linkedinUrl: null,
    websiteUrl: null,
    githubUrl: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

/**
 * Resolves a `cv` and (optionally) a `bank` as one ownership-checked pair.
 * This is the ONLY sanctioned way to turn a client-supplied `(cvId,
 * bankId)` pair into values safe to write onto `cv.bank_id` or
 * `adaptation.bank_id` — see the Ownership invariant in
 * `sdd/career-bank-restructure/design`: those columns are only ever
 * written from `bank.id` off a row resolved HERE, never from the request
 * payload directly. This is the spec's "Cross-user bank assignment
 * blocked" scenario: a `bankId` belonging to another user resolves to
 * `null` here, so the caller has no owned bank row to write from.
 *
 * `bankId: null` is a legitimate case (a CV with no bank, or an import
 * destined "this CV only") and resolves to `{ cv, bank: null }` without a
 * second query.
 */
export async function resolveCvAndBank(
  cvId: string,
  bankId: string | null,
  userId: string,
) {
  const cvRow = await findOwnedCv(cvId, userId)
  if (!cvRow) return null

  if (bankId === null) return { cv: cvRow, bank: null }

  const bankRow = await findOwnedBank(bankId, userId)
  if (!bankRow) return null

  return { cv: cvRow, bank: bankRow }
}

/**
 * Satellite ownership checks below all follow the same shape as
 * `findOwnedBank`: id + `bankId` (already resolved via
 * `getOrCreatePersonalBank`) + `isNull(deletedAt)` in one query. None of
 * these trust a client-supplied `bankId` directly — `actions.ts` always
 * resolves the caller's OWN bank first via `getOrCreatePersonalBank(userId)`
 * and passes that row's id in here, so a satellite id belonging to another
 * user's bank can never match.
 */

export async function findOwnedEngagement(id: string, bankId: string) {
  const [row] = await db
    .select()
    .from(bankEngagement)
    .where(
      and(
        eq(bankEngagement.id, id),
        eq(bankEngagement.bankId, bankId),
        isNull(bankEngagement.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function findOwnedMaterial(id: string, bankId: string) {
  const [row] = await db
    .select()
    .from(bankMaterial)
    .where(
      and(
        eq(bankMaterial.id, id),
        eq(bankMaterial.bankId, bankId),
        isNull(bankMaterial.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

/**
 * A variant has no `bankId` of its own — ownership is reached through its
 * material, the same satellite pattern `cv_version` uses against `cv`. Joins
 * one level to `bank_material` and checks BOTH rows are live: a variant
 * cannot be "owned" through a soft-deleted material.
 */
export async function findOwnedVariant(id: string, bankId: string) {
  const [row] = await db
    .select({ variant: bankMaterialVariant })
    .from(bankMaterialVariant)
    .innerJoin(
      bankMaterial,
      eq(bankMaterialVariant.materialId, bankMaterial.id),
    )
    .where(
      and(
        eq(bankMaterialVariant.id, id),
        eq(bankMaterial.bankId, bankId),
        isNull(bankMaterialVariant.deletedAt),
        isNull(bankMaterial.deletedAt),
      ),
    )
    .limit(1)
  return row?.variant ?? null
}

export async function findOwnedEducation(id: string, bankId: string) {
  const [row] = await db
    .select()
    .from(bankEducation)
    .where(
      and(
        eq(bankEducation.id, id),
        eq(bankEducation.bankId, bankId),
        isNull(bankEducation.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function findOwnedCredential(id: string, bankId: string) {
  const [row] = await db
    .select()
    .from(bankCredential)
    .where(
      and(
        eq(bankCredential.id, id),
        eq(bankCredential.bankId, bankId),
        isNull(bankCredential.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function findOwnedLanguage(id: string, bankId: string) {
  const [row] = await db
    .select()
    .from(bankLanguage)
    .where(
      and(
        eq(bankLanguage.id, id),
        eq(bankLanguage.bankId, bankId),
        isNull(bankLanguage.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function findOwnedSkill(id: string, bankId: string) {
  const [row] = await db
    .select()
    .from(bankSkill)
    .where(
      and(
        eq(bankSkill.id, id),
        eq(bankSkill.bankId, bankId),
        isNull(bankSkill.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}
