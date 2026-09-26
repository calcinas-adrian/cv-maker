/**
 * Spanish error mapping shared by every passkey flow (sign-in, add, rename,
 * delete). `authClient.passkey.*` and `authClient.signIn.passkey` never
 * throw — they resolve to `{ data, error }` — so this is the one place that
 * turns whatever `error` they hand back into either a message to show or
 * `null` to mean "the user cancelled, say nothing".
 *
 * The shape of `error` and every code below were verified against the
 * INSTALLED `better-auth`/`@better-auth/passkey` 1.6.33 source, not the
 * docs:
 *
 * - `node_modules/@better-auth/passkey/dist/client.mjs` — `addPasskey`
 *   catches `WebAuthnError` and returns `{ code: e.code, message, status:
 *   400, statusText: "BAD_REQUEST" }` for registration; `signIn.passkey`'s
 *   ceremony catch instead ALWAYS sends the generic "Auth cancelled"
 *   message while still preserving the real `code`, which is why this
 *   mapper is code-driven and never trusts `error.message`.
 * - `node_modules/@better-auth/passkey/dist/version-C_c5hmzA.mjs` — the
 *   plugin's own error enum (`PASSKEY_ERROR_CODES`).
 * - `node_modules/.pnpm/@better-auth+core@.../error/index.mjs` —
 *   `APIError.from(status, { code, message })` is what the server throws;
 *   `node_modules/.pnpm/better-call@.../dist/to-response.mjs` turns that
 *   into a JSON body of exactly `{ code, message }`.
 * - `node_modules/.pnpm/@better-fetch+fetch@.../dist/index.js` — the client
 *   merges that JSON body with `{ status, statusText }` to build `error`.
 *   So a server rejection like `SESSION_NOT_FRESH` surfaces as
 *   `error.code === "SESSION_NOT_FRESH"` with `error.status === 403`.
 * - `node_modules/.pnpm/better-auth@.../dist/api/routes/session.mjs:367` —
 *   `freshSessionMiddleware` is what throws `SESSION_NOT_FRESH`, confirming
 *   the 403 above.
 * - `node_modules/.pnpm/@simplewebauthn+browser@.../esm/helpers/
 *   identify{Registration,Authentication}Error.js` — the raw WebAuthn
 *   ceremony codes (`ERROR_CEREMONY_ABORTED`, `ERROR_PASSTHROUGH_SEE_CAUSE_
 *   PROPERTY`, `ERROR_INVALID_RP_ID`, `ERROR_INVALID_DOMAIN`, ...). Every
 *   `ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY` originates from the browser's
 *   `NotAllowedError`, which fires on both an explicit cancel AND a
 *   ceremony timeout — the two are indistinguishable here, so both stay
 *   silent.
 */

export type PasskeyClientError =
  | {
      code?: string
      message?: string
      status?: number
      statusText?: string
    }
  | null
  | undefined

export type PasskeyErrorMapping = { message: string } | null

/**
 * Narrows `error.code` out of the client's return union — one branch of it
 * has no `code` at all (see the file docstring), so a plain `error?.code`
 * does not type-check. Callers that need to special-case one code (e.g.
 * `SESSION_NOT_FRESH`, to attach a sonner action) before falling back to
 * `mapPasskeyError` use this instead of reaching into `error` directly.
 */
export function getPasskeyErrorCode(
  error: PasskeyClientError,
): string | undefined {
  return error && "code" in error ? error.code : undefined
}

/**
 * Codes that mean "the user backed out (or the ceremony timed out)", never
 * a real failure. `REGISTRATION_CANCELLED` never actually reaches `.code`
 * in the installed source (it only names a message string internally) but
 * is matched here too in case a future patch surfaces it directly.
 */
const SILENT_CODES = new Set([
  "ERROR_CEREMONY_ABORTED",
  "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
  "AUTH_CANCELLED",
  "REGISTRATION_CANCELLED",
])

/**
 * Maps a passkey `error` to a Spanish message, or `null` when it should stay
 * silent. `flow: "sign-in"` swaps in the sign-in-specific `PASSKEY_NOT_FOUND`
 * copy (point the user back to GitHub); every other flow (add, rename,
 * delete, list) gets the generic wording.
 */
export function mapPasskeyError(
  error: PasskeyClientError,
  { flow }: { flow?: "sign-in" } = {},
): PasskeyErrorMapping {
  if (!error) return null

  const code = error.code
  if (code && SILENT_CODES.has(code)) return null

  switch (code) {
    case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED":
    case "PREVIOUSLY_REGISTERED":
      return { message: "Esta passkey ya está registrada en tu cuenta." }
    case "SESSION_NOT_FRESH":
      return {
        message:
          "Por tu seguridad, agregar una passkey necesita un inicio de sesión reciente.",
      }
    case "PASSKEY_NOT_FOUND":
      return flow === "sign-in"
        ? {
            message:
              "No encontramos esa passkey. Iniciá sesión con GitHub y agregala de nuevo.",
          }
        : { message: "No encontramos esa passkey." }
    case "ERROR_INVALID_RP_ID":
    case "ERROR_INVALID_DOMAIN":
      return {
        message: "Este dominio no está habilitado para passkeys todavía.",
      }
    case "CHALLENGE_NOT_FOUND":
      return {
        message: "La operación tardó demasiado y expiró. Probá de nuevo.",
      }
    case "FAILED_TO_VERIFY_REGISTRATION":
      return { message: "No se pudo verificar la passkey. Probá de nuevo." }
    case "AUTHENTICATION_FAILED":
      return { message: "No se pudo verificar la passkey." }
    case "UNABLE_TO_CREATE_SESSION":
      return {
        message:
          "No se pudo iniciar sesión después de validar la passkey. Probá de nuevo.",
      }
    case "FAILED_TO_UPDATE_PASSKEY":
      return { message: "No se pudo renombrar la passkey." }
    default:
      return {
        message:
          error.message || "No se pudo completar la operación. Probá de nuevo.",
      }
  }
}
