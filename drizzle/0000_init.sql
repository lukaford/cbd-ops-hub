CREATE TABLE "folder_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"folder_id" integer NOT NULL,
	"step" integer NOT NULL,
	"done_on" date,
	"ref" text DEFAULT '' NOT NULL,
	"eta" date,
	"detail" text DEFAULT '' NOT NULL,
	"material" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"position" integer NOT NULL,
	"letter" text DEFAULT '' NOT NULL,
	"room" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '' NOT NULL,
	"furthest_step" integer DEFAULT 0 NOT NULL,
	"next_step" integer,
	"last_step" integer,
	"last_done_on" date,
	"last_ref" text
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'manager-special-orders' NOT NULL,
	"row_count" integer NOT NULL,
	"job_count" integer NOT NULL,
	"folder_count" integer NOT NULL,
	"dropped_job_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_number" text NOT NULL,
	"customer" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"zip" text DEFAULT '' NOT NULL,
	"designer" text DEFAULT '' NOT NULL,
	"installer" text DEFAULT '' NOT NULL,
	"contract_on" date,
	"due_on" date,
	"install_on" date,
	"amount_cents" integer,
	"balance_cents" integer,
	"in_latest_import" boolean DEFAULT true NOT NULL,
	"last_import_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_job_number_unique" UNIQUE("job_number")
);
--> statement-breakpoint
CREATE TABLE "special_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"item" text NOT NULL,
	"vendor" text DEFAULT '' NOT NULL,
	"material" text DEFAULT '' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"eta" date,
	"received_on" date
);
--> statement-breakpoint
ALTER TABLE "folder_steps" ADD CONSTRAINT "folder_steps_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_last_import_id_import_batches_id_fk" FOREIGN KEY ("last_import_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_orders" ADD CONSTRAINT "special_orders_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "folder_steps_folder_step" ON "folder_steps" USING btree ("folder_id","step");--> statement-breakpoint
CREATE UNIQUE INDEX "folders_job_position" ON "folders" USING btree ("job_id","position");