CREATE TABLE "achievement" (
	"id" text PRIMARY KEY NOT NULL,
	"cv_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"issuer" text,
	"date" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "reference" (
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
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_cv_id_cv_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cv"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference" ADD CONSTRAINT "reference_cv_id_cv_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cv"("id") ON DELETE cascade ON UPDATE no action;