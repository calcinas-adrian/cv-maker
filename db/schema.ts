import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
} from "drizzle-orm/pg-core"
import type { CvData, CvTheme } from "@/schemas/cv.schema"

/**
 * Better Auth core tables — user, session, account, verification — plus the
 * passkey table added by the `@better-auth/passkey` plugin.
 *
 * Field shapes (which columns exist, nullability, defaults) are taken
 * directly from `@better-auth/core`'s `getAuthTables()` and from
 * `@better-auth/passkey`'s internal schema definition, so the Drizzle
 * adapter (`drizzleAdapter(db, { provider: "pg", schema })`) can map onto
 * these tables without a mismatch.
 *
 * CV domain tables (cv, experience, etc.) belong to a later phase and are
 * intentionally not defined here.
 */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// Added by the `@better-auth/passkey` plugin.
export const passkey = pgTable("passkey", {
  id: text("id").primaryKey(),
  name: text("name"),
  publicKey: text("public_key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  credentialID: text("credential_id").notNull().unique(),
  counter: integer("counter").notNull(),
  deviceType: text("device_type").notNull(),
  backedUp: boolean("backed_up").notNull(),
  transports: text("transports"),
  createdAt: timestamp("created_at").defaultNow(),
  aaguid: text("aaguid"),
})

/**
 * CV domain — Phase 2.
 *
 * `cv` is the top-level document, owned by a user. `experience`, `project`,
 * `education`, and `skill` are simple ordered child records owned by a `cv`.
 * `cv_version` stores full JSON snapshots of a CV's editable data for undo
 * history / restore, independent of the live `cv` row and its children.
 */

export const cv = pgTable("cv", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  fullName: text("full_name"),
  email: text("email"),
  phone: text("phone"),
  location: text("location"),
  summary: text("summary"),
  // Nullable, no DB default: NULL means "no theme chosen yet". Both render
  // paths (client preview + server export) coalesce NULL -> DEFAULT_THEME
  // at read time, whose values equal today's hardcoded classic.typ
  // literals, so pre-existing rows render byte-identically to before this
  // column existed. See sdd/cv-editor-panel/design Decision 2 + Migration.
  theme: jsonb("theme").$type<CvTheme>(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const experience = pgTable("experience", {
  id: text("id").primaryKey(),
  cvId: text("cv_id")
    .notNull()
    .references(() => cv.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  company: text("company").notNull(),
  role: text("role").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  bullets: jsonb("bullets").$type<string[]>().notNull().default([]),
})

export const project = pgTable("project", {
  id: text("id").primaryKey(),
  cvId: text("cv_id")
    .notNull()
    .references(() => cv.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  name: text("name").notNull(),
  description: text("description"),
  url: text("url"),
  bullets: jsonb("bullets").$type<string[]>().notNull().default([]),
})

export const education = pgTable("education", {
  id: text("id").primaryKey(),
  cvId: text("cv_id")
    .notNull()
    .references(() => cv.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  institution: text("institution").notNull(),
  degree: text("degree").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
})

export const skill = pgTable("skill", {
  id: text("id").primaryKey(),
  cvId: text("cv_id")
    .notNull()
    .references(() => cv.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  name: text("name").notNull(),
  category: text("category"),
})

export const cvVersion = pgTable("cv_version", {
  id: text("id").primaryKey(),
  cvId: text("cv_id")
    .notNull()
    .references(() => cv.id, { onDelete: "cascade" }),
  // null = automatic snapshot, non-null = user-named version.
  label: text("label"),
  snapshot: jsonb("snapshot").$type<CvData>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

/**
 * BYOK (bring-your-own-key) AI provider configuration — Phase 4.
 *
 * One row per (user, provider) the user has configured. `encryptedKey`
 * holds the AES-256-GCM ciphertext produced by `lib/crypto.ts` — the
 * plaintext key is never persisted. `baseURL` is only meaningful for the
 * "compatible" provider (a custom OpenAI-compatible endpoint); it's left
 * null for the named providers. `lastValidatedAt` is set only after a real
 * (successful) validation call against the provider — see
 * `features/ai-providers/actions.ts`.
 */
export const aiProviderKey = pgTable("ai_provider_key", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // "anthropic" | "openai" | "google" | "deepseek" | "compatible"
  encryptedKey: text("encrypted_key").notNull(),
  baseURL: text("base_url"), // only for "compatible"
  defaultModel: text("default_model"),
  lastValidatedAt: timestamp("last_validated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})
