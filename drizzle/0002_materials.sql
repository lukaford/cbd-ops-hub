ALTER TABLE "jobtread_jobs" ADD COLUMN "materials" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobtread_jobs" ADD COLUMN "order_by" date;