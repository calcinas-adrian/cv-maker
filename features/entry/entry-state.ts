import "server-only"

import { and, count, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { bankEngagement, bankMaterial } from "@/db/schema"
import { getOrCreatePersonalBank } from "@/features/career-bank/ownership"
import { listUserCvs, type CvListItem } from "@/features/cv/list"

/**
 * What the landing screen should LEAD with, resolved from what the user
 * actually has.
 *
 * The home page is a router of emphasis, NOT of routes. Every stage renders
 * at `/dashboard` and the nav stays complete throughout: a redirect-based
 * state machine breaks bookmarks and the back button, and flashes a page the
 * user did not ask for. What changes between stages is which action is the
 * obvious one, not which actions exist.
 *
 * - `empty-bank` — nothing to build from. An empty bank is the worst first
 *   screen this app could show (a blank form asking someone to type their
 *   working life, with the reward several steps away), so this stage leads
 *   with the one gesture that fills it in bulk: import.
 * - `bank-ready` — material but no CVs. The bank is visibly full and the
 *   payoff is one click away, so lead with producing a CV.
 * - `working` — the CV list has earned the screen; both build actions stay
 *   available in the header.
 */
export type EntryStage = "empty-bank" | "bank-ready" | "working"

export type EntryState = {
  stage: EntryStage
  cvs: CvListItem[]
  /**
   * Live `bank_material` + `bank_engagement` rows. Not a display number —
   * it exists to answer "is there anything here" without loading the bank.
   */
  bankItemCount: number
}

/**
 * Resolves the landing state, and — as a deliberate side effect — GUARANTEES
 * the user's personal bank exists.
 *
 * That side effect fixes a real gap. `getOrCreatePersonalBank` is the single
 * creation point for the implicit personal bank, and until now it ran only
 * from `getBankPage`/`updateBankProfile` — i.e. the bank came into existence
 * only if you visited `/bank`. Both importers check for a bank with
 * `hasPersonalBank`/`findPersonalBank`, which are read-only ON PURPOSE (a
 * file upload must not silently mint a bank the user never asked for —
 * Decision 8). The two rules together meant a brand-new user who landed on
 * the dashboard and imported a PDF got the destination picker disabled and
 * forced to "this CV only", so the import could not reach the bank and the
 * bank stayed empty — exactly the flow the entry redesign is built around.
 *
 * Creating it here rather than loosening the importers keeps Decision 8
 * intact: the bank is created by ARRIVING at the app, which is an explicit,
 * user-initiated navigation, not as a hidden consequence of an upload. In
 * the steady state this is a plain indexed SELECT that finds the existing
 * row; the INSERT happens once per user, ever.
 */
export async function getEntryState(userId: string): Promise<EntryState> {
  const [cvs, bankRow] = await Promise.all([
    listUserCvs(userId),
    getOrCreatePersonalBank(userId),
  ])

  const [[materials], [engagements]] = await Promise.all([
    db
      .select({ value: count() })
      .from(bankMaterial)
      .where(
        and(
          eq(bankMaterial.bankId, bankRow.id),
          isNull(bankMaterial.deletedAt),
        ),
      ),
    db
      .select({ value: count() })
      .from(bankEngagement)
      .where(
        and(
          eq(bankEngagement.bankId, bankRow.id),
          isNull(bankEngagement.deletedAt),
        ),
      ),
  ])

  const bankItemCount = (materials?.value ?? 0) + (engagements?.value ?? 0)

  return {
    // A user with CVs is past onboarding even if they later emptied the
    // bank — going back to an import-led screen because someone deleted
    // their material would be the app forgetting who it is talking to.
    stage:
      cvs.length > 0
        ? "working"
        : bankItemCount > 0
          ? "bank-ready"
          : "empty-bank",
    cvs,
    bankItemCount,
  }
}
