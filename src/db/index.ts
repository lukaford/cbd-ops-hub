import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = path.join(process.cwd(), "drizzle");

// DATABASE_URL points at hosted Postgres in production. Without it, an embedded
// Postgres (PGlite) keeps data in .data/ so the app runs with no setup.
async function connect(url: string | undefined): Promise<Db> {
  if (url?.startsWith("memory:")) return connectPglite(undefined);
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const db = drizzle(postgres(url, { max: 5 }), { schema });
    await migrate(db, { migrationsFolder });
    return db as unknown as Db;
  }
  // Hosted servers have no lasting disk, so the built-in database would lose everything.
  if (process.env.VERCEL) throw new Error("Set DATABASE_URL (for example from Neon) in the hosting settings.");
  return connectPglite(path.join(process.cwd(), ".data", "pglite"));
}

async function connectPglite(dir: string | undefined): Promise<Db> {
  if (dir) mkdirSync(dir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(dir), { schema });
  await migrate(db, { migrationsFolder });
  return db as unknown as Db;
}

const globalForDb = globalThis as unknown as { dbPromise?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.dbPromise ??= connect(process.env.DATABASE_URL);
  return globalForDb.dbPromise;
}

export function openDb(url: string): Promise<Db> {
  return connect(url);
}

export { schema };
