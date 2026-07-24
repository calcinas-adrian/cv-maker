import "server-only"
import { headers } from "next/headers"
import { and, eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/db"
import { cv } from "@/db/schema"

/**
 * Shared ownership-check helpers, split out of `features/cv/actions.ts` so
 * other `"use server"` modules (e.g. `features/cv/theme/actions.ts`) can
 * reuse them without importing them through a `"use server"` file — every
 * export of a `"use server"` module becomes a public server action, which
 * these internal helpers (raw DB rows, no input validation) are not meant
 * to be.
 */

export async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user.id ?? null
}

/**
 * Loads a `cv` row scoped to both its id AND the given userId in a single
 * query. The cvId always comes from the client and is never trusted alone —
 * every action that touches a cv (or its children) goes through this.
 */
export async function findOwnedCv(cvId: string, userId: string) {
  const [row] = await db
    .select()
    .from(cv)
    .where(and(eq(cv.id, cvId), eq(cv.userId, userId)))
    .limit(1)
  return row ?? null
}
