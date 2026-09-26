# Mobile layout

## Objective

Every screen is usable without horizontal overflow from 360px phones up to wide desktops,
including intermediate widths (tablets, narrow desktop windows).

## Problem

Audit (2026-09-26) found:

- `/cv/[id]/edit` workspace (`features/cv/workspace/cv-workspace-shell.tsx`) is a 3-pane
  resizable group whose pixel `minSize` floors sum to ~900px (220 + 360 + 320). Below ~920px
  viewport the page overflows horizontally; there is no stacked/mobile alternative.
- Editor header (`features/cv/cv-editor.tsx`) holds a title + autosave badge + 4 labelled
  buttons in a non-wrapping row; it is clipped whenever the editor pane is < ~750px, which
  happens even on 1024-1280px desktops.
- Dashboard header (`app/(dashboard)/dashboard/page.tsx`) has title + 3 buttons without wrap.
- ~12 form grids use `grid-cols-2` without a `sm:` prefix (bank, CV sections, import dialogs).
- AI provider model rows lack `min-w-0`/`truncate` for long model ids.

## Scope

In scope: the issues above plus their loading skeletons. Out of scope: visual redesign,
new features, JS viewport detection beyond what the workspace switcher needs.

## Constraints

- CSS-breakpoint-first (Tailwind v4). UI copy in Spanish (existing voseo), code in English.
- Keep the resizable 3-pane layout from `lg` (1024px) up; below `lg` show one pane at a time
  with a pane switcher ("Mis CVs" / "Editor" / "Vista previa"), defaulting to the editor.

## Verification mode

- TDD: off (no test runner; owner declined, Engram #172).
- Checks per task: `npx tsc --noEmit -p .`, `pnpm lint`, `pnpm build`.
- RDD: off (global).

## Delivery

- Forecast: ~250 authored changed lines, under the ~400 budget: single PR.

## Tasks

- [x] T1 CV workspace: below `lg` render a single-pane view with a pane switcher instead of
      the resizable group; `lg`+ keeps the resizable panels. Skeleton follows the same rule.
      Editor header wraps (`flex-wrap`, actions allowed to go to a second row) and its
      loading skeleton mirrors it. Route: delegated writer (4+ files).
      New `hooks/use-media-query.ts` picks one tree (never both: editor autosave + preview
      WASM must not double-mount); mobile panes stay mounted and toggle `hidden`.
      Parent review found the hook defaulted to `false` during hydration, so desktop loads
      mounted the mobile tree then swapped it; fixed by returning `null` until known and
      showing the skeleton meanwhile.
      Accepted risk: resizing a live window across 1024px remounts the editor (edits inside
      the ~2s autosave debounce can be lost).
      Evidence: writer tsc/lint/build exit 0; parent tsc/lint/build exit 0 after fix.
      Commits: c049ace, fc06bb1.
- [x] T2 Dashboard header wraps/stacks on phones (+ loading skeleton); all unprefixed
      `grid-cols-2` form grids become `grid-cols-1 sm:grid-cols-2`; provider model rows get
      `min-w-0` + `truncate`. Route: delegated writer (~15 mechanical files).
      16 grids in 13 files; `break-words` on material/memory content.
      Evidence: writer tsc/lint/build exit 0. Commit: 7a09b14.

## Acceptance criteria

- No horizontal page overflow on `/cv/[id]/edit`, `/dashboard`, `/bank`, `/ai-providers`,
  `/applications` at 360, 414, 768, 820, 1024, 1280px.
- tsc, lint and build pass.

## Progress

- 2026-09-26: branch `feat/mobile-layout` created from `feat/v1-readiness`; document created.
- 2026-09-26: T1 and T2 done. No browser check was possible (manual check pending).

## Next step

Owner: check `/cv/[id]/edit`, `/dashboard`, `/bank` at 360, 414, 768, 820, 1024 and 1280px
in devtools; then decide on push/PR.
