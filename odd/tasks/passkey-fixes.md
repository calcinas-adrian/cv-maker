# Passkey fixes

## Objective

Adding a passkey and signing in with one work reliably, and every failure shows a clear
Spanish message with a way forward.

## Problem

Owner reports the passkeys area "shows failures". Research (2026-09-26, installed
better-auth 1.6.23 source + official docs) found app-level causes, not library bugs:

1. `addPasskey` requires a fresh session (`registration.requireSession` default true,
   `session.freshAge` default 24h: `better-auth/dist/api/routes/session.mjs:361-364`).
   GitHub sessions older than 24h get `403 SESSION_NOT_FRESH`.
2. `addPasskey()` / `signIn.passkey()` never throw; they return `{ data, error }`
   (docs: better-auth.com/docs/plugins/passkey). The app's `try/catch` is dead code, so
   failures (including #1) are silent and success has no feedback.
3. Login conditional UI (`signIn.passkey({ autoFill: true })`) ignores its result: a
   successful autofill sign-in never redirects. No `isConditionalMediationAvailable` gate.
4. No way to see, name or delete registered passkeys.

Client error codes are raw SimpleWebAuthn codes (`ERROR_CEREMONY_ABORTED`,
`ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED`, `ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY`, ...),
not the plugin enum (upstream issue better-auth#10447); sign-in errors always carry the
message "Auth cancelled".

## Scope

In scope: patch bump to better-auth / @better-auth/passkey 1.6.33 (latest 1.6.x; no
passkey fixes but security fixes elsewhere), result/error handling, re-auth path for
stale sessions, autofill redirect, passkey list/rename/delete. Out of scope: 1.7.x upgrade
(1.7.3+ adds strict schema validation; needs a separate schema audit).

## Constraints

- UI copy in Spanish (existing voseo); code in English.
- Keep `requireSession` and the 24h freshness (security): on `SESSION_NOT_FRESH`, offer to
  sign in again with GitHub and come back to the dashboard.

## Verification mode

- TDD: off (no test runner; owner declined, Engram #172).
- Checks: `npx tsc --noEmit -p .`, `pnpm lint`, `pnpm build`.
- RDD: off (global).

## Delivery

- Forecast ~250 authored lines: single PR. Branch `fix/passkeys` from local `main`.

## Tasks

- [x] T1 Bump `better-auth` and `@better-auth/passkey` to 1.6.33 (lockfile). Route: delegated
      writer. No 1.7.x in lockfile. Evidence: tsc/lint/build exit 0. Commit: 44c0a1f.
- [x] T2 Shared passkey error mapper (raw codes + server codes → Spanish messages; cancel
      is silent). Add-passkey: handle `{ error }`, `SESSION_NOT_FRESH` → toast with
      "Volver a iniciar sesión" action (GitHub, callback `/dashboard`), success toast.
      Login: gate autofill on `isConditionalMediationAvailable`, redirect on autofill
      success, show button errors (except cancel).
      Route: delegated writer. Error shape verified in installed source (`error.code`,
      `SESSION_NOT_FRESH` = 403). `features/auth/passkey-errors.ts` is code-driven; parent
      review removed the `error.message` fallback (English library text).
      Evidence: tsc/lint exit 0 (writer + parent). Commits: 6cf5c56, fix in docs commit.
- [x] T3 Passkey management dialog on the dashboard (replaces the bare add button): list
      (name, created date), add (optional name), rename, delete with confirmation, empty
      state + help text.
      Route: delegated writer. `features/auth/passkey-dialog.tsx` uses
      `listUserPasskeys` / `updatePasskey` / `deletePasskey`; `add-passkey-button.tsx` deleted.
      Evidence: tsc/lint/build exit 0. Commit: e299c8f.

- [x] T4 Login feedback: visible progress while a passkey sign-in (button or autofill) is
      being verified, success toast before redirect, mapped error otherwise. Owner report:
      "no sé si fue exitoso o no".
      Route: delegated writer. Autofill flips to "verificando" via verify-call `onRequest`
      (fetchOptions only reach the verify POST, client.mjs:41); autofill no longer drops
      `error`. Evidence: tsc/lint exit 0. Commit: bfd4903.
- [x] T5 Stale passkeys (owner report: after the DB wipe, old passkeys still show in the
      browser picker, choosing one does nothing): on `PASSKEY_NOT_FOUND` explain it and call
      WebAuthn Signal API `PublicKeyCredential.signalUnknownCredential` with the credential
      id used; after sign-in / when listing, call `signalAllAcceptedCredentials` if the
      registered user handle is stable. Feature-detected; manual-removal help otherwise.
      Route: delegated writer. Credential id from `returnWebAuthnResponse: true`; rpId =
      `window.location.hostname`. Signal only on `PASSKEY_NOT_FOUND`, which the server raises
      solely when the credentialID lookup misses (passkey `index.mjs:431`, parent-verified).
      `signalAllAcceptedCredentials` skipped: better-auth mints a random user handle per
      registration and never stores it (`index.mjs:159`). Chrome/Edge 132+ only.
      Evidence: tsc/lint exit 0. Commit: 96cea3d.
- [x] T6 Tell passkeys apart in the dashboard list: provider name from AAGUID (small map
      of common providers), synced vs this-device (`backedUp`/`deviceType`), default name
      on add from the provider.
      Route: delegated writer. Client-safe `features/auth/passkey-authenticators.ts` (14
      AAGUIDs from passkeydeveloper list; plugin's own map lives in a server-only entry).
      Evidence: tsc/lint/build exit 0; no server crypto in client chunks. Commit: 8dda685.

## Acceptance criteria

- No passkey call relies on `try/catch` for API failures.
- Stale session → user sees why and can re-authenticate in one click.
- Autofill sign-in lands on `/dashboard`.
- Passkeys can be listed, renamed and deleted.
- tsc, lint, build pass.

## Progress

- 2026-09-26: branch `fix/passkeys` created; document created.

- 2026-09-26: T1-T3 done. WebAuthn ceremonies not exercised in a real browser.

- 2026-09-26: owner browser test found T4-T6 issues; tasks added.
- 2026-09-26: T4-T6 done; merged into local main. Browser re-test pending.

## Next step

Owner: try add (with a >24h session → re-login action), rename, delete, button sign-in and
autofill sign-in in the browser; then push `main`.
