import "server-only"

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { passkey } from "@better-auth/passkey"
import { createId } from "@paralleldrive/cuid2"
import { db } from "@/db"
import * as schema from "@/db/schema"
import { env } from "@/lib/env"

/**
 * Server-only Better Auth instance.
 *
 * Golden rule: this file must never be imported from a client component —
 * it holds the GitHub OAuth client secret and the Better Auth secret.
 * Only server actions, route handlers, and server components may import it.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  advanced: {
    database: {
      // Keep id generation consistent with the rest of the app (cuid2),
      // instead of Better Auth's default random id generator.
      generateId: () => createId(),
    },
  },
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },
  plugins: [
    passkey({
      rpID: env.PASSKEY_RP_ID,
      rpName: env.PASSKEY_RP_NAME,
    }),
    // Must be last so it can intercept Set-Cookie headers from the plugins
    // above and apply them via Next.js's cookies() API.
    nextCookies(),
  ],
})
