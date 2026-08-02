import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
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
 * Career bank — the durable, reusable source of truth for a user's career
 * history. One user has (today) exactly one personal bank, auto-created and
 * never exposed through a switcher UI — see
 * `architecture/bank-multiplicity-ui`. The schema still carries the full
 * ownership key (`bank.id` + `bank_id` on every child) so a future
 * multi-bank UI is a UI-only change, not a migration.
 *
 * Every table in this context gets `created_at`/`updated_at`/`deleted_at`:
 * bank content is hand-curated and cannot be recomputed from anywhere else
 * (unlike a CV section, which is disposable draft state — see the note on
 * `cv` below), so accidental deletion must be recoverable row-by-row.
 *
 * NO partial (`WHERE deleted_at IS NULL`) indexes anywhere in this context —
 * see `architecture/deletion-policy` trap 2. Uniqueness that would naturally
 * want a partial index (e.g. "one live default variant per material", "no
 * duplicate live engagement per bank on re-import") is enforced in the
 * action layer instead, the same precedent already shipped for
 * `ai_provider_model.isDefault`. If a `bank_*` table ever needs a real
 * unique index, it must be unpartitioned plus `onConflictDoUpdate` reviving
 * the dead row, not `WHERE deleted_at IS NULL`.
 */

export const bank = pgTable("bank", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // `name` labels the bank; `fullName` is the person it describes. For the
  // single implicit personal bank these coincide, but a bank maintained for
  // someone else needs a label ("Juan's bank") distinct from the name that
  // gets frozen into `cv.fullName`. Nullable so the personal bank can leave
  // it unset and fall back to `name`.
  fullName: text("full_name"),
  // Marks the owner's own bank as opposed to one they keep for someone else.
  // "At most one live personal bank per user" is enforced at the single
  // creation point in app code, NOT by a partial unique index — see the note
  // on `ai_provider_model` about partial indexes and soft delete.
  isPersonal: boolean("is_personal").notNull().default(false),
  headline: text("headline"),
  location: text("location"),
  email: text("email"),
  phone: text("phone"),
  linkedinUrl: text("linkedin_url"),
  websiteUrl: text("website_url"),
  githubUrl: text("github_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
})

// A job or a side project the bank owner has worked on. `bank_material`
// attaches to one of these (or to none — see below) and `cv_experience`/
// `cv_project` record which engagement they were imported from via
// `sourceEngagementId`, which is deliberately NOT a foreign key (see the
// note on `cv_experience`).
export const bankEngagement = pgTable(
  "bank_engagement",
  {
    id: text("id").primaryKey(),
    bankId: text("bank_id")
      .notNull()
      .references(() => bank.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    kind: text("kind").notNull(), // "job" | "project"
    organization: text("organization"),
    role: text("role"),
    name: text("name"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    url: text("url"),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("bank_engagement_bank_id_sort_order_idx").on(
      table.bankId,
      table.sortOrder,
    ),
  ],
)

// One reusable CLAIM about the bank owner (a bullet or a summary
// paragraph). `engagementId` is nullable with NO check tying it to `kind` —
// a floating achievement not yet attributed to any job is a legitimate,
// standalone material (spec scenario "Material with no engagement"), and a
// summary is never attached to an engagement at all.
export const bankMaterial = pgTable(
  "bank_material",
  {
    id: text("id").primaryKey(),
    bankId: text("bank_id")
      .notNull()
      .references(() => bank.id, { onDelete: "cascade" }),
    engagementId: text("engagement_id").references(() => bankEngagement.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    kind: text("kind").notNull(), // "bullet" | "summary"
    techTags: jsonb("tech_tags").$type<string[]>().notNull().default([]),
    skillTags: jsonb("skill_tags").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("bank_material_bank_id_engagement_id_idx").on(
      table.bankId,
      table.engagementId,
    ),
    index("bank_material_tech_tags_gin_idx").using("gin", table.techTags),
    index("bank_material_skill_tags_gin_idx").using("gin", table.skillTags),
  ],
)

// One WORDING of a material's claim. A material has one or more variants,
// exactly one marked `isDefault` (enforced in the action layer, per the
// no-partial-index rule above — "exactly one default" is exactly the shape
// that would otherwise want a partial unique index). Adaptation reads only
// the live default variant per material — see `build-material-corpus.ts`,
// Phase 6.
export const bankMaterialVariant = pgTable(
  "bank_material_variant",
  {
    id: text("id").primaryKey(),
    materialId: text("material_id")
      .notNull()
      .references(() => bankMaterial.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    label: text("label"),
    content: text("content").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("bank_material_variant_material_id_sort_order_idx").on(
      table.materialId,
      table.sortOrder,
    ),
  ],
)

export const bankEducation = pgTable(
  "bank_education",
  {
    id: text("id").primaryKey(),
    bankId: text("bank_id")
      .notNull()
      .references(() => bank.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    institution: text("institution").notNull(),
    degree: text("degree").notNull(),
    startDate: text("start_date"),
    endDate: text("end_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("bank_education_bank_id_sort_order_idx").on(
      table.bankId,
      table.sortOrder,
    ),
  ],
)

// Certifications and awards, merged into one table via `kind`: both are
// "an external body recognized something about this person", differing
// only in a handful of optional fields (a certification has a
// `credentialId`/`credentialUrl`, an award typically does not).
export const bankCredential = pgTable(
  "bank_credential",
  {
    id: text("id").primaryKey(),
    bankId: text("bank_id")
      .notNull()
      .references(() => bank.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    kind: text("kind").notNull(), // "certification" | "award"
    name: text("name").notNull(),
    issuer: text("issuer"),
    issuedAt: text("issued_at"),
    expiresAt: text("expires_at"),
    credentialId: text("credential_id"),
    credentialUrl: text("credential_url"),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("bank_credential_bank_id_sort_order_idx").on(
      table.bankId,
      table.sortOrder,
    ),
  ],
)

export const bankLanguage = pgTable(
  "bank_language",
  {
    id: text("id").primaryKey(),
    bankId: text("bank_id")
      .notNull()
      .references(() => bank.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    name: text("name").notNull(),
    level: text("level"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("bank_language_bank_id_sort_order_idx").on(
      table.bankId,
      table.sortOrder,
    ),
  ],
)

export const bankSkill = pgTable(
  "bank_skill",
  {
    id: text("id").primaryKey(),
    bankId: text("bank_id")
      .notNull()
      .references(() => bank.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    name: text("name").notNull(),
    category: text("category"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("bank_skill_bank_id_sort_order_idx").on(
      table.bankId,
      table.sortOrder,
    ),
  ],
)

/**
 * CV domain. `cv` is the top-level document, owned by a user and optionally
 * linked to the bank it was built from. `cv_experience`, `cv_project`,
 * `cv_bullet`, `cv_education`, `cv_skill`, `cv_credential`, `cv_language`,
 * and `cv_reference` are ordered child records owned by a `cv`. `cv_version`
 * stores full JSON snapshots of a CV's editable data for undo history /
 * restore, independent of the live `cv` row and its children.
 *
 * DELETION POLICY. `cv` is soft-deleted (`deleted_at`); its children are
 * not, and must not be. `features/cv/persist-sections.ts` rewrites every
 * child table on EVERY autosave via delete-all + reinsert, so a
 * `deleted_at` on a child would accumulate a dead row per item per save and
 * grow without bound. Undo for an individual section item is already
 * covered by `cv_version` snapshots + `restoreVersion`, which is the right
 * granularity for "I removed a bullet by accident".
 */

export const cv = pgTable("cv", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Nullable: a CV built from scratch, or imported from a PDF the user
  // chose "this CV only" for, has no bank behind it (spec scenario "CV with
  // no bank"). `set null` rather than `cascade` — deleting the bank a CV
  // was built from must not take the CV down with it; the CV is a frozen
  // output, not a live view of the bank.
  bankId: text("bank_id").references(() => bank.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  fullName: text("full_name"),
  email: text("email"),
  phone: text("phone"),
  location: text("location"),
  linkedinUrl: text("linkedin_url"),
  websiteUrl: text("website_url"),
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
  // recovery is a manual, out-of-band request (see `scripts/restore.mjs`).
  //
  // The child tables below deliberately do NOT get this column, and that
  // is what makes restore trivial: soft-deleting a cv touches no child
  // row, so setting this back to NULL brings the sections, versions and
  // adaptations back exactly as they were. See the note on
  // `buildCvSectionQueries` in `features/cv/persist-sections.ts` for why
  // the children cannot carry a `deleted_at` of their own.
  deletedAt: timestamp("deleted_at"),
})

export const cvExperience = pgTable(
  "cv_experience",
  {
    id: text("id").primaryKey(),
    cvId: text("cv_id")
      .notNull()
      .references(() => cv.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    company: text("company").notNull(),
    role: text("role").notNull(),
    startDate: text("start_date"),
    endDate: text("end_date"),
    // Which bank engagement this experience was imported from, if any. NO
    // foreign key, deliberately: this is a soft, informational pointer, the
    // same shape as `cv_bullet.sourceMaterialId` below, and it must survive
    // the source engagement being soft-deleted without an FK error or a
    // cascading NULL write on every save.
    sourceEngagementId: text("source_engagement_id"),
  },
  (table) => [
    index("cv_experience_cv_id_sort_order_idx").on(table.cvId, table.sortOrder),
  ],
)

export const cvProject = pgTable(
  "cv_project",
  {
    id: text("id").primaryKey(),
    cvId: text("cv_id")
      .notNull()
      .references(() => cv.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    name: text("name").notNull(),
    description: text("description"),
    url: text("url"),
    sourceEngagementId: text("source_engagement_id"),
  },
  (table) => [
    index("cv_project_cv_id_sort_order_idx").on(table.cvId, table.sortOrder),
  ],
)

// A single itemized line under an experience or a project — never both.
// `cvId` is deliberately ABSENT: a bullet has no independent existence
// outside its parent row, so it is deleted for free by `ON DELETE CASCADE`
// off the wholesale-deleted `cv_experience`/`cv_project` row on every
// autosave, with no extra delete statement. See `persist-sections.ts` for
// why insertion ORDER (parent before child) is the real hazard here, not
// atomicity.
//
// `sourceMaterialId` has NO foreign key. A dangling pointer here is the
// honest outcome when the source bank material is later soft-deleted (spec
// scenario "Source material later deleted": the bullet keeps rendering,
// unchanged, forever) — an FK would force a `set null` write on every
// material deletion for no behavioral benefit.
export const cvBullet = pgTable(
  "cv_bullet",
  {
    id: text("id").primaryKey(),
    experienceId: text("experience_id").references(() => cvExperience.id, {
      onDelete: "cascade",
    }),
    projectId: text("project_id").references(() => cvProject.id, {
      onDelete: "cascade",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    content: text("content").notNull(),
    sourceMaterialId: text("source_material_id"),
  },
  (table) => [
    // Exactly one parent. `num_nonnulls` is the same idiom Postgres itself
    // documents for "exactly one of these columns is set"; the alternative
    // (two nullable FKs with no check) would let a bullet with BOTH or
    // NEITHER parent typecheck and persist.
    check(
      "cv_bullet_one_parent",
      sql`num_nonnulls(${table.experienceId}, ${table.projectId}) = 1`,
    ),
    // `sort_order` is scoped PER PARENT (matching every other section's
    // cv_id scoping and the spec's "sort_order updates per-parent"), so a
    // bullet list needs both partial indexes — a bullet has only one live
    // parent at a time, so only one of the two ever matches a given row,
    // but Drizzle indexes are unconditional and Postgres is fine indexing
    // a column that is frequently NULL.
    index("cv_bullet_experience_id_sort_order_idx").on(
      table.experienceId,
      table.sortOrder,
    ),
    index("cv_bullet_project_id_sort_order_idx").on(
      table.projectId,
      table.sortOrder,
    ),
  ],
)

export const cvEducation = pgTable(
  "cv_education",
  {
    id: text("id").primaryKey(),
    cvId: text("cv_id")
      .notNull()
      .references(() => cv.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    institution: text("institution").notNull(),
    degree: text("degree").notNull(),
    startDate: text("start_date"),
    endDate: text("end_date"),
  },
  (table) => [
    index("cv_education_cv_id_sort_order_idx").on(table.cvId, table.sortOrder),
  ],
)

export const cvSkill = pgTable(
  "cv_skill",
  {
    id: text("id").primaryKey(),
    cvId: text("cv_id")
      .notNull()
      .references(() => cv.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    name: text("name").notNull(),
    category: text("category"),
  },
  (table) => [
    index("cv_skill_cv_id_sort_order_idx").on(table.cvId, table.sortOrder),
  ],
)

export const cvCredential = pgTable(
  "cv_credential",
  {
    id: text("id").primaryKey(),
    cvId: text("cv_id")
      .notNull()
      .references(() => cv.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    kind: text("kind").notNull(), // "certification" | "award"
    name: text("name").notNull(),
    issuer: text("issuer"),
    issuedAt: text("issued_at"),
    expiresAt: text("expires_at"),
    credentialId: text("credential_id"),
    credentialUrl: text("credential_url"),
    description: text("description"),
  },
  (table) => [
    index("cv_credential_cv_id_sort_order_idx").on(table.cvId, table.sortOrder),
  ],
)

export const cvLanguage = pgTable(
  "cv_language",
  {
    id: text("id").primaryKey(),
    cvId: text("cv_id")
      .notNull()
      .references(() => cv.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    name: text("name").notNull(),
    level: text("level"),
  },
  (table) => [
    index("cv_language_cv_id_sort_order_idx").on(table.cvId, table.sortOrder),
  ],
)

// Holds PERSONAL DATA OF THIRD PARTIES (a referee's name, email, phone) —
// people who are not this app's users and never consented here. Treat it
// accordingly: it inherits `onDelete: "cascade"` from `cv` so removing a CV
// removes the referees with it, and it must stay out of any AI extraction
// or adaptation corpus (see `features/cv-adapt/build-material-corpus.ts`,
// which deliberately does not read this table). There is deliberately no
// `bank_reference` counterpart — references are CV-specific and never
// promoted to the bank, which makes their exclusion from the corpus
// structural rather than a filter someone could forget.
export const cvReference = pgTable(
  "cv_reference",
  {
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
  },
  (table) => [
    index("cv_reference_cv_id_sort_order_idx").on(table.cvId, table.sortOrder),
  ],
)

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
 * Adaptation provenance. One row per CV generated from a job posting.
 * No `userId`: reached via `cv.userId`, same satellite pattern as
 * `cv_version`. `bankId` is `set null` (not cascade) so deleting the bank an
 * adaptation drew from never deletes the CV it produced — the CV is a
 * frozen copy, not a live view. There is no `sourceCvId`: since the bank
 * restructure, adaptation reads ONLY the bank (no sibling-CV corpus), so
 * there is no longer a "CV this was adapted from" to record — see
 * `architecture/adaptation-corpus-scope` and the spec's "No sibling-CV
 * leakage" scenario.
 *
 * `adaptationNotes` lives HERE rather than in a satellite table of its own.
 * It is a single-valued attribute of the adaptation event, functionally
 * dependent on this row's whole primary key and on nothing else — that is
 * already 3NF. A 1:1 side table would add a join and a possible orphan row
 * while removing no redundancy, which is the opposite of what normalising
 * is for. Nullable because every row written before this column existed
 * genuinely has no notes; "unknown" is the honest value, not `''`.
 */
export const adaptation = pgTable("adaptation", {
  id: text("id").primaryKey(),
  cvId: text("cv_id")
    .notNull()
    .references(() => cv.id, { onDelete: "cascade" }),
  bankId: text("bank_id").references(() => bank.id, { onDelete: "set null" }),
  jobPostingText: text("job_posting_text").notNull(),
  adaptationNotes: text("adaptation_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

/**
 * BYOK (bring-your-own-key) AI provider configuration.
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
 * Models registered against a credential. One credential, N models: the
 * whole point of splitting this out of `ai_provider_key`.
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
 * `adaptation` use against `cv`. Every query that accepts a model id from a
 * client MUST join back to the key and filter on `userId` — see
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
