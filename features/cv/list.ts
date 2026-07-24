import "server-only"
import { desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { cv } from "@/db/schema"

export type CvListItem = {
  id: string
  title: string
  updatedAt: Date
}

/**
 * Shared CV list query.
 *
 * Used by both `/dashboard` (the full CV-list landing page) and the
 * persistent sidebar rendered by `app/(dashboard)/cv/layout.tsx` — one
 * query, instead of each call site duplicating the same `db.select`. See
 * `sdd/cv-editor-panel/design` Decision 1 / File Changes table.
 */
export async function listUserCvs(userId: string): Promise<CvListItem[]> {
  return db
    .select({ id: cv.id, title: cv.title, updatedAt: cv.updatedAt })
    .from(cv)
    .where(eq(cv.userId, userId))
    .orderBy(desc(cv.updatedAt))
}
