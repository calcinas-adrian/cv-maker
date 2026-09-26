/**
 * WebAuthn Signal API: lets a relying party (this app) tell the browser/OS
 * passkey provider that its view of a user's credentials is stale, so the
 * provider stops offering deleted ones in the picker/autofill dropdown. This
 * is the fix for the owner's report (T5, `odd/tasks/passkey-fixes.md`): after
 * a DB wipe, old passkeys kept showing up in the browser picker and choosing
 * one silently did nothing (the credential exists in the authenticator but
 * not in the server DB anymore).
 *
 * Sources (fetched 2026-09-26):
 * - https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredential/signalUnknownCredential_static
 *   `signalUnknownCredential({ rpId, credentialId })` -> `Promise<undefined>`.
 *   Both fields are strings; `credentialId` is the base64url-encoded id the
 *   browser just sent. Call it right after a sign-in attempt is rejected
 *   because the server doesn't recognize the credential.
 * - https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredential/signalAllAcceptedCredentials_static
 *   `signalAllAcceptedCredentials({ rpId, userId, allAcceptedCredentialIds })`
 *   — `userId` is the base64url-encoded WebAuthn user HANDLE used at
 *   registration time (not this app's user id). NOT implemented here: this
 *   app's better-auth passkey plugin mints a fresh random 32-char handle on
 *   every single registration call (`new TextEncoder().encode(
 *   generateRandomString(32, "a-z", "0-9"))` in
 *   `@better-auth/passkey/dist/index.mjs`, generate-register-options
 *   handler) and never persists it, so there is no stable, client-derivable
 *   user handle to pass. See `passkey-dialog.tsx` for where this was
 *   evaluated.
 * - https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredential/signalCurrentUserDetails_static
 *   `signalCurrentUserDetails({ rpId, userId, name, displayName })` — same
 *   stable-user-handle requirement as above; skipped for the same reason.
 * - https://developer.chrome.com/docs/identity/webauthn-signal-api — as of
 *   this writing, all three methods ship only in Chrome/Edge 132+; Firefox
 *   has no announced plans and Safari hasn't implemented them, hence the
 *   feature detection below.
 * - https://www.w3.org/TR/webauthn-3/#sctn-signal-methods — normative
 *   definition (WebAuthn Level 3).
 *
 * Every call here is feature-detected and best-effort: a provider that
 * ignores or doesn't support a signal must never break sign-in, so failures
 * are swallowed rather than surfaced to the user (the login page already
 * shows its own mapped error message independently of this call).
 */

/** A base64url-encoded string, e.g. a WebAuthn credential id. */
type Base64URLString = string

/**
 * The three Signal API static methods. `lib.dom.d.ts` in the installed
 * TypeScript (5.9.3) doesn't declare them yet — verified: no match for
 * `signalUnknownCredential` (or the other two) in
 * `node_modules/typescript/lib/lib.dom.d.ts`. The DOM's `PublicKeyCredential`
 * constructor is declared as `declare var PublicKeyCredential: { ... }` (an
 * anonymous object type on a `var`), not a named `interface`, so it cannot be
 * extended by declaration merging. This interface plus the narrow cast in
 * `getSignalStatics` is the smallest way to add the missing methods without
 * reaching for `any`.
 */
interface PublicKeyCredentialSignalStatics {
  signalUnknownCredential?(options: {
    rpId: string
    credentialId: Base64URLString
  }): Promise<undefined>
}

function getSignalStatics(): PublicKeyCredentialSignalStatics | undefined {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return undefined
  }
  return window.PublicKeyCredential as unknown as PublicKeyCredentialSignalStatics
}

/**
 * Tells the browser/OS passkey provider that `credentialId` is unknown to
 * the server. `rpId` must match the server's actual WebAuthn rpID
 * (`lib/env.ts`'s `PASSKEY_RP_ID`, passed as `rpID` in `lib/auth.ts`) or the
 * browser rejects the call with `SecurityError` (swallowed below either
 * way).
 *
 * This app has no `NEXT_PUBLIC_*` env var today (`rg NEXT_PUBLIC_` finds
 * none) and only ever runs as a single host per deployment — no
 * subdomain/parent-domain rpID setup exists anywhere in the codebase — so
 * `window.location.hostname` is used directly instead of exposing
 * `PASSKEY_RP_ID` through a new public env var. This is safe here for a
 * stronger reason than convenience: WebAuthn itself requires the effective
 * domain (the hostname) to equal, or be a subdomain of, the real rpID for
 * any ceremony to succeed at all. If they ever diverged, passkey sign-in
 * would already be broken on that host independently of this call, so
 * reusing the hostname adds no new failure mode. If this app ever adopts a
 * parent-domain rpID for cross-subdomain sign-in, switch this to an
 * explicitly exposed `NEXT_PUBLIC_PASSKEY_RP_ID` instead.
 */
export async function signalUnknownPasskey(options: {
  rpId: string
  credentialId: string
}): Promise<void> {
  const statics = getSignalStatics()
  if (!statics?.signalUnknownCredential) return
  try {
    await statics.signalUnknownCredential(options)
  } catch {
    // Best-effort only — never surface a Signal API failure to the user.
  }
}
