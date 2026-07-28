import "server-only"
import { and, desc, eq, isNull } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "@/db"
import { cv, cvAdaptation } from "@/db/schema"

/**
 * How much of the job posting travels with the LIST. Postings are capped at
 * 12k characters each (`MAX_JOB_POSTING_CHARS`), so shipping them whole
 * would put megabytes of RSC payload on a page most people open to scan
 * titles and dates. The full text is fetched on demand instead, by
 * `getAdaptationPosting`, when a row is actually expanded.
 */
const POSTING_PREVIEW_CHARS = 220

export type AdaptationListItem = {
  id: string
  createdAt: Date
  postingPreview: string
  /** True when the posting is longer than its preview — drives the "Ver aviso completo" affordance. */
  postingTruncated: boolean
  adaptationNotes: string | null
  /** The CV this adaptation PRODUCED. Always present and always live. */
  cvId: string
  cvTitle: string
  /**
   * The CV it was derived FROM. Null when that CV was deleted — `sourceCvId`
   * is `on delete set null`, and a soft-deleted source is treated the same
   * way, since the user cannot open either one.
   */
  source: { id: string; title: string } | null
}

/**
 * Application history: every CV the user generated from a job posting, newest
 * first.
 *
 * Reads the `cv_adaptation` rows written by `createCvFromAdaptation`. Until
 * this query existed that table was write-only — the posting and the lineage
 * were being stored on every adaptation and never shown to anyone.
 *
 * Ownership is enforced through the ADAPTED cv row (`adapted.userId`), the
 * same satellite pattern `features/cv/list.ts` uses: `cv_adaptation` has no
 * `userId` of its own and is only ever reachable via a cv. Soft-deleted
 * adapted CVs drop out of the list entirely — a deleted CV is invisible
 * everywhere in the UI (see `features/cv/ownership.ts`), and its adaptation
 * is not an exception.
 */
export async function listUserAdaptations(
  userId: string,
): Promise<AdaptationListItem[]> {
  const adapted = alias(cv, "adapted_cv")
  const source = alias(cv, "source_cv")

  const rows = await db
    .select({
      id: cvAdaptation.id,
      createdAt: cvAdaptation.createdAt,
      jobPostingText: cvAdaptation.jobPostingText,
      adaptationNotes: cvAdaptation.adaptationNotes,
      cvId: adapted.id,
      cvTitle: adapted.title,
      sourceId: source.id,
      sourceTitle: source.title,
    })
    .from(cvAdaptation)
    // INNER: no live adapted CV, no history row.
    .innerJoin(
      adapted,
      and(eq(adapted.id, cvAdaptation.cvId), isNull(adapted.deletedAt)),
    )
    // LEFT: the source may legitimately be gone. The `userId` and `deletedAt`
    // conditions live in the JOIN rather than the WHERE on purpose — in a
    // WHERE they would turn this into an inner join and silently drop every
    // adaptation whose source CV was deleted.
    .leftJoin(
      source,
      and(
        eq(source.id, cvAdaptation.sourceCvId),
        eq(source.userId, userId),
        isNull(source.deletedAt),
      ),
    )
    .where(eq(adapted.userId, userId))
    .orderBy(desc(cvAdaptation.createdAt))

  return rows.map((row) => {
    // Postings are pasted from job boards and arrive full of hard wrapping;
    // collapsing whitespace is what makes a 220-character preview show 220
    // characters of content instead of three ragged lines.
    const flattened = row.jobPostingText.replace(/\s+/g, " ").trim()
    return {
      id: row.id,
      createdAt: row.createdAt,
      postingPreview: flattened.slice(0, POSTING_PREVIEW_CHARS),
      postingTruncated: flattened.length > POSTING_PREVIEW_CHARS,
      adaptationNotes: row.adaptationNotes,
      cvId: row.cvId,
      cvTitle: row.cvTitle,
      source:
        row.sourceId && row.sourceTitle
          ? { id: row.sourceId, title: row.sourceTitle }
          : null,
    }
  })
}
