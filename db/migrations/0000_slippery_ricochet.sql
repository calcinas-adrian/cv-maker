CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adaptation" (
	"id" text PRIMARY KEY NOT NULL,
	"cv_id" text NOT NULL,
	"bank_id" text,
	"job_posting_text" text NOT NULL,
	"adaptation_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_provider_key" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"base_url" text,
	"last_validated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ai_provider_model" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_key_id" text NOT NULL,
	"model_id" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"last_validated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bank" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text,
	"is_personal" boolean DEFAULT false NOT NULL,
	"headline" text,
	"location" text,
	"email" text,
	"phone" text,
	"linkedin_url" text,
	"website_url" text,
	"github_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bank_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"bank_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"issuer" text,
	"issued_at" text,
	"expires_at" text,
	"credential_id" text,
	"credential_url" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bank_education" (
	"id" text PRIMARY KEY NOT NULL,
	"bank_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"institution" text NOT NULL,
	"degree" text NOT NULL,
	"start_date" text,
	"end_date" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bank_engagement" (
	"id" text PRIMARY KEY NOT NULL,
	"bank_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"organization" text,
	"role" text,
	"name" text,
	"start_date" text,
	"end_date" text,
	"url" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bank_language" (
	"id" text PRIMARY KEY NOT NULL,
	"bank_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"level" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bank_material" (
	"id" text PRIMARY KEY NOT NULL,
	"bank_id" text NOT NULL,
	"engagement_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"tech_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skill_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bank_material_variant" (
	"id" text PRIMARY KEY NOT NULL,
	"material_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"label" text,
	"content" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bank_skill" (
	"id" text PRIMARY KEY NOT NULL,
	"bank_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cv" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"bank_id" text,
	"title" text NOT NULL,
	"full_name" text,
	"email" text,
	"phone" text,
	"location" text,
	"linkedin_url" text,
	"website_url" text,
	"summary" text,
	"theme" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cv_bullet" (
	"id" text PRIMARY KEY NOT NULL,
	"experience_id" text,
	"project_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"content" text NOT NULL,
	"source_material_id" text,
	CONSTRAINT "cv_bullet_one_parent" CHECK (num_nonnulls("cv_bullet"."experience_id", "cv_bullet"."project_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "cv_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"cv_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"issuer" text,
	"issued_at" text,
	"expires_at" text,
	"credential_id" text,
	"credential_url" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "cv_education" (
	"id" text PRIMARY KEY NOT NULL,
	"cv_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"institution" text NOT NULL,
	"degree" text NOT NULL,
	"start_date" text,
	"end_date" text
);
--> statement-breakpoint
CREATE TABLE "cv_experience" (
	"id" text PRIMARY KEY NOT NULL,
	"cv_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"start_date" text,
	"end_date" text,
	"source_engagement_id" text
);
--> statement-breakpoint
CREATE TABLE "cv_language" (
	"id" text PRIMARY KEY NOT NULL,
	"cv_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"level" text
);
--> statement-breakpoint
CREATE TABLE "cv_project" (
	"id" text PRIMARY KEY NOT NULL,
	"cv_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"url" text,
	"source_engagement_id" text
);
--> statement-breakpoint
CREATE TABLE "cv_reference" (
	"id" text PRIMARY KEY NOT NULL,
	"cv_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"company" text,
	"email" text,
	"phone" text
);
--> statement-breakpoint
CREATE TABLE "cv_skill" (
	"id" text PRIMARY KEY NOT NULL,
	"cv_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "cv_version" (
	"id" text PRIMARY KEY NOT NULL,
	"cv_id" text NOT NULL,
	"label" text,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp DEFAULT now(),
	"aaguid" text,
	CONSTRAINT "passkey_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptation" ADD CONSTRAINT "adaptation_cv_id_cv_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cv"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptation" ADD CONSTRAINT "adaptation_bank_id_bank_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."bank"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_key" ADD CONSTRAINT "ai_provider_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_model" ADD CONSTRAINT "ai_provider_model_provider_key_id_ai_provider_key_id_fk" FOREIGN KEY ("provider_key_id") REFERENCES "public"."ai_provider_key"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank" ADD CONSTRAINT "bank_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_credential" ADD CONSTRAINT "bank_credential_bank_id_bank_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."bank"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_education" ADD CONSTRAINT "bank_education_bank_id_bank_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."bank"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_engagement" ADD CONSTRAINT "bank_engagement_bank_id_bank_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."bank"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_language" ADD CONSTRAINT "bank_language_bank_id_bank_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."bank"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_material" ADD CONSTRAINT "bank_material_bank_id_bank_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."bank"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_material" ADD CONSTRAINT "bank_material_engagement_id_bank_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."bank_engagement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_material_variant" ADD CONSTRAINT "bank_material_variant_material_id_bank_material_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."bank_material"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_skill" ADD CONSTRAINT "bank_skill_bank_id_bank_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."bank"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv" ADD CONSTRAINT "cv_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv" ADD CONSTRAINT "cv_bank_id_bank_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."bank"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_bullet" ADD CONSTRAINT "cv_bullet_experience_id_cv_experience_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."cv_experience"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_bullet" ADD CONSTRAINT "cv_bullet_project_id_cv_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."cv_project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_credential" ADD CONSTRAINT "cv_credential_cv_id_cv_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cv"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_education" ADD CONSTRAINT "cv_education_cv_id_cv_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cv"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_experience" ADD CONSTRAINT "cv_experience_cv_id_cv_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cv"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_language" ADD CONSTRAINT "cv_language_cv_id_cv_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cv"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_project" ADD CONSTRAINT "cv_project_cv_id_cv_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cv"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_reference" ADD CONSTRAINT "cv_reference_cv_id_cv_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cv"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_skill" ADD CONSTRAINT "cv_skill_cv_id_cv_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cv"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_version" ADD CONSTRAINT "cv_version_cv_id_cv_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cv"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_model_key_model_unique" ON "ai_provider_model" USING btree ("provider_key_id","model_id");--> statement-breakpoint
CREATE INDEX "bank_credential_bank_id_sort_order_idx" ON "bank_credential" USING btree ("bank_id","sort_order");--> statement-breakpoint
CREATE INDEX "bank_education_bank_id_sort_order_idx" ON "bank_education" USING btree ("bank_id","sort_order");--> statement-breakpoint
CREATE INDEX "bank_engagement_bank_id_sort_order_idx" ON "bank_engagement" USING btree ("bank_id","sort_order");--> statement-breakpoint
CREATE INDEX "bank_language_bank_id_sort_order_idx" ON "bank_language" USING btree ("bank_id","sort_order");--> statement-breakpoint
CREATE INDEX "bank_material_bank_id_engagement_id_idx" ON "bank_material" USING btree ("bank_id","engagement_id");--> statement-breakpoint
CREATE INDEX "bank_material_tech_tags_gin_idx" ON "bank_material" USING gin ("tech_tags");--> statement-breakpoint
CREATE INDEX "bank_material_skill_tags_gin_idx" ON "bank_material" USING gin ("skill_tags");--> statement-breakpoint
CREATE INDEX "bank_material_variant_material_id_sort_order_idx" ON "bank_material_variant" USING btree ("material_id","sort_order");--> statement-breakpoint
CREATE INDEX "bank_skill_bank_id_sort_order_idx" ON "bank_skill" USING btree ("bank_id","sort_order");--> statement-breakpoint
CREATE INDEX "cv_bullet_experience_id_sort_order_idx" ON "cv_bullet" USING btree ("experience_id","sort_order");--> statement-breakpoint
CREATE INDEX "cv_bullet_project_id_sort_order_idx" ON "cv_bullet" USING btree ("project_id","sort_order");--> statement-breakpoint
CREATE INDEX "cv_credential_cv_id_sort_order_idx" ON "cv_credential" USING btree ("cv_id","sort_order");--> statement-breakpoint
CREATE INDEX "cv_education_cv_id_sort_order_idx" ON "cv_education" USING btree ("cv_id","sort_order");--> statement-breakpoint
CREATE INDEX "cv_experience_cv_id_sort_order_idx" ON "cv_experience" USING btree ("cv_id","sort_order");--> statement-breakpoint
CREATE INDEX "cv_language_cv_id_sort_order_idx" ON "cv_language" USING btree ("cv_id","sort_order");--> statement-breakpoint
CREATE INDEX "cv_project_cv_id_sort_order_idx" ON "cv_project" USING btree ("cv_id","sort_order");--> statement-breakpoint
CREATE INDEX "cv_reference_cv_id_sort_order_idx" ON "cv_reference" USING btree ("cv_id","sort_order");--> statement-breakpoint
CREATE INDEX "cv_skill_cv_id_sort_order_idx" ON "cv_skill" USING btree ("cv_id","sort_order");