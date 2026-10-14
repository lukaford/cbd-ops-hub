CREATE TABLE "form_prices" (
	"form" text NOT NULL,
	"cell" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_user_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_prices_form_cell_pk" PRIMARY KEY("form","cell")
);
--> statement-breakpoint
CREATE TABLE "paperwork_answers" (
	"doc_id" integer NOT NULL,
	"packet_id" integer NOT NULL,
	"job_number" text NOT NULL,
	"form" text NOT NULL,
	"room" text DEFAULT '' NOT NULL,
	"field" text NOT NULL,
	"section" text DEFAULT '' NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"num" double precision,
	CONSTRAINT "paperwork_answers_doc_id_field_pk" PRIMARY KEY("doc_id","field")
);
--> statement-breakpoint
ALTER TABLE "form_templates" ADD COLUMN "builtin_key" text;--> statement-breakpoint
ALTER TABLE "paperwork_docs" ADD COLUMN "prices" jsonb;--> statement-breakpoint
ALTER TABLE "form_prices" ADD CONSTRAINT "form_prices_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paperwork_answers" ADD CONSTRAINT "paperwork_answers_doc_id_paperwork_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."paperwork_docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paperwork_answers" ADD CONSTRAINT "paperwork_answers_packet_id_paperwork_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."paperwork_packets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paperwork_answers_job_idx" ON "paperwork_answers" USING btree ("job_number");--> statement-breakpoint
CREATE INDEX "paperwork_answers_field_idx" ON "paperwork_answers" USING btree ("form","field");--> statement-breakpoint
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_builtin_key_unique" UNIQUE("builtin_key");