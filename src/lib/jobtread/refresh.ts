import { desc } from "drizzle-orm";
import type { Db } from "@/db";
import { jobtreadSyncs } from "@/db/schema";
import { paveClient } from "./client";
import { fetchJobTreadJobs, saveJobTreadSync } from "./sync";

// The board reloads itself every few minutes; each reload pulls from JobTread once the copy is this old.
export const SYNC_MAX_AGE_MS = 4 * 60 * 1000;

export function jobTreadConfigured(): boolean {
  return Boolean(process.env.JOBTREAD_GRANT_KEY);
}

// Pulls a fresh copy from JobTread when the stored one is older than SYNC_MAX_AGE_MS (or always, with force).
export async function refreshFromJobTread(db: Db, force = false): Promise<{ synced: boolean; error?: string }> {
  const key = process.env.JOBTREAD_GRANT_KEY;
  if (!key) return { synced: false };
  if (!force) {
    const [last] = await db.select().from(jobtreadSyncs).orderBy(desc(jobtreadSyncs.id)).limit(1);
    if (last && Date.now() - last.createdAt.getTime() < SYNC_MAX_AGE_MS) return { synced: false };
  }
  try {
    await saveJobTreadSync(db, await fetchJobTreadJobs(paveClient(key)));
    return { synced: true };
  } catch (err) {
    return { synced: false, error: err instanceof Error ? err.message : String(err) };
  }
}
