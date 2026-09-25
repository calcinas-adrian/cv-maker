# v1 readiness

## Objective

Make cv-ai ready for its first version as a personal/family tool: functionally correct,
one initial database migration, explicit self-explanatory screens, and no technical blockers.

## Problem

The app is functionally complete (tsc, eslint and `next build` pass), but a launch diagnosis
(2026-09-25) found: three scattered migrations for a fresh v1 database, leftover Typst WASM
spike routes exposed without auth, no rate limiting on expensive server work, no custom error
pages, a destructive restore without confirmation, and several screens that leak jargon or raw
English errors to non-technical users.

## Why

The owner and family members must be able to use every screen without prior explanation, and
the database must start from a single clean baseline.

## Scope

In scope: migrations squash, spike removal, `/settings` redirect, error/not-found pages,
rate limiting (PDF render, file import, GitHub import), editor safety/clarity, help text.

Out of scope (owner decision): privacy policy, terms, account deletion, data export, landing
page, test runner (owner declined; see Engram "No test runner for cv-ai").

## Constraints

- Database is recreated from scratch; no data preservation needed.
- UI copy stays in Spanish (existing project language, voseo as already used); code and
  comments in English.
- Rate limit storage must work across serverless instances (Postgres-backed, neon-http has no
  transactions: single-statement upsert).

## Verification mode

- TDD: effectively off. Session requests strict TDD but the project has no test runner and the
  owner explicitly declined adding one. Source: Engram preference #172.
- Checks per task: `npx tsc --noEmit`, `pnpm lint`, `pnpm build` when routes/config change.
- RDD: off (global).

## Delivery

- Forecast: ~950 authored changed lines (~420 are spike deletions); generated migration SQL
  and snapshots excluded. Exceeds the ~400 budget.
- Strategy: ask-on-risk (default). Chain strategy: stacked-to-main (owner, 2026-09-25).
- Slices: PR1 = T1 · PR2 = T2 + T3 · PR3 = T4 · PR4 = T5 + T6.
- PR creation, push and merge remain the owner's decisions.

## Tasks

- [x] T1 Remove Typst WASM spike (page, API route, browser script) and stale comments
      referencing it; remove the `/settings` compatibility redirect (nothing links to it and
      the database starts fresh, so no bookmarks exist; T2's not-found page covers it).
      Route: inline (mechanical deletions, 2 comment edits).
      Evidence: tsc exit 0, lint exit 0, build exit 0 with no spike/settings routes.
      Commit: 9d0a825.
- [x] T2 Add custom `app/not-found.tsx`, `app/error.tsx`, `app/(dashboard)/error.tsx` in plain
      Spanish with a way back to the dashboard (shared `components/error-fallback.tsx`;
      raw error messages hidden, digest shown as reference). Also fixed `<html lang>` from
      `en` to `es`. Route: inline (5 small files, no design ambiguity).
      Evidence: tsc exit 0, lint exit 0, build exit 0; `/cv/[id]/edit` already calls
      `notFound()`, so missing CVs now land on the Spanish page.
      Commit: 3bd76f3.
- [x] T3 Postgres-backed rate limiter (`lib/rate-limit.ts` + `rate_limit` table) applied to
      `renderCvPdf`, `extractCvFromFile`, `extractFromRepo`; friendly Spanish message.
      Route: delegated writer (2+ non-trivial files; mapping trigger).
      Limits: render-pdf 30/10 min, import-file 10/60 min, import-github 10/60 min.
      Single atomic `INSERT ... ON CONFLICT DO UPDATE` (neon-http has no transactions).
      Render route maps `rate_limited` to HTTP 429 + `Retry-After`; import dialogs show the
      Spanish message through their existing error step. Migration `0003_rate_limit` (to be
      squashed in T6).
      Known limitation: the PDF download is a plain link, so any render error (401/404/429/500)
      shows as a plain text page — pre-existing behavior, left as is.
      Evidence: writer tsc/lint/build exit 0; parent spot check tsc exit 0.
      Commit: 775e844.
- [x] T4 Editor safety/clarity: confirm before restoring a version, rename/caption the YAML
      toggle, Spanish YAML/zod error messages, autosave failure recovery path.
      Route: delegated writer (6 files + new `components/ui/tooltip.tsx`).
      Restore dialog states the truth: restore does not snapshot the current draft
      (`features/cv/actions.ts` restoreVersion), but it is undoable with Ctrl+Z in-session.
      YAML toggle is now "Texto (avanzado)" with a tooltip; all yaml@2.9 error codes and
      zod@4 issue codes mapped to Spanish; autosave error badge gets "Reintentar".
      Evidence: writer tsc/lint/build exit 0; parent spot check tsc exit 0.
      Commit: ed19109.
- [x] T5 Help text: bank section descriptions (incl. "variante"), AI providers why + where to
      get a key, login passkey explanation, translate error guidance. Route: delegated writer
      (13 files). Every explanation verified against code (education/credentials/languages are
      copied verbatim, never AI-selected; skills and material reach the AI). "(básico)" became
      "(menos preciso para extraer datos)". Translate: `not_configured` was declared but never
      produced; now mapped from `provider_not_configured` and surfaced with a link to
      `/ai-providers`.
      Evidence: writer tsc/lint/build exit 0; parent spot check tsc/lint exit 0.
- [ ] T6 Squash migrations into a single initial migration generated from the final schema.
      Route: inline (drizzle-kit generate).

## Acceptance criteria

- Only `db/migrations/0000_*.sql` exists and matches `db/schema.ts`.
- No `typst-wasm-spike` route in the build output.
- Repeated render/import calls beyond the limit return a clear Spanish message, not an error.
- Every screen listed in the UX audit has a purpose line and no raw English errors.
- tsc, lint and build pass.

## Progress

- 2026-09-25: branch `feat/v1-readiness` created; document created.

## Next step

T1 after the chain strategy is confirmed.
