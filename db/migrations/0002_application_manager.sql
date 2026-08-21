CREATE TABLE "application" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"adaptation_id" text,
	"status" text DEFAULT 'saved' NOT NULL,
	"company" text,
	"role" text,
	"job_url" text,
	"job_posting_text" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"applied_at" text,
	"follow_up_at" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "application_interview" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"scheduled_at" text NOT NULL,
	"kind" text DEFAULT 'interview' NOT NULL,
	"interviewer" text,
	"location" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_offer" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"received_at" text NOT NULL,
	"compensation" text,
	"currency" text,
	"employment_type" text,
	"response_due_at" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_offer_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_adaptation_id_adaptation_id_fk" FOREIGN KEY ("adaptation_id") REFERENCES "public"."adaptation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_interview" ADD CONSTRAINT "application_interview_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_offer" ADD CONSTRAINT "application_offer_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_adaptation_id_unique" ON "application" USING btree ("adaptation_id");--> statement-breakpoint
CREATE INDEX "application_user_id_created_at_idx" ON "application" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "application_interview_application_id_scheduled_at_idx" ON "application_interview" USING btree ("application_id","scheduled_at");
--> statement-breakpoint
INSERT INTO "application" (
	"id",
	"user_id",
	"adaptation_id",
	"job_posting_text",
	"created_at",
	"updated_at"
)
SELECT
	"adaptation"."id",
	"cv"."user_id",
	"adaptation"."id",
	"adaptation"."job_posting_text",
	"adaptation"."created_at",
	"adaptation"."created_at"
FROM "adaptation"
INNER JOIN "cv" ON "cv"."id" = "adaptation"."cv_id";
