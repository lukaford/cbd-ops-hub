CREATE TABLE "form_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"room" text DEFAULT '' NOT NULL,
	"revision" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"file_name" text NOT NULL,
	"file" "bytea" NOT NULL,
	"model" jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paperwork_docs" (
	"id" serial PRIMARY KEY NOT NULL,
	"packet_id" integer NOT NULL,
	"template_id" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paperwork_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"packet_id" integer NOT NULL,
	"kind" text DEFAULT 'grid' NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paperwork_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"packet_id" integer NOT NULL,
	"text" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paperwork_packets" (
	"id" serial PRIMARY KEY NOT NULL,
	"jobtread_id" text,
	"job_number" text NOT NULL,
	"customer" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"designer" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"label" text DEFAULT 'Sale Paperwork' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "paperwork_signatures" (
	"id" serial PRIMARY KEY NOT NULL,
	"packet_id" integer NOT NULL,
	"role" text NOT NULL,
	"signer_name" text NOT NULL,
	"signer_email" text DEFAULT '' NOT NULL,
	"image" text NOT NULL,
	"consent" text NOT NULL,
	"content_hash" text NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paperwork_docs" ADD CONSTRAINT "paperwork_docs_packet_id_paperwork_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."paperwork_packets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paperwork_docs" ADD CONSTRAINT "paperwork_docs_template_id_form_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."form_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paperwork_files" ADD CONSTRAINT "paperwork_files_packet_id_paperwork_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."paperwork_packets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paperwork_issues" ADD CONSTRAINT "paperwork_issues_packet_id_paperwork_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."paperwork_packets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paperwork_signatures" ADD CONSTRAINT "paperwork_signatures_packet_id_paperwork_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."paperwork_packets"("id") ON DELETE cascade ON UPDATE no action;