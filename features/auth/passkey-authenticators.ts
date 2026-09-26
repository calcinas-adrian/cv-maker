/**
 * Best-effort map of common authenticator AAGUIDs to a human-readable
 * provider label, used to tell passkeys apart in the dashboard list (T6,
 * `odd/tasks/passkey-fixes.md`) when the user didn't name one.
 *
 * `@better-auth/passkey`'s server entry already ships an equivalent
 * `getAuthenticatorName`/`commonAuthenticatorNames` pair
 * (`node_modules/.../@better-auth/passkey/dist/index.mjs`,
 * "authenticator-metadata" region), but that module also statically imports
 * `@simplewebauthn/server` — a Node-targeted package (`engines.node >= 20`,
 * no `browser` field, no `sideEffects: false`, pulls in `@peculiar/asn1-*`
 * / `@peculiar/x509` for attestation verification) that this "use client"
 * dialog never needs. Bundlers can't safely tree-shake an unused import out
 * of a package without `sideEffects: false` on every dependency in the
 * chain, so importing it here would risk shipping that server-only crypto
 * code to the browser. This file duplicates the small lookup instead.
 *
 * AAGUIDs sourced from
 * https://github.com/passkeydeveloper/passkey-authenticator-aaguids
 * (`aaguid.json`, fetched 2026-09-26); names mirror that source, translated
 * only where it's a plain "on <OS>" qualifier. The list is intentionally
 * small: an AAGUID identifies an authenticator *model*, not a device or
 * user, most authenticators are missing from any such list, and
 * privacy-preserving platforms (notably Apple, under the default
 * `attestation: "none"` registration flow) report an all-zero AAGUID that
 * matches nothing here.
 */

const ANONYMOUS_AAGUID = "00000000-0000-0000-0000-000000000000"

const AUTHENTICATOR_LABELS: Record<string, string> = {
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain (gestionada)",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome en Mac",
  "771b48fd-d3d4-4f74-9232-fc157ab0507a": "Edge en Mac",
  "bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
  "531126d6-e717-415c-9320-3d9aa6981239": "Dashlane",
  "53414d53-554e-4700-0000-000000000000": "Samsung Pass",
  "d3452668-01fd-4c12-926c-83a4204853aa": "Microsoft Password Manager",
  "50726f74-6f6e-5061-7373-50726f746f6e": "Proton Pass",
}

/**
 * Resolves a best-effort provider label for an authenticator AAGUID, or
 * `undefined` when it's missing, empty, or the privacy-preserving all-zero
 * value.
 *
 * @example
 * ```ts
 * const label = passkey.name || getAuthenticatorLabel(passkey.aaguid) || "Passkey sin nombre"
 * ```
 */
export function getAuthenticatorLabel(
  aaguid: string | null | undefined,
): string | undefined {
  const normalized = aaguid?.trim().toLowerCase()
  if (!normalized || normalized === ANONYMOUS_AAGUID) return undefined
  return AUTHENTICATOR_LABELS[normalized]
}
