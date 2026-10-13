import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "@/db";
import { tolerant } from "@/db/catchUp";

const dirs: string[] = [];
afterEach(() => {
  delete process.env.DATA_DIR;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function close(db: unknown) {
  await (db as { $client: { close(): Promise<void> } }).$client.close();
}

describe("local database setup", () => {
  it("finishes a half-applied migration and keeps the data", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "cbd-db-"));
    dirs.push(dir);
    process.env.DATA_DIR = dir;

    let db = await openDb("");
    await db.execute(sql`insert into users (email, name, password_hash) values ('a@example.com', 'Al', 'x')`);
    // The newest migration's tables are partly there but it isn't recorded, as on Luke's
    // computer: one of its tables is missing and the record is gone.
    await db.execute(sql`delete from drizzle.__drizzle_migrations where created_at = (select max(created_at) from drizzle.__drizzle_migrations)`);
    await db.execute(sql`drop table notifications cascade`);
    await close(db);

    db = await openDb("");
    const users = await db.execute(sql`select name from users`);
    expect((users as any).rows.map((r: any) => r.name)).toEqual(["Al"]);
    await db.execute(sql`select count(*) from notifications`);
    const recorded = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    expect((recorded as any).rows[0].n).toBeGreaterThan(1);
    await close(db);

    // And the next start is an ordinary one.
    db = await openDb("");
    await close(db);
  });

  it("makes generated statements safe to run twice", () => {
    expect(tolerant('CREATE TABLE "a" (\n"id" serial);')).toMatch(/^CREATE TABLE IF NOT EXISTS "a"/);
    expect(tolerant('CREATE UNIQUE INDEX "i" ON "a" ("id");')).toMatch(/^CREATE UNIQUE INDEX IF NOT EXISTS "i"/);
    expect(tolerant('ALTER TABLE "a" ADD COLUMN "b" integer;')).toBe('ALTER TABLE "a" ADD COLUMN IF NOT EXISTS "b" integer;');
    expect(tolerant('ALTER TABLE "a" ADD CONSTRAINT "f" FOREIGN KEY ("b") REFERENCES "c"("id");')).toMatch(/^DO \$\$ BEGIN .* EXCEPTION WHEN duplicate_object/);
  });
});
