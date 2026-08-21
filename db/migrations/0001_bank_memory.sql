CREATE TABLE "bank_memory" (
	"id" text PRIMARY KEY NOT NULL,
	"bank_id" text NOT NULL,
	"raw_text" text NOT NULL,
	"clarifying_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"clarifying_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ai_notes" text,
	"material_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "bank_memory" ADD CONSTRAINT "bank_memory_bank_id_bank_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."bank"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_memory_bank_id_created_at_idx" ON "bank_memory" USING btree ("bank_id","created_at");