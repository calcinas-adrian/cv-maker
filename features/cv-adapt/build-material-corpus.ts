import "server-only"

import { and, asc, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import {
  bank,
  bankEducation,
  bankEngagement,
  bankMaterial,
  bankMaterialVariant,
  bankSkill,
} from "@/db/schema"
import type { CvData } from "@/schemas/cv.schema"
import type {
  BankEngagementKind,
  BankMaterialKind,
} from "@/schemas/bank.schema"
import { normalizeMaterial } from "@/lib/normalize-material"
import { MAX_MATERIAL_CHARS } from "./constants"

/**
 * One dedup-and-render-ready unit of career material, whatever its source.
 * `key` is a UI/React key only — never persisted.
 *
 * Since the career-bank restructure (Decision 4), adaptation reads the BANK
 * ONLY — `origin` no longer distinguishes "career_material" from "other_cv"
 * because there is no other-CV corpus anymore (see
 * `architecture/adaptation-corpus-scope`).
 */
export type CorpusItem = {
  key: string
  origin: "source_cv" | "bank"
  /**
   * `bullet`/`summary` come straight from `bank_material.kind`; `skill` is a
   * render-layer kind sourced from `bank_skill`/`cv_skill`, never from
   * `bank_material` — skills live in their own table (Decision 1
   * resolution 6).
   */
  kind: "bullet" | "summary" | "skill"
  /** Role@Org / engagement name / cv title — the detail after "· " in the rendered tag. Empty string when there is none. */
  label: string
  /**
   * Which kind of engagement a `bullet` item is attached to, if any — drives
   * `renderLine`'s tag word. Always null for `summary`/`skill`, and null for
   * a floating bullet with no engagement (spec scenario "Material with no
   * engagement").
   */
  engagementKind: BankEngagementKind | null
  content: string
}

export type MaterialCorpus = {
  text: string
  includedCount: number
  totalCount: number
  capReached: boolean
}

// The subset `adaptCvForPosting` hands back to the client — the full
// rendered `text` never needs to leave the server.
export type CorpusSummary = Pick<
  MaterialCorpus,
  "includedCount" | "totalCount" | "capReached"
>

/**
 * Renders one corpus line. Exhaustive over `kind` with NO `default` branch
 * on purpose — this is one of the few genuinely useful catches `tsc` gives
 * us on this file; adding a fourth `kind` without updating this function is
 * a compile error, not a silently blank prompt tag.
 */
function renderLine(
  item: Pick<CorpusItem, "kind" | "label" | "content" | "engagementKind">,
): string {
  switch (item.kind) {
    case "bullet": {
      const tag =
        item.engagementKind === "job"
          ? "experiencia"
          : item.engagementKind === "project"
            ? "proyecto"
            : "logro"
      return item.label
        ? `- [${tag} · ${item.label}] ${item.content}`
        : `- [${tag}] ${item.content}`
    }
    case "summary":
      return item.label
        ? `- [resumen · ${item.label}] ${item.content}`
        : `- [resumen] ${item.content}`
    case "skill":
      return `- [habilidad] ${item.content}`
  }
}

/**
 * The source CV's own summary + experience/project bullets, as `CorpusItem`s
 * — origin `"source_cv"`, always included, never truncated (see
 * `buildMaterialCorpus`). Education is deliberately excluded from this list;
 * see `sourceEducationLines` below.
 */
function sourceContentItems(data: CvData): CorpusItem[] {
  const items: CorpusItem[] = []

  const summary = data.summary?.trim()
  if (summary) {
    items.push({
      key: "source-summary",
      origin: "source_cv",
      kind: "summary",
      label: "",
      engagementKind: null,
      content: summary,
    })
  }

  for (const e of data.experiences) {
    const label = [e.role, e.company].filter(Boolean).join(" @ ")
    for (const bullet of e.bullets ?? []) {
      const trimmed = bullet.content.trim()
      if (!trimmed) continue
      items.push({
        key: `source-exp-${e.id}-${items.length}`,
        origin: "source_cv",
        kind: "bullet",
        label,
        engagementKind: "job",
        content: trimmed,
      })
    }
  }

  for (const p of data.projects) {
    for (const bullet of p.bullets ?? []) {
      const trimmed = bullet.content.trim()
      if (!trimmed) continue
      items.push({
        key: `source-proj-${p.id}-${items.length}`,
        origin: "source_cv",
        kind: "bullet",
        label: p.name ?? "",
        engagementKind: "project",
        content: trimmed,
      })
    }
  }

  return items
}

/**
 * The source CV's `education` rows, rendered as plain lines — deliberately
 * NOT `CorpusItem`s: the bank has no "education" kind that could ever dedup
 * against these, and they never appear anywhere else in the corpus. They
 * exist purely as context for the model — per D14, `education` has no AI
 * output channel at all; the adapt action carries the source's own rows
 * through verbatim instead of reading them back out of the model.
 */
function sourceEducationLines(data: CvData): string[] {
  const lines: string[] = []
  for (const ed of data.education) {
    if (!ed.institution && !ed.degree) continue
    const range = [ed.startDate, ed.endDate].filter(Boolean).join(" – ")
    const heading = [ed.degree, ed.institution].filter(Boolean).join(" @ ")
    lines.push(`- [educación] ${heading}${range ? ` (${range})` : ""}`)
  }
  return lines
}

/**
 * `bank_education` rendered as the same plain `[educación]` lines
 * `sourceEducationLines` produces, for the bank-origin corpus (no source CV
 * exists there, so those rows have to come from the bank instead).
 *
 * Same non-`CorpusItem` treatment and same reason: education has no AI
 * output channel (D14), so these lines are context for the model only.
 * `createCvFromBankAdaptation` carries the bank's own rows through verbatim,
 * re-read by id server-side, exactly as the CV-origin path carries the
 * source CV's rows.
 */
async function fetchBankEducationLines(userId: string): Promise<string[]> {
  const rows = await db
    .select({
      institution: bankEducation.institution,
      degree: bankEducation.degree,
      startDate: bankEducation.startDate,
      endDate: bankEducation.endDate,
    })
    .from(bankEducation)
    .innerJoin(
      bank,
      and(
        eq(bankEducation.bankId, bank.id),
        eq(bank.userId, userId),
        isNull(bank.deletedAt),
      ),
    )
    .where(isNull(bankEducation.deletedAt))
    .orderBy(asc(bankEducation.sortOrder))

  return rows.map((row) => {
    const range = [row.startDate, row.endDate].filter(Boolean).join(" – ")
    const heading = [row.degree, row.institution].filter(Boolean).join(" @ ")
    return `- [educación] ${heading}${range ? ` (${range})` : ""}`
  })
}

function sourceSkillItems(data: CvData): CorpusItem[] {
  const items: CorpusItem[] = []
  for (const s of data.skills) {
    const name = s.name?.trim()
    if (!name) continue
    items.push({
      key: `source-skill-${s.id}-${items.length}`,
      origin: "source_cv",
      kind: "skill",
      label: "",
      engagementKind: null,
      content: s.category ? `${name} (${s.category})` : name,
    })
  }
  return items
}

/**
 * Bank materials, joined down to exactly one `CorpusItem` per material:
 * `bank` (ownership + soft delete) inner-joined to `bank_material` (soft
 * delete) inner-joined to `bank_material_variant` (soft delete — a deleted
 * variant must not resurface as the chosen default), left-joined to
 * `bank_engagement` for the label. Soft-delete filtering is three levels
 * deep (`bank`, `bank_material`, `bank_material_variant`) — `bank_engagement`
 * is deliberately NOT a fourth filter level: a material attached to a
 * soft-deleted engagement still renders using that engagement's own fields,
 * the same "dangling pointer is honest, not an error" precedent
 * `cv_bullet.source_material_id` already established.
 *
 * One material = ONE corpus line, using the live default variant — falling
 * back deterministically to the lowest-`sort_order` live variant when none
 * is flagged default. Never throws at prompt-build time. Achieved by
 * ordering rows so the winning variant is row-one per material (`isDefault`
 * desc, then `sortOrder` asc) and picking the first row seen per
 * `materialId` — variants for one material sort as one contiguous block
 * because they share the same `(engagementSortOrder, materialSortOrder)`
 * primary key.
 */
async function fetchBankMaterialItems(userId: string): Promise<CorpusItem[]> {
  const rows = await db
    .select({
      materialId: bankMaterial.id,
      materialKind: bankMaterial.kind,
      content: bankMaterialVariant.content,
      engagementKind: bankEngagement.kind,
      engagementOrganization: bankEngagement.organization,
      engagementRole: bankEngagement.role,
      engagementName: bankEngagement.name,
    })
    .from(bankMaterial)
    .innerJoin(
      bank,
      and(
        eq(bankMaterial.bankId, bank.id),
        eq(bank.userId, userId),
        isNull(bank.deletedAt),
      ),
    )
    .innerJoin(
      bankMaterialVariant,
      and(
        eq(bankMaterialVariant.materialId, bankMaterial.id),
        isNull(bankMaterialVariant.deletedAt),
      ),
    )
    .leftJoin(bankEngagement, eq(bankEngagement.id, bankMaterial.engagementId))
    .where(isNull(bankMaterial.deletedAt))
    .orderBy(
      // Postgres ASC puts NULLs last by default — exactly the "nulls last"
      // priority order the design calls for.
      asc(bankEngagement.sortOrder),
      asc(bankMaterial.sortOrder),
      desc(bankMaterialVariant.isDefault),
      asc(bankMaterialVariant.sortOrder),
    )

  const seenMaterialIds = new Set<string>()
  const items: CorpusItem[] = []
  for (const row of rows) {
    if (seenMaterialIds.has(row.materialId)) continue
    seenMaterialIds.add(row.materialId)

    const engagementKind = row.engagementKind as BankEngagementKind | null
    const label =
      engagementKind === "job"
        ? [row.engagementRole, row.engagementOrganization]
            .filter(Boolean)
            .join(" @ ")
        : engagementKind === "project"
          ? (row.engagementName ?? "")
          : ""

    items.push({
      key: row.materialId,
      origin: "bank",
      kind: row.materialKind as BankMaterialKind,
      label,
      engagementKind,
      content: row.content,
    })
  }
  return items
}

/**
 * `bank_skill` rows — the render-layer `"skill"` corpus kind, never sourced
 * from `bank_material` (Decision 1 resolution 6 moved skills to their own
 * table).
 */
async function fetchBankSkillItems(userId: string): Promise<CorpusItem[]> {
  const rows = await db
    .select({
      id: bankSkill.id,
      name: bankSkill.name,
      category: bankSkill.category,
    })
    .from(bankSkill)
    .innerJoin(
      bank,
      and(
        eq(bankSkill.bankId, bank.id),
        eq(bank.userId, userId),
        isNull(bank.deletedAt),
      ),
    )
    .where(isNull(bankSkill.deletedAt))
    .orderBy(asc(bankSkill.sortOrder))

  return rows.map((row) => ({
    key: row.id,
    origin: "bank",
    kind: "skill",
    label: "",
    engagementKind: null,
    content: row.category ? `${row.name} (${row.category})` : row.name,
  }))
}

/**
 * Every bank candidate, in the corpus's deterministic priority order:
 * `bank_material` (by engagement `sortOrder` asc nulls last, then material
 * `sortOrder` asc) then `bank_skill` (`sortOrder` asc). No `createdAt`
 * tiebreak needed.
 */
async function fetchBankItems(userId: string): Promise<CorpusItem[]> {
  const [materials, skills] = await Promise.all([
    fetchBankMaterialItems(userId),
    fetchBankSkillItems(userId),
  ])
  return [...materials, ...skills]
}

/**
 * Builds the read-time reference corpus for one adaptation.
 *
 * TWO ORIGINS, ONE BUILDER. `sourceData` is the CV being adapted, or `null`
 * when the adaptation starts from the bank with no CV at all (see
 * `architecture/bank-produces-cv`). This function is deliberately NOT forked
 * into a second bank-only implementation: the product rules encoded here —
 * read-time dedup by normalized content, the deterministic priority order,
 * the character cap with stop-on-first-overflow, and the structural PII
 * exclusion of references — are the corpus, and two copies of them would
 * drift apart with nothing in the toolchain able to catch it (the explicit
 * warning recorded in `architecture/adaptation-corpus-scope`).
 *
 * What the two origins actually differ in:
 *
 * - **CV origin** (`sourceData` non-null): the source CV's own content is
 *   included complete and cap-exempt, and it SEEDS the dedup set — so a bank
 *   material the user already has on this CV never appears twice, and the
 *   copy that survives is the CV's wording. The bank is additive.
 * - **Bank origin** (`sourceData === null`): there is no cap-exempt block at
 *   all. Every line is a bank candidate subject to the cap, which promotes
 *   the priority order from a tiebreaker to the ENTIRE composition rule —
 *   at the cap it is the engagement/material `sortOrder` alone that decides
 *   what the model gets to see. Education comes from `bank_education`
 *   instead of the source CV's rows.
 *
 * Adaptation reads the BANK ONLY on both paths — no sibling-CV corpus ever;
 * see `architecture/adaptation-corpus-scope`.
 */
export async function buildMaterialCorpus(
  userId: string,
  sourceData: CvData | null,
): Promise<MaterialCorpus> {
  const seen = new Set<string>()

  const sourceItemsForText = sourceData ? sourceContentItems(sourceData) : []
  const sourceSkills = sourceData ? sourceSkillItems(sourceData) : []
  const allSourceItems = [...sourceItemsForText, ...sourceSkills]
  for (const item of allSourceItems) seen.add(normalizeMaterial(item.content))

  // Education is the one block whose SOURCE changes with the origin rather
  // than simply disappearing: a bank-origin CV still has education to show
  // the model, it just lives in `bank_education`.
  const [sourceEducation, bankItems] = await Promise.all([
    sourceData
      ? Promise.resolve(sourceEducationLines(sourceData))
      : fetchBankEducationLines(userId),
    fetchBankItems(userId),
  ])

  // Read-time dedup (D1): source-CV items already seeded `seen` above and
  // are never skipped; every later candidate that normalizes to something
  // already seen IS skipped (and does not count toward `totalCount`).
  const dedupedCandidates: CorpusItem[] = []
  for (const item of bankItems) {
    const key = normalizeMaterial(item.content)
    if (seen.has(key)) continue
    seen.add(key)
    dedupedCandidates.push(item)
  }

  // The cap-EXEMPT block. On the CV origin that is the source CV's own
  // content plus its education; on the bank origin only `bank_education`
  // survives here, because education has no AI output channel either way
  // (D14) and is carried through verbatim rather than regenerated — capping
  // it away would hide a degree from the model while still printing it on
  // the CV.
  const exemptLines = [
    ...sourceItemsForText.map(renderLine),
    ...sourceEducation,
    ...sourceSkills.map(renderLine),
  ]
  let text = exemptLines.join("\n")
  let includedCount = allSourceItems.length
  let capReached = false

  if (text.length > MAX_MATERIAL_CHARS) {
    // The cap-exempt block alone already exceeds the cap: keep it whole,
    // include nothing else — [design call], see design section 2. Reachable
    // in practice only on the CV origin; on the bank origin this block is
    // education-only and orders of magnitude below the cap.
    capReached = true
  } else {
    for (const item of dedupedCandidates) {
      const line = renderLine(item)
      const separator = text.length > 0 ? "\n" : ""
      // [design call] Stop on first overflow rather than skip-and-continue:
      // skip-and-continue would let short items sneak past long ones,
      // making the corpus's composition depend on line length instead of
      // the declared priority order — see design section 2.
      if (text.length + separator.length + line.length > MAX_MATERIAL_CHARS) {
        capReached = true
        break
      }
      text += separator + line
      includedCount += 1
    }
  }

  return {
    text,
    includedCount,
    totalCount: allSourceItems.length + dedupedCandidates.length,
    capReached,
  }
}
