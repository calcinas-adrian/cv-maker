ALTER TABLE "ai_provider_key" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "ai_provider_model" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "career_material" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "cv" ADD COLUMN "deleted_at" timestamp;