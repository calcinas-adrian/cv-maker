import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { env } from "@/lib/env"

/**
 * AES-256-GCM encryption for at-rest secrets (currently: user-supplied AI
 * provider API keys — see `db/schema.ts`'s `aiProviderKey.encryptedKey`).
 *
 * Design notes (reviewed, not just copied from a sketch):
 * - IV length is 12 bytes (96 bits). This is the length GCM is designed for
 *   and the one Node's `createCipheriv`/`createDecipheriv` expect for
 *   "aes-256-gcm" — a 16-byte IV would still run, but silently degrades
 *   GCM's authentication guarantees (it gets re-hashed via GHASH instead of
 *   used directly as the counter block), so 12 is deliberate, not
 *   incidental.
 * - The auth tag IS verified on decrypt: `setAuthTag` is called before
 *   `final()`, and `final()` is what actually checks the tag against the
 *   ciphertext — it throws if they don't match (tampered/corrupted payload
 *   or wrong key), so a caught exception here always means "reject this
 *   payload", never "silently return garbage".
 * - Key management gotcha worth flagging explicitly: `ENCRYPTION_KEY` is a
 *   single static master key (32 bytes / 256 bits, hex-encoded — enforced
 *   by `lib/env.ts`'s `z.string().length(64)`), not per-user envelope
 *   encryption or a KMS-backed key. That's an acceptable tradeoff for a
 *   BYOK MVP, but it means: (1) rotating `ENCRYPTION_KEY` invalidates every
 *   row already encrypted with the old key — there is no re-encryption
 *   migration here, so a rotation must re-collect keys from users, and
 *   (2) anyone with read access to both the DB and this env var can
 *   decrypt every stored key, so treat `ENCRYPTION_KEY` with the same care
 *   as `BETTER_AUTH_SECRET` (never logged, never sent to the client).
 */

const key = Buffer.from(env.ENCRYPTION_KEY, "hex")

export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [iv, authTag, encrypted].map((buf) => buf.toString("base64")).join(".")
}

export function decrypt(payload: string): string {
  const parts = payload.split(".")
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted payload")
  }

  const [iv, authTag, encrypted] = parts.map((part) =>
    Buffer.from(part, "base64"),
  )

  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  // Must be set before final() — final() is what verifies it.
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])
  return decrypted.toString("utf8")
}
