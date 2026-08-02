"use server"

import { createId } from "@paralleldrive/cuid2"
import type { BatchItem } from "drizzle-orm/batch"
import { db } from "@/db"
import { cv } from "@/db/schema"
import { findPersonalBank } from "@/features/career-bank/ownership"
import { getSessionUserId } from "@/features/cv/ownership"
import {
  buildCvSectionQueries,
  flattenSectionBatch,
} from "@/features/cv/persist-sections"
import type { Result } from "@/lib/result"
import { bankCvSelectionSchema } from "@/schemas/cv-from-bank.schema"
import {
  loadSelectedBankRows,
  projectBankRowsToCvData,
} from "./build-cv-from-bank"
import { DEFAULT_BANK_CV_TITLE, NO_BANK_ERROR } from "./constants"

/**
 * Builds a CV from the bank with no AI and no source CV — the plain
 * projection half of `architecture/bank-produces-cv`.
 *
 * This is the path a brand-new user takes. It deliberately touches no
 * provider: this app is BYOK, so a first CV that needed a model would send
 * someone who has just imported their material off to paste an API key
 * before they have seen anything the app produced. Everything here is a
 * database read and one batched write, so the first CV is instant and free.
 *
 * The AI counterpart (`adaptBankForPosting` /
 * `createCvFromBankAdaptation` in `features/cv-adapt/actions.ts`) is a
 * separate, independently usable action, not a later stage of this one.
 */
export async function createCvFromBank(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId)
    return { ok: false, error: "No autenticado", code: "unauthenticated" }

  const parsed = bankCvSelectionSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Selección de banco inválida",
      code: "invalid_input",
    }
  }
  const selection = parsed.data

  // `findPersonalBank`, not `getOrCreatePersonalBank`: minting a bank here
  // would produce an empty one and then build an empty CV from it, which
  // reports success while doing nothing the user asked for. No bank is a
  // real, nameable failure — say so.
  const bankRow = await findPersonalBank(userId)
  if (!bankRow) {
    return { ok: false, error: NO_BANK_ERROR, code: "not_found" }
  }

  const rows = await loadSelectedBankRows(bankRow.id, selection)
  const data = projectBankRowsToCvData(selection, rows)

  const id = createId()
  const queries: BatchItem<"pg">[] = [
    db.insert(cv).values({
      id,
      userId,
      // The one path where `cv.bank_id` is set by a first-class "this CV
      // came from that bank" write rather than as a side effect of an
      // importer. `bankRow` is server-resolved from the session, so the
      // ownership invariant (`cv.user_id === bank.user_id`) holds by
      // construction.
      bankId: bankRow.id,
      title: selection.title.trim() || DEFAULT_BANK_CV_TITLE,
      // Contact identity comes from the bank row, never from the client —
      // the same guarantee D11 gives the adaptation path, which reads it
      // from the ownership-verified source CV. `fullName` falls back to the
      // bank's own `name` because for the implicit personal bank the two
      // coincide and only `name` is non-null (see `db/schema.ts`).
      fullName: bankRow.fullName ?? bankRow.name,
      email: bankRow.email,
      phone: bankRow.phone,
      location: bankRow.location,
      linkedinUrl: bankRow.linkedinUrl,
      websiteUrl: bankRow.websiteUrl,
      summary: data.summary ?? null,
    }),
    ...flattenSectionBatch(buildCvSectionQueries(id, data)),
  ]

  await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]])

  return { ok: true, data: { id } }
}
