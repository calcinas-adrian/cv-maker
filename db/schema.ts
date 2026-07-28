import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
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
 *
 * DELETION POLICY. `cv` is soft-deleted (`deleted_at`); its children are
 * not, and must not be. `features/cv/persist-sections.ts` rewrites every
 * child table on EVERY autosave via delete-all + reinsert, so a
 * `deleted_at` on a child would accumulate a dead row per item per save
 * and grow without bound. Undo for an individual section item is already
 * covered by `cv_version` snapshots + `restoreVersion`, which is the right
 * granularity for "I removed a bullet by accident".
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
  // Soft delete. NULL = live, non-NULL = the user deleted it. Nothing in
  // the app ever hard-deletes a cv row: "delete" in the UI sets this, and
  // recovery is a manual, out-of-band request (see `scripts/restore.ts`).
  //
  // The child tables below deliberately do NOT get this column, and that
  // is what makes restore trivial: soft-deleting a cv touches no child
  // row, so setting this back to NULL brings the sections, versions and
  // adaptations back exactly as they were. See the note on
  // `buildCvSectionQueries` in `features/cv/persist-sections.ts` for why
  // the children cannot carry a `deleted_at` of their own.
  deletedAt: timestamp("deleted_at"),
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

export const achievement = pgTable("achievement", {
  id: text("id").primaryKey(),
  cvId: text("cv_id")
    .notNull()
    .references(() => cv.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  title: text("title").notNull(),
  issuer: text("issuer"),
  // Free text, not a real date — same convention as `experience.start_date`:
  // a CV says "Mar 2023" or "2023", never a timestamp.
  date: text("date"),
  description: text("description"),
})

// Holds PERSONAL DATA OF THIRD PARTIES (a referee's name, email, phone) —
// people who are not this app's users and never consented here. Treat it
// accordingly: it inherits `onDelete: "cascade"` from `cv` so removing a CV
// removes the referees with it, and it must stay out of any AI extraction
// or adaptation corpus (see `features/cv-adapt/build-material-corpus.ts`,
// which deliberately does not read this table).
export const reference = pgTable("reference", {
  id: text("id").primaryKey(),
  cvId: text("cv_id")
    .notNull()
    .references(() => cv.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  name: text("name").notNull(),
  role: text("role"),
  company: text("company"),
  email: text("email"),
  phone: text("phone"),
})

// No `deleted_at` here on purpose. The only delete that touches this table
// is the automatic prune of stale unlabeled snapshots in
// `features/cv/actions.ts` — that prune IS this table's garbage collector,
// and soft-deleting from it would defeat the one job it has (bounding
// growth). Labeled versions are never pruned, and the user has no UI to
// delete a version, so nothing here is an accidental user deletion.
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
 * Adaptation provenance — Phase 5. One row per CV generated from a job
 * posting. No `userId`: reached via `cv.userId`, same satellite pattern as
 * `cv_version`. `sourceCvId` is `set null` (not cascade) so deleting the
 * CV an adaptation was derived FROM never deletes the adapted CV itself.
 *
 * `adaptationNotes` lives HERE rather than in a satellite table of its own.
 * It is a single-valued attribute of the adaptation event, functionally
 * dependent on this row's whole primary key and on nothing else — that is
 * already 3NF. A 1:1 side table would add a join and a possible orphan row
 * while removing no redundancy, which is the opposite of what normalising
 * is for. Nullable because every row written before this column existed
 * genuinely has no notes; "unknown" is the honest value, not `''`.
 */
export const cvAdaptation = pgTable("cv_adaptation", {
  id: text("id").primaryKey(),
  cvId: text("cv_id")
    .notNull()
    .references(() => cv.id, { onDelete: "cascade" }),
  sourceCvId: text("source_cv_id").references(() => cv.id, {
    onDelete: "set null",
  }),
  jobPostingText: text("job_posting_text").notNull(),
  adaptationNotes: text("adaptation_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

/**
 * Career-material bank — Phase 5. Manual-only (D1): nothing ever writes
 * here implicitly. Which context column is meaningful is decided by `kind`
 * (company+role for experience_bullet, projectName for project_bullet,
 * neither for skill/summary_note). Education is deliberately absent —
 * degrees are facts, not tailorable material, and come from the source CV.
 * Skill category rides in `tags`.
 */
export const careerMaterial = pgTable("career_material", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // "experience_bullet" | "project_bullet" | "skill" | "summary_note"
  kind: text("kind").notNull(),
  company: text("company"),
  role: text("role"),
  projectName: text("project_name"),
  content: text("content").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // Soft delete — see the note on `cv.deletedAt`. Bank items are hand-written
  // by the user and cannot be recovered from anywhere else (unlike a derived
  // item, which `listDerivedMaterial` can always recompute from a CV), so
  // this is exactly the case where an accidental click is expensive.
  deletedAt: timestamp("deleted_at"),
})

/**
 * BYOK (bring-your-own-key) AI provider configuration — Phase 4,
 * normalized in Phase 6.
 *
 * This table holds the CREDENTIAL only. `encryptedKey` is the AES-256-GCM
 * ciphertext produced by `lib/crypto.ts` — the plaintext is never
 * persisted. `baseURL` is only meaningful for the "compatible" provider (a
 * custom OpenAI-compatible endpoint) and stays null for the named ones.
 * `lastValidatedAt` is set only after a real successful call against the
 * provider (see `features/ai-providers/actions.ts`).
 *
 * The `default_model` column that used to live here is GONE — see
 * `aiProviderModel` below. Keeping a model on the credential row conflated
 * two independent concerns and made "use a second model with the same key"
 * impossible without re-entering the key and duplicating the secret, which
 * in turn would have made key rotation an N-row operation.
 */
export const aiProviderKey = pgTable("ai_provider_key", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // "anthropic" | "openai" | "google" | "deepseek" | "compatible"
  encryptedKey: text("encrypted_key").notNull(),
  baseURL: text("base_url"), // only for "compatible"
  lastValidatedAt: timestamp("last_validated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Soft delete — see the note on `cv.deletedAt`. Be aware of what this
  // means HERE specifically, because it differs from the other tables: a
  // soft-deleted credential still holds `encrypted_key`, so the ciphertext
  // of an API key the user "removed" stays in the database until someone
  // purges it out of band. That is a deliberate, owner-accepted trade for a
  // personal-use deployment — re-entering a provider key means minting a
  // new one at the provider, which is the exact cost this policy avoids.
  // If this app is ever shared beyond that, revisit this column first:
  // a revoked credential is the one thing users expect to actually vanish.
  deletedAt: timestamp("deleted_at"),
})

/**
 * Models registered against a credential — Phase 6. One credential, N
 * models: the whole point of splitting this out of `ai_provider_key`.
 *
 * `onDelete: "cascade"` is intentional and correct: a model entry without
 * its credential cannot authenticate, so it has no meaning on its own.
 * Deleting ONE model is a delete on this table and leaves both the
 * credential and its sibling models untouched — that is the operation
 * users actually want, and the reason cascading from the parent is not a
 * hazard here.
 *
 * No `userId` column: ownership is reached through `providerKeyId ->
 * ai_provider_key.userId`, the same satellite pattern `cv_version` and
 * `cv_adaptation` use against `cv`. Every query that accepts a model id
 * from a client MUST join back to the key and filter on `userId` — see
 * `findOwnedProviderModel` in `features/ai-providers/ownership.ts`.
 *
 * `isDefault` marks the ONE model used by flows that do not offer an
 * explicit picker (CV import, GitHub import). Uniqueness of "exactly one
 * default per user" is enforced in the action layer rather than by a
 * constraint, because the scope is the user and this table only reaches
 * `userId` through a join — a partial unique index cannot express it
 * without denormalizing `userId` back down here.
 *
 * The unique index prevents registering the same model id twice under one
 * credential. This is the repo's first composite unique index; single
 * `.unique()` columns already exist on `user.email`, `session.token`, and
 * `passkey.credentialID`.
 */
export const aiProviderModel = pgTable(
  "ai_provider_model",
  {
    id: text("id").primaryKey(),
    providerKeyId: text("provider_key_id")
      .notNull()
      .references(() => aiProviderKey.id, { onDelete: "cascade" }),
    modelId: text("model_id").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    lastValidatedAt: timestamp("last_validated_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    // Soft delete — see the note on `cv.deletedAt`.
    //
    // This column interacts with the unique index below, and the resolution
    // is worth stating: the index stays UNPARTITIONED (no
    // `WHERE deleted_at IS NULL`) on purpose. A partial index would let a
    // second live row for the same (key, model) pair be inserted alongside
    // the soft-deleted one, silently accumulating duplicates. Instead,
    // re-registering a model that was soft-deleted REVIVES the existing row
    // (`deleted_at` back to NULL) via `onConflictDoUpdate` — see
    // `addProviderModel` and `saveProviderKey`. One row per pair, forever,
    // and re-adding something you deleted by accident just works.
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    uniqueIndex("ai_provider_model_key_model_unique").on(
      table.providerKeyId,
      table.modelId,
    ),
  ],
)
