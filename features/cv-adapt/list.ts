import "server-only"
import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { adaptation, bank, cv } from "@/db/schema"

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
   * The bank this adaptation drew its corpus from. Null when the bank was
   * later deleted (`adaptation.bank_id` is `set null`) OR the source CV had
   * no bank at all when the adaptation ran (spec scenario "CV with no
   * bank"). Since the career-bank restructure, adaptation reads ONLY the
   * bank — there is no `sourceCvId` anymore to fall back to (see
   * `architecture/adaptation-corpus-scope`), so this is "banco origen", not
   * "CV origen".
   */
  source: { id: string; name: string } | null
}

/**
 * Application history: every CV the user generated from a job posting, newest
 * first.
 *
 * Reads the `adaptation` rows written by `createCvFromAdaptation`. Until
 * this query existed that table was write-only — the posting and the lineage
 * were being stored on every adaptation and never shown to anyone.
 *
 * Ownership is enforced through the ADAPTED cv row (`cv.userId`), the same
 * satellite pattern `features/cv/list.ts` uses: `adaptation` has no `userId`
 * of its own and is only ever reachable via a cv. Soft-deleted adapted CVs
 * drop out of the list entirely — a deleted CV is invisible everywhere in
 * the UI (see `features/cv/ownership.ts`), and its adaptation is not an
 * exception.
 */
export async function listUserAdaptations(
  userId: string,
): Promise<AdaptationListItem[]> {
  const rows = await db
    .select({
      id: adaptation.id,
      createdAt: adaptation.createdAt,
      jobPostingText: adaptation.jobPostingText,
      adaptationNotes: adaptation.adaptationNotes,
      cvId: cv.id,
      cvTitle: cv.title,
      bankId: bank.id,
      bankName: bank.name,
    })
    .from(adaptation)
    // INNER: no live adapted CV, no history row.
    .innerJoin(cv, and(eq(cv.id, adaptation.cvId), isNull(cv.deletedAt)))
    // LEFT: the bank may legitimately be gone, or never have existed for
    // this adaptation. The `userId` and `deletedAt` conditions live in the
    // JOIN rather than the WHERE on purpose — in a WHERE they would turn
    // this into an inner join and silently drop every adaptation whose bank
    // was deleted.
    .leftJoin(
      bank,
      and(
        eq(bank.id, adaptation.bankId),
        eq(bank.userId, userId),
        isNull(bank.deletedAt),
      ),
    )
    .where(eq(cv.userId, userId))
    .orderBy(desc(adaptation.createdAt))

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
        row.bankId && row.bankName
          ? { id: row.bankId, name: row.bankName }
          : null,
    }
  })
}
