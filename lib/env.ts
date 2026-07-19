import { z } from "zod"

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  PASSKEY_RP_ID: z.string().min(1),
  PASSKEY_RP_NAME: z.string().min(1),
  // 32-byte AES-256-GCM master key, hex-encoded (64 hex chars = 32 bytes).
  // Generate with `openssl rand -hex 32`. See lib/crypto.ts.
  ENCRYPTION_KEY: z.string().length(64),
})

export const env = envSchema.parse(process.env)
