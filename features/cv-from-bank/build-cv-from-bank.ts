import "server-only"

import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/db"
import {
  bankCredential,
  bankEducation,
  bankEngagement,
  bankLanguage,
  bankMaterial,
  bankMaterialVariant,
  bankSkill,
} from "@/db/schema"
import type { CredentialKind, CvData } from "@/schemas/cv.schema"
import type { BankCvSelection } from "@/schemas/cv-from-bank.schema"

/**
 * The deterministic bank -> CV projection: no AI, no provider, no job
 * posting. The bank is the canonical record of a person's professional life
 * and a CV is build output from it (`architecture/career-bank-restructure`);
 * this module is that build step in its plainest form.
 *
 * It exists as a plain (non-`"use server"`) module for the usual reason in
 * this codebase — see `features/cv/persist-sections.ts`'s note: every export
 * of a `"use server"` file must be an async server action, so synchronous
 * helpers like `projectBankRowsToCvData` cannot live next to the action that
 * calls them.
 *
 * KNOWN GAP, deliberate. Two things this projection cannot carry:
 *
 * 1. **Floating materials** (`bank_material.engagement_id IS NULL` — the
 *    spec's "Material with no engagement") have nowhere to land. `cv_bullet`
 *    carries a `cv_bullet_one_parent` check constraint (`num_nonnulls(
 *    experience_id, project_id) = 1`, `db/schema.ts`), so a bullet with no
 *    experience and no project is not merely unmodelled, it is rejected by
 *    the database. They stay in the bank and remain available to the AI
 *    corpus, which has no such structural requirement. Giving them a home
 *    would mean a CV-side "achievements" section, which is a product
 *    decision, not a projection detail.
 * 2. **`cv_experience.source_engagement_id` / `cv_project.source_engagement_id`**
 *    are not populated, even though this is precisely the path that knows
 *    the answer. `buildCvSectionQueries` builds its rows from `CvData`, and
 *    `CvData` has no field for it — adding one means extending
 *    `experienceItemSchema`/`projectItemSchema`, which are ALSO the YAML
 *    contract (`features/cv/yaml/projection.ts` spreads the item through to
 *    the YAML view), so the new field would leak into hand-edited YAML
 *    unless `toYamlView` strips it too. That is a contained change but it
 *    touches a shipped, spec'd round-trip for a column nothing reads yet.
 *    Bullet-level provenance (`cv_bullet.source_material_id`) IS populated
 *    here and is the pointer the design actually depends on (resolution 1:
 *    "the pointer moves DOWN to the bullet").
 */

export type SelectedBankRows = {
  engagements: Map<string, typeof bankEngagement.$inferSelect>
  /** variantId -> the variant row plus the material it belongs to. */
  variants: Map<
    string,
    {
      content: string
      materialId: string
      materialKind: string
      engagementId: string | null
    }
  >
  education: Map<string, typeof bankEducation.$inferSelect>
  credentials: Map<string, typeof bankCredential.$inferSelect>
  languages: Map<string, typeof bankLanguage.$inferSelect>
  skills: Map<string, typeof bankSkill.$inferSelect>
}

function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]))
}

/**
 * Re-reads every row the selection names, scoped to ONE bank and filtered to
 * live rows at every level.
 *
 * `bankId` is the resolved personal bank's own id — never a client value —
 * so scoping each query by it is what makes an id belonging to somebody
 * else's bank resolve to nothing rather than to their material. Ids that
 * don't come back are silently dropped by the projection below rather than
 * failing the whole build: a row the user soft-deleted from another tab
 * between opening the picker and confirming is a stale selection, not an
 * error worth destroying the rest of their work over.
 *
 * Empty id lists skip their query entirely — `inArray(col, [])` is a query
 * with no useful meaning, and not issuing it saves a round trip on the very
 * common "no credentials selected" case.
 */
export async function loadSelectedBankRows(
  bankId: string,
  selection: BankCvSelection,
): Promise<SelectedBankRows> {
  const engagementIds = selection.engagements.map((e) => e.engagementId)
  const variantIds = [
    ...selection.engagements.flatMap((e) => e.variantIds),
    ...(selection.summaryVariantId ? [selection.summaryVariantId] : []),
  ]

  const [
    engagementRows,
    variantRows,
    educationRows,
    credentialRows,
    languageRows,
    skillRows,
  ] = await Promise.all([
    engagementIds.length
      ? db
          .select()
          .from(bankEngagement)
          .where(
            and(
              eq(bankEngagement.bankId, bankId),
              isNull(bankEngagement.deletedAt),
              inArray(bankEngagement.id, engagementIds),
            ),
          )
      : Promise.resolve([]),
    variantIds.length
      ? db
          .select({
            id: bankMaterialVariant.id,
            content: bankMaterialVariant.content,
            materialId: bankMaterial.id,
            materialKind: bankMaterial.kind,
            engagementId: bankMaterial.engagementId,
          })
          .from(bankMaterialVariant)
          // The join to `bank_material` is what enforces ownership: the
          // variant table has no `bank_id` of its own, so a variant is only
          // reachable through a material that belongs to THIS bank.
          .innerJoin(
            bankMaterial,
            and(
              eq(bankMaterialVariant.materialId, bankMaterial.id),
              eq(bankMaterial.bankId, bankId),
              isNull(bankMaterial.deletedAt),
            ),
          )
          .where(
            and(
              isNull(bankMaterialVariant.deletedAt),
              inArray(bankMaterialVariant.id, variantIds),
            ),
          )
      : Promise.resolve([]),
    selection.educationIds.length
      ? db
          .select()
          .from(bankEducation)
          .where(
            and(
              eq(bankEducation.bankId, bankId),
              isNull(bankEducation.deletedAt),
              inArray(bankEducation.id, selection.educationIds),
            ),
          )
      : Promise.resolve([]),
    selection.credentialIds.length
      ? db
          .select()
          .from(bankCredential)
          .where(
            and(
              eq(bankCredential.bankId, bankId),
              isNull(bankCredential.deletedAt),
              inArray(bankCredential.id, selection.credentialIds),
            ),
          )
      : Promise.resolve([]),
    selection.languageIds.length
      ? db
          .select()
          .from(bankLanguage)
          .where(
            and(
              eq(bankLanguage.bankId, bankId),
              isNull(bankLanguage.deletedAt),
              inArray(bankLanguage.id, selection.languageIds),
            ),
          )
      : Promise.resolve([]),
    selection.skillIds.length
      ? db
          .select()
          .from(bankSkill)
          .where(
            and(
              eq(bankSkill.bankId, bankId),
              isNull(bankSkill.deletedAt),
              inArray(bankSkill.id, selection.skillIds),
            ),
          )
      : Promise.resolve([]),
  ])

  return {
    engagements: byId(engagementRows),
    variants: new Map(
      variantRows.map((row) => [
        row.id,
        {
          content: row.content,
          materialId: row.materialId,
          materialKind: row.materialKind,
          engagementId: row.engagementId,
        },
      ]),
    ),
    education: byId(educationRows),
    credentials: byId(credentialRows),
    languages: byId(languageRows),
    skills: byId(skillRows),
  }
}

/**
 * Turns the re-read rows into a `CvData`, honouring the ORDER the user
 * arranged in the picker (the selection arrays are ordered; the maps are
 * only for lookup) and dropping anything that didn't survive the re-read.
 *
 * Contact fields are deliberately absent from the returned `CvData` — and
 * this function is deliberately not given the `bank` row it would need to
 * fill them. `buildCvSectionQueries` ignores contact fields entirely, and
 * `createCvFromBank` writes them onto the `cv` row straight from the
 * resolved `bank` row. Same shape as D11 on the adaptation path: the fields
 * reach the CV through a channel this code path cannot address, rather than
 * through a payload field that merely happens to be overwritten later.
 */
export function projectBankRowsToCvData(
  selection: BankCvSelection,
  rows: SelectedBankRows,
): CvData {
  const experiences: CvData["experiences"] = []
  const projects: CvData["projects"] = []

  for (const chosen of selection.engagements) {
    const engagement = rows.engagements.get(chosen.engagementId)
    if (!engagement) continue

    const bullets = chosen.variantIds.flatMap((variantId) => {
      const variant = rows.variants.get(variantId)
      if (!variant) return []
      // A wording only belongs under the engagement its own material hangs
      // off. Anything else would stamp `sourceMaterialId` with a claim from
      // a different job — provenance pointing at the wrong place is worse
      // than none, because every downstream reader trusts it.
      if (variant.engagementId !== engagement.id) return []
      // Summaries are a whole-document field, not a bullet. One reaching
      // this list means the client mislabelled it; skip rather than render a
      // positioning statement as an achievement.
      if (variant.materialKind !== "bullet") return []
      return [
        {
          id: variantId,
          content: variant.content,
          sourceMaterialId: variant.materialId,
        },
      ]
    })

    if (engagement.kind === "project") {
      projects.push({
        id: engagement.id,
        name: engagement.name ?? "",
        description: engagement.description ?? "",
        url: engagement.url,
        bullets,
      })
      continue
    }

    experiences.push({
      id: engagement.id,
      company: engagement.organization ?? "",
      role: engagement.role ?? "",
      startDate: engagement.startDate,
      endDate: engagement.endDate,
      bullets,
    })
  }

  const summaryVariant = selection.summaryVariantId
    ? rows.variants.get(selection.summaryVariantId)
    : undefined

  return {
    // See the docstring: no contact fields here on purpose.
    summary:
      summaryVariant && summaryVariant.materialKind === "summary"
        ? summaryVariant.content
        : undefined,
    experiences,
    projects,
    education: selection.educationIds.flatMap((id) => {
      const row = rows.education.get(id)
      return row
        ? [
            {
              id: row.id,
              institution: row.institution,
              degree: row.degree,
              startDate: row.startDate,
              endDate: row.endDate,
            },
          ]
        : []
    }),
    skills: selection.skillIds.flatMap((id) => {
      const row = rows.skills.get(id)
      return row ? [{ id: row.id, name: row.name, category: row.category }] : []
    }),
    credentials: selection.credentialIds.flatMap((id) => {
      const row = rows.credentials.get(id)
      return row
        ? [
            {
              id: row.id,
              kind: row.kind as CredentialKind,
              name: row.name,
              issuer: row.issuer,
              issuedAt: row.issuedAt,
              expiresAt: row.expiresAt,
              credentialId: row.credentialId,
              credentialUrl: row.credentialUrl,
              description: row.description,
            },
          ]
        : []
    }),
    languages: selection.languageIds.flatMap((id) => {
      const row = rows.languages.get(id)
      return row ? [{ id: row.id, name: row.name, level: row.level }] : []
    }),
    // Always empty, structurally. `cv_reference` holds third-party PII and
    // has NO bank counterpart by design (resolution 8): keeping referees out
    // of the bank is what keeps them out of the AI corpus by construction
    // rather than by convention. A bank-built CV therefore starts with no
    // references and the user adds them in the editor, where they have
    // always lived.
    references: [],
  }
}
