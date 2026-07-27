CREATE TABLE "ai_provider_model" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_key_id" text NOT NULL,
	"model_id" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"last_validated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_provider_model" ADD CONSTRAINT "ai_provider_model_provider_key_id_ai_provider_key_id_fk" FOREIGN KEY ("provider_key_id") REFERENCES "public"."ai_provider_key"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_model_key_model_unique" ON "ai_provider_model" USING btree ("provider_key_id","model_id");--> statement-breakpoint
/*
 * HAND-EDITED — the three statements below were added manually and are not
 * drizzle-kit output. Regenerating this file will silently drop them.
 *
 * `drizzle-kit generate` emitted only the bare `DROP COLUMN "default_model"`
 * at the end. Running that alone would leave every existing credential with
 * zero models, which `getConfiguredModelForUser` reports as "no provider
 * configured" — i.e. every user who had a working provider would find their
 * AI features dead and would have to re-add the provider by hand.
 *
 * These statements move the data before the column disappears. Order is
 * load-bearing: backfill first, then flag one default per user, then drop.
 */
INSERT INTO "ai_provider_model" ("id", "provider_key_id", "model_id", "is_default", "last_validated_at", "created_at")
SELECT
	gen_random_uuid()::text,
	"id",
	"default_model",
	false,
	"last_validated_at",
	now()
FROM "ai_provider_key"
WHERE "default_model" IS NOT NULL;--> statement-breakpoint
/*
 * Exactly one default per USER, not per credential — a user with two
 * configured providers must not end up with two defaults. The ordering
 * mirrors `getConfiguredModelForUser`'s own priority (most recently
 * validated credential wins, `NULLS LAST` so never-validated rows do not
 * sort first), so the model picked here is the same one that resolver would
 * already have chosen before this migration.
 */
UPDATE "ai_provider_model" m
SET "is_default" = true
WHERE m."id" IN (
	SELECT DISTINCT ON (k."user_id") m2."id"
	FROM "ai_provider_model" m2
	JOIN "ai_provider_key" k ON k."id" = m2."provider_key_id"
	ORDER BY k."user_id", k."last_validated_at" DESC NULLS LAST, k."created_at" DESC
);--> statement-breakpoint
ALTER TABLE "ai_provider_key" DROP COLUMN "default_model";
