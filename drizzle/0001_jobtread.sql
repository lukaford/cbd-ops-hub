CREATE TABLE "jobtread_jobs" (
	"jobtread_id" text PRIMARY KEY NOT NULL,
	"job_number" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"customer" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"stage" text,
	"stage_since" timestamp with time zone,
	"install_on" date,
	"install_confirmed" boolean DEFAULT false NOT NULL,
	"cnc_cut_on" date,
	"edge_banding_on" date,
	"drawer_assembly_on" date,
	"final_qa_on" date,
	"materials_ordered" boolean,
	"sync_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobtread_syncs" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobtread_jobs" ADD CONSTRAINT "jobtread_jobs_sync_id_jobtread_syncs_id_fk" FOREIGN KEY ("sync_id") REFERENCES "public"."jobtread_syncs"("id") ON DELETE no action ON UPDATE no action;