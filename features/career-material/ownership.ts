import "server-only"
import { headers } from "next/headers"
import { and, eq, isNull } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/db"
import { careerMaterial } from "@/db/schema"

/**
 * Shared ownership-check helpers for this feature, split out of
 * `actions.ts` for the same reason `features/cv/ownership.ts` is split out
 * of `features/cv/actions.ts`: every export of a `"use server"` module
 * becomes a public server action, which these internal helpers (raw DB
 * rows, no input validation) are not meant to be.
 */

export async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user.id ?? null
}

/**
 * Mirrors `features/cv/ownership.ts`'s `findOwnedCv`: loads a LIVE
 * `career_material` row scoped to both its id AND the given userId in a
 * single query. The id always comes from the client and is never trusted
 * alone — every mutation in `features/career-material/actions.ts` goes
 * through this first.
 *
 * `isNull(deletedAt)` lives here for the same reason it lives in
 * `findOwnedCv`: one place decides what "exists" means, so an update or a
 * delete can never land on a row the user already deleted.
 */
export async function findOwnedMaterial(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(careerMaterial)
    .where(
      and(
        eq(careerMaterial.id, id),
        eq(careerMaterial.userId, userId),
        isNull(careerMaterial.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}
