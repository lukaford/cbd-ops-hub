import { existsSync, mkdirSync, renameSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { catchUpMigrations, isAlreadyExists } from "./catchUp";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = path.join(process.cwd(), "drizzle");

// DATABASE_URL points at hosted Postgres in production. Without it, an embedded
// Postgres (PGlite) keeps data on this computer so the app runs with no setup.
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
  return connectLocal(localDataDir());
}

// Outside the app folder on purpose: a folder synced by OneDrive or iCloud (often
// the Desktop) corrupts the database files while they are in use.
export function localDataDir(env: Record<string, string | undefined> = process.env, platform: string = process.platform): string {
  if (env.DATA_DIR) return path.join(env.DATA_DIR, "pglite");
  const base = platform === "win32" && env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "CBD Ops Hub") : path.join(os.homedir(), ".cbd-ops-hub");
  return path.join(base, "pglite");
}

// If the local database is damaged it is set aside (never deleted, since it can
// hold paperwork and signatures) and a fresh one is started rather than stopping the app.
// Only a database that won't open counts as damaged: a failed migration, or a database
// another copy of the app has open, says nothing about the data, so those just fail.
async function connectLocal(dir: string): Promise<Db> {
  let client: PGlite;
  try {
    client = await openPglite(dir);
  } catch (err) {
    if (!existsSync(dir) || process.env.NEXT_PHASE === "phase-production-build") throw err;
    const aside = `${dir}-damaged-${Date.now()}`;
    console.error(`Local database could not open (${err instanceof Error ? err.message : err}); moving it to ${aside} and starting fresh.`);
    renameSync(dir, aside);
    client = await openPglite(dir);
  }
  return migratePglite(client);
}

async function connectPglite(dir: string | undefined): Promise<Db> {
  return migratePglite(await openPglite(dir));
}

async function openPglite(dir: string | undefined): Promise<PGlite> {
  if (dir) mkdirSync(dir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(dir);
  await client.waitReady;
  return client;
}

async function migratePglite(client: PGlite): Promise<Db> {
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(client, { schema });
  try {
    await migrate(db, { migrationsFolder });
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
    const n = await catchUpMigrations(client, migrationsFolder);
    console.warn(`Local database already had part of its newest setup; finished ${n} step(s) and kept all data.`);
  }
  return db as unknown as Db;
}

const globalForDb = globalThis as unknown as { dbPromise?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.dbPromise ??= connect(process.env.DATABASE_URL).catch((err) => {
    // Let the next request try again instead of failing forever.
    globalForDb.dbPromise = undefined;
    throw err;
  });
  return globalForDb.dbPromise;
}

export function openDb(url: string): Promise<Db> {
  return connect(url);
}

export { schema };
