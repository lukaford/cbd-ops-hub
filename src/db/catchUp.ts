import type { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";

// Postgres codes for "already exists": table or index, column, constraint.
const ALREADY_EXISTS = new Set(["42P07", "42701", "42710"]);

export function isAlreadyExists(err: unknown): boolean {
  return ALREADY_EXISTS.has((err as { code?: string })?.code ?? "");
}

// Rewrites one generated migration statement so running it again changes nothing.
export function tolerant(stmt: string): string {
  const s = stmt.trim();
  if (/^CREATE TABLE /i.test(s)) return s.replace(/^CREATE TABLE /i, "CREATE TABLE IF NOT EXISTS ");
  if (/^CREATE (UNIQUE )?INDEX /i.test(s)) return s.replace(/^CREATE (UNIQUE )?INDEX /i, (m) => `${m}IF NOT EXISTS `);
  if (/^ALTER TABLE \S+ ADD COLUMN /i.test(s)) return s.replace(/ ADD COLUMN /i, " ADD COLUMN IF NOT EXISTS ");
  if (/^ALTER TABLE \S+ ADD CONSTRAINT /i.test(s)) {
    return `DO $$ BEGIN ${s.replace(/;\s*$/, "")}; EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;`;
  }
  return s;
}

// The local database can already hold some of a migration's tables without the
// migration being recorded (an interrupted setup, or an earlier copy of the app whose
// migrations were numbered differently). Drizzle then stops on "already exists" and
// the app won't start. This finishes each unrecorded migration, skipping whatever is
// already there and keeping all data, then records it the way Drizzle does.
export async function catchUpMigrations(client: PGlite, migrationsFolder: string): Promise<number> {
  const migrations = readMigrationFiles({ migrationsFolder });
  await client.exec(`CREATE SCHEMA IF NOT EXISTS drizzle;
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`);
  const { rows } = await client.query<{ created_at: string | number }>(
    "select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1",
  );
  const last = rows.length ? Number(rows[0].created_at) : -Infinity;
  const pending = migrations.filter((m) => m.folderMillis > last);
  await client.transaction(async (tx) => {
    for (const m of pending) {
      for (const stmt of m.sql) if (stmt.trim()) await tx.exec(tolerant(stmt));
      await tx.query("insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)", [m.hash, m.folderMillis]);
    }
  });
  return pending.length;
}
