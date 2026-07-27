import "server-only"

import { and, asc, desc, eq, isNull, ne } from "drizzle-orm"
import { db } from "@/db"
import { careerMaterial, cv, experience, project } from "@/db/schema"
import type { CvData } from "@/schemas/cv.schema"
import type { CareerMaterialKind } from "@/schemas/career-material.schema"
import { MAX_MATERIAL_CHARS } from "./constants"

/**
 * One dedup-and-render-ready unit of career material, whatever its source.
 * `key` is a UI/React key only — never persisted. `materialId` is non-null
 * iff this item IS a real `career_material` row (so the "Guardar en el
 * banco" action in `/career-material` knows there's nothing to save).
 *
 * `company`/`role`/`projectName` are carried as DISCRETE fields (not just
 * folded into `label`) so `promoteDerivedMaterial` can hand them straight
 * to `careerMaterialInputSchema` — reconstructing them by parsing a
 * rendered "Rol @ Empresa" label back apart would be lossy (an "@" inside a
 * real company name, for instance).
 */
export type CorpusItem = {
  key: string
  origin: "source_cv" | "career_material" | "other_cv"
  kind: CareerMaterialKind
  label: string
  content: string
  company: string | null
  role: string | null
  projectName: string | null
  materialId: string | null
  provenance: { cvId: string; cvTitle: string } | null
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

type CareerMaterialRow = typeof careerMaterial.$inferSelect

/**
 * Pure normalization for read-time dedup (D1): trim, collapse internal
 * whitespace, lowercase, strip trailing sentence punctuation. Deliberately
 * NOT a fuzzy/semantic match — a byte-for-byte-after-normalization miss
 * just costs one duplicated prompt line, a much smaller downside than a
 * false-positive dedup silently dropping distinct material.
 */
export function normalizeMaterial(text: string): string {
  return text
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase()
    .replace(/[.,;:!?…]+$/u, "")
}

function renderLine(
  item: Pick<CorpusItem, "kind" | "label" | "content">,
): string {
  switch (item.kind) {
    case "experience_bullet":
      return `- [experiencia · ${item.label}] ${item.content}`
    case "project_bullet":
      return `- [proyecto · ${item.label}] ${item.content}`
    case "skill":
      return `- [habilidad] ${item.content}`
    case "summary_note":
      return item.label
        ? `- [resumen · ${item.label}] ${item.content}`
        : `- [resumen] ${item.content}`
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
      kind: "summary_note",
      label: "",
      content: summary,
      company: null,
      role: null,
      projectName: null,
      materialId: null,
      provenance: null,
    })
  }

  for (const e of data.experiences) {
    const label = [e.role, e.company].filter(Boolean).join(" @ ")
    for (const bullet of e.bullets ?? []) {
      const trimmed = bullet.trim()
      if (!trimmed) continue
      items.push({
        key: `source-exp-${e.id}-${items.length}`,
        origin: "source_cv",
        kind: "experience_bullet",
        label,
        content: trimmed,
        company: e.company ?? null,
        role: e.role ?? null,
        projectName: null,
        materialId: null,
        provenance: null,
      })
    }
  }

  for (const p of data.projects) {
    for (const bullet of p.bullets ?? []) {
      const trimmed = bullet.trim()
      if (!trimmed) continue
      items.push({
        key: `source-proj-${p.id}-${items.length}`,
        origin: "source_cv",
        kind: "project_bullet",
        label: p.name ?? "",
        content: trimmed,
        company: null,
        role: null,
        projectName: p.name ?? null,
        materialId: null,
        provenance: null,
      })
    }
  }

  return items
}

/**
 * The source CV's `education` rows, rendered as plain lines — deliberately
 * NOT `CorpusItem`s: `career_material` has no "education" kind, so these
 * never need dedup against anything and never appear anywhere else in the
 * corpus. They exist purely as context for the model — per D14, `education`
 * has no AI output channel at all; the adapt action carries the source's
 * own rows through verbatim instead of reading them back out of the model.
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
      content: s.category ? `${name} (${s.category})` : name,
      company: null,
      role: null,
      projectName: null,
      materialId: null,
      provenance: null,
    })
  }
  return items
}

function bankItemToCorpusItem(row: CareerMaterialRow): CorpusItem {
  const label =
    row.kind === "experience_bullet"
      ? [row.role, row.company].filter(Boolean).join(" @ ")
      : row.kind === "project_bullet"
        ? (row.projectName ?? "")
        : ""
  return {
    key: row.id,
    origin: "career_material",
    // Plain `text` column in the DB (see `db/schema.ts`) — the zod enum
    // lives at the action boundary, not here.
    kind: row.kind as CareerMaterialKind,
    label,
    content: row.content,
    company: row.company,
    role: row.role,
    projectName: row.projectName,
    materialId: row.id,
    provenance: null,
  }
}

async function fetchBankItems(userId: string): Promise<CorpusItem[]> {
  const rows = await db
    .select()
    .from(careerMaterial)
    // Same reasoning as `cvFilter` below: a deleted bank item must stop
    // reaching the AI prompt, not just stop rendering in the UI.
    .where(
      and(eq(careerMaterial.userId, userId), isNull(careerMaterial.deletedAt)),
    )
    .orderBy(desc(careerMaterial.createdAt))
  return rows.map(bankItemToCorpusItem)
}

/**
 * Loads every OTHER cv's experience/project/summary content, grouped and
 * ordered per the corpus's deterministic priority: CVs by `updatedAt` desc,
 * and within one CV: experiences (`sortOrder` asc) -> projects (`sortOrder`
 * asc) -> that CV's `summary`. Excludes `excludeCvId` when given (the
 * source CV of the adaptation in progress); pass `null` for
 * `listDerivedMaterial`, which has no source CV to exclude.
 *
 * Deliberately does NOT query other CVs' `skill` rows — per design, skills
 * cross CVs only flow through the `career_material` bank (kind: "skill"),
 * never read directly off a sibling CV.
 */
async function fetchOtherCvItems(
  userId: string,
  excludeCvId: string | null,
): Promise<CorpusItem[]> {
  // `isNull(cv.deletedAt)` matters more here than anywhere else in the app:
  // without it a CV the user deleted would keep feeding its experiences,
  // projects and summary into the AI adaptation prompt. "I deleted it and
  // the AI still writes about it" is the worst possible way for a soft
  // delete to leak. Applied once — all three queries below share this
  // filter, including the two that reach `cv` through an `innerJoin`.
  const cvFilter = excludeCvId
    ? and(eq(cv.userId, userId), isNull(cv.deletedAt), ne(cv.id, excludeCvId))
    : and(eq(cv.userId, userId), isNull(cv.deletedAt))

  const [cvs, experienceRows, projectRows] = await Promise.all([
    db
      .select({
        id: cv.id,
        title: cv.title,
        summary: cv.summary,
        updatedAt: cv.updatedAt,
      })
      .from(cv)
      .where(cvFilter)
      .orderBy(desc(cv.updatedAt)),
    db
      .select({
        cvId: experience.cvId,
        company: experience.company,
        role: experience.role,
        bullets: experience.bullets,
        sortOrder: experience.sortOrder,
      })
      .from(experience)
      .innerJoin(cv, eq(experience.cvId, cv.id))
      .where(cvFilter)
      .orderBy(asc(experience.sortOrder)),
    db
      .select({
        cvId: project.cvId,
        name: project.name,
        bullets: project.bullets,
        sortOrder: project.sortOrder,
      })
      .from(project)
      .innerJoin(cv, eq(project.cvId, cv.id))
      .where(cvFilter)
      .orderBy(asc(project.sortOrder)),
  ])

  const experiencesByCv = new Map<string, typeof experienceRows>()
  for (const row of experienceRows) {
    const list = experiencesByCv.get(row.cvId) ?? []
    list.push(row)
    experiencesByCv.set(row.cvId, list)
  }

  const projectsByCv = new Map<string, typeof projectRows>()
  for (const row of projectRows) {
    const list = projectsByCv.get(row.cvId) ?? []
    list.push(row)
    projectsByCv.set(row.cvId, list)
  }

  const items: CorpusItem[] = []

  for (const cvRow of cvs) {
    const provenance = { cvId: cvRow.id, cvTitle: cvRow.title }

    for (const e of experiencesByCv.get(cvRow.id) ?? []) {
      const label = [e.role, e.company].filter(Boolean).join(" @ ")
      for (const bullet of e.bullets) {
        const trimmed = bullet.trim()
        if (!trimmed) continue
        items.push({
          key: `other-exp-${cvRow.id}-${items.length}`,
          origin: "other_cv",
          kind: "experience_bullet",
          label,
          content: trimmed,
          company: e.company,
          role: e.role,
          projectName: null,
          materialId: null,
          provenance,
        })
      }
    }

    for (const p of projectsByCv.get(cvRow.id) ?? []) {
      for (const bullet of p.bullets) {
        const trimmed = bullet.trim()
        if (!trimmed) continue
        items.push({
          key: `other-proj-${cvRow.id}-${items.length}`,
          origin: "other_cv",
          kind: "project_bullet",
          label: p.name,
          content: trimmed,
          company: null,
          role: null,
          projectName: p.name,
          materialId: null,
          provenance,
        })
      }
    }

    const summary = cvRow.summary?.trim()
    if (summary) {
      items.push({
        key: `other-summary-${cvRow.id}`,
        origin: "other_cv",
        kind: "summary_note",
        label: cvRow.title,
        content: summary,
        company: null,
        role: null,
        projectName: null,
        materialId: null,
        provenance,
      })
    }
  }

  return items
}

/**
 * Builds the read-time reference corpus for one adaptation: the source
 * CV's own content (complete, cap-exempt) plus `career_material` + other
 * CVs (deduped, capped). See design section 2 for the full contract.
 */
export async function buildMaterialCorpus(
  userId: string,
  sourceCvId: string,
  sourceData: CvData,
): Promise<MaterialCorpus> {
  const seen = new Set<string>()

  const sourceItemsForText = sourceContentItems(sourceData)
  const sourceEducation = sourceEducationLines(sourceData)
  const sourceSkills = sourceSkillItems(sourceData)
  const allSourceItems = [...sourceItemsForText, ...sourceSkills]
  for (const item of allSourceItems) seen.add(normalizeMaterial(item.content))

  const [bankItems, otherCvItems] = await Promise.all([
    fetchBankItems(userId),
    fetchOtherCvItems(userId, sourceCvId),
  ])

  // Read-time dedup (D1): source-CV items already seeded `seen` above and
  // are never skipped; every later candidate that normalizes to something
  // already seen IS skipped (and does not count toward `totalCount`).
  const dedupedCandidates: CorpusItem[] = []
  for (const item of [...bankItems, ...otherCvItems]) {
    const key = normalizeMaterial(item.content)
    if (seen.has(key)) continue
    seen.add(key)
    dedupedCandidates.push(item)
  }

  const sourceLines = [
    ...sourceItemsForText.map(renderLine),
    ...sourceEducation,
    ...sourceSkills.map(renderLine),
  ]
  let text = sourceLines.join("\n")
  let includedCount = allSourceItems.length
  let capReached = false

  if (text.length > MAX_MATERIAL_CHARS) {
    // The source block alone already exceeds the cap: keep it whole,
    // include nothing else — [design call], see design section 2.
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

/**
 * All of the user's derived (non-banked) material, for the `/career-material`
 * page's "Derivado de tus CVs" group. No source CV to exclude, no cap — the
 * page shows everything and lets the user promote items into the bank.
 * Dedups against the saved bank (D1): the moment a `career_material` row
 * matches an item's normalized content, its derived twin stops appearing —
 * this is what makes `promoteDerivedMaterial` idempotent for free (no flag
 * to flip, no row to reconcile).
 */
export async function listDerivedMaterial(
  userId: string,
): Promise<CorpusItem[]> {
  const [bankItems, otherCvItems] = await Promise.all([
    fetchBankItems(userId),
    fetchOtherCvItems(userId, null),
  ])

  const seen = new Set(bankItems.map((item) => normalizeMaterial(item.content)))
  const derived: CorpusItem[] = []
  for (const item of otherCvItems) {
    const key = normalizeMaterial(item.content)
    if (seen.has(key)) continue
    seen.add(key)
    derived.push(item)
  }
  return derived
}
