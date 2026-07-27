CREATE TABLE "career_material" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"company" text,
	"role" text,
	"project_name" text,
	"content" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_adaptation" (
	"id" text PRIMARY KEY NOT NULL,
	"cv_id" text NOT NULL,
	"source_cv_id" text,
	"job_posting_text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "career_material" ADD CONSTRAINT "career_material_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_adaptation" ADD CONSTRAINT "cv_adaptation_cv_id_cv_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cv"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_adaptation" ADD CONSTRAINT "cv_adaptation_source_cv_id_cv_id_fk" FOREIGN KEY ("source_cv_id") REFERENCES "public"."cv"("id") ON DELETE set null ON UPDATE no action;