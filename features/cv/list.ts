import "server-only"
import { and, desc, eq, isNull } from "drizzle-orm"
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
  return (
    db
      .select({ id: cv.id, title: cv.title, updatedAt: cv.updatedAt })
      .from(cv)
      // Soft-deleted CVs are invisible everywhere in the UI — this one filter
      // covers both the dashboard list and the sidebar.
      .where(and(eq(cv.userId, userId), isNull(cv.deletedAt)))
      .orderBy(desc(cv.updatedAt))
  )
}
