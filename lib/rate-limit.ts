import "server-only"

import { sql } from "drizzle-orm"
import { db } from "@/db"
import { rateLimit } from "@/db/schema"
import type { Result } from "@/lib/result"

/**
 * Per-user rate limiting for expensive server work — PDF render, AI-backed
 * file import, AI-backed GitHub import (see `odd/tasks/v1-readiness.md` T3).
 *
 * Backed by the `rate_limit` table rather than in-memory state because this
 * app runs on serverless Node functions with no guaranteed instance
 * affinity: two requests from the same session can land on two different
 * cold instances, so a per-process counter would just silently reset.
 *
 * `neon-http` (this app's Postgres driver) has no transactions — `db.
 * transaction` throws at runtime — so "read the window, decide if it
 * rolled over, write the new count" has to be ONE statement. See
 * `consumeRateLimit` below for how.
 */

export type RateLimitAction = "render-pdf" | "import-file" | "import-github"

type RateLimitConfig = {
  /** Max requests allowed inside one rolling window. */
  limit: number
  windowMinutes: number
}

const RATE_LIMITS: Record<RateLimitAction, RateLimitConfig> = {
  "render-pdf": { limit: 30, windowMinutes: 10 },
  "import-file": { limit: 10, windowMinutes: 60 },
  "import-github": { limit: 10, windowMinutes: 60 },
}

export type RateLimitCheck =
  { allowed: true } | { allowed: false; retryAfterSeconds: number }

/**
 * Atomically records one attempt at `action` for `userId` and reports
 * whether it is still within the configured limit.
 *
 * The single `INSERT ... ON CONFLICT` statement below IS the whole
 * algorithm, evaluated against one shared `now()` snapshot per statement:
 * - No row yet for this key -> insert `{ windowStart: now(), count: 1 }`.
 * - A row exists and its window already expired -> both `CASE` branches
 *   reset it to a fresh window of 1 (same as a brand new row).
 *   `rate_limit.window_start`/`rate_limit.count` here refer to the row's
 *   PRE-update values, per Postgres's own documented `ON CONFLICT DO
 *   UPDATE` upsert example (unqualified or table-qualified column names
 *   read the existing row; only `excluded.*` reads the proposed insert).
 * - A row exists and its window is still live -> keep `window_start`, bump
 *   `count` by one.
 *
 * `key` is the primary key, so Postgres takes a row-level lock for the
 * duration of this upsert — two requests racing for the same user are
 * serialized by the database itself, which is what makes this safe without
 * an app-level transaction.
 */
export async function consumeRateLimit(
  action: RateLimitAction,
  userId: string,
): Promise<RateLimitCheck> {
  const config = RATE_LIMITS[action]
  const key = `${action}:${userId}`

  const result = await db.execute<{
    window_start: string | Date
    count: number
  }>(sql`
    INSERT INTO ${rateLimit} (key, window_start, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      window_start = CASE
        WHEN ${rateLimit}.window_start <= now() - make_interval(mins => ${config.windowMinutes})
        THEN now()
        ELSE ${rateLimit}.window_start
      END,
      count = CASE
        WHEN ${rateLimit}.window_start <= now() - make_interval(mins => ${config.windowMinutes})
        THEN 1
        ELSE ${rateLimit}.count + 1
      END
    RETURNING window_start, count
  `)

  const row = result.rows[0]
  // Defensive only: `RETURNING` on a plain single-row upsert always yields
  // exactly one row. Fail open rather than block legitimate work on a
  // shape the driver should never actually produce.
  if (!row) return { allowed: true }

  if (Number(row.count) <= config.limit) return { allowed: true }

  const windowStartMs = new Date(row.window_start).getTime()
  const resetAtMs = windowStartMs + config.windowMinutes * 60_000
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((resetAtMs - Date.now()) / 1000),
  )
  return { allowed: false, retryAfterSeconds }
}

/**
 * Builds the `Result` failure value for a rejected `consumeRateLimit` call.
 * Typed `Result<never>` (not a specific `T`) so it can be returned directly
 * from any action's `Result<T>`-returning function regardless of its own
 * success payload — see `lib/result.ts`.
 */
export function rateLimitedResult(retryAfterSeconds: number): Result<never> {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  return {
    ok: false,
    error: `Hiciste muchas solicitudes seguidas. Probá de nuevo en ${minutes} ${
      minutes === 1 ? "minuto" : "minutos"
    }.`,
    code: "rate_limited",
    retryAfterSeconds,
  }
}
