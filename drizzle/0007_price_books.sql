CREATE TABLE "price_book_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL,
	"seq" integer NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_books" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"revision" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"file_name" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"model" jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"uploaded_by_user_id" integer,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_book_chunks" ADD CONSTRAINT "price_book_chunks_book_id_price_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."price_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_books" ADD CONSTRAINT "price_books_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_book_chunks_book_seq" ON "price_book_chunks" USING btree ("book_id","seq");