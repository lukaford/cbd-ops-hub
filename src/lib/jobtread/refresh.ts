import { desc } from "drizzle-orm";
import type { Db } from "@/db";
import { jobtreadSyncs } from "@/db/schema";
import { paveClient } from "./client";
import { askForMissingDesigners } from "../designers";
import { fetchJobTreadJobs, saveJobTreadSync } from "./sync";

// Pages pull from JobTread in the background once the stored copy is this old.
export const SYNC_MAX_AGE_MS = 4 * 60 * 1000;

export type RefreshResult = { synced: boolean; error?: string };

export function jobTreadConfigured(): boolean {
  return Boolean(process.env.JOBTREAD_GRANT_KEY);
}

// One pull at a time for the whole server. A pull takes from several seconds to a
// minute, and every page used to start its own while waiting on it, so a few clicks
// after the copy went stale stacked up pulls until no page would load.
const state = globalThis as unknown as { jtRunning?: Promise<RefreshResult>; jtLastError?: string; jtFailedAt?: number };

function pull(db: Db, key: string): Promise<RefreshResult> {
  state.jtRunning ??= (async (): Promise<RefreshResult> => {
    try {
      await saveJobTreadSync(db, await fetchJobTreadJobs(paveClient(key)));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error("JobTread refresh failed:", error);
      state.jtLastError = error;
      state.jtFailedAt = Date.now();
      return { synced: false, error };
    }
    state.jtLastError = undefined;
    // Asking the front office about jobs with no designer never holds up the board.
    await askForMissingDesigners(db).catch((err) => console.error("Designer alerts failed:", err));
    return { synced: true };
  })().finally(() => {
    state.jtRunning = undefined;
  });
  return state.jtRunning;
}

async function lastSyncAt(db: Db): Promise<Date | null> {
  const [last] = await db.select({ createdAt: jobtreadSyncs.createdAt }).from(jobtreadSyncs).orderBy(desc(jobtreadSyncs.id)).limit(1);
  return last?.createdAt ?? null;
}

// The Refresh now button: starts a pull and returns at once. Waiting for it inside a
// form action would hold every tab click until JobTread answered.
export function startJobTreadRefresh(db: Db): void {
  const key = process.env.JOBTREAD_GRANT_KEY;
  if (key) void pull(db, key);
}

// True while a pull is running, so pages can say so and check back soon.
export function jobTreadRefreshing(): boolean {
  return Boolean(state.jtRunning);
}

// For pages: never waits on JobTread once there is a stored copy. A stale copy is
// shown right away and a pull starts in the background; the next reload shows it.
// Only the very first pull, with nothing stored yet, is waited for.
export async function keepJobTreadFresh(db: Db): Promise<RefreshResult> {
  const key = process.env.JOBTREAD_GRANT_KEY;
  if (!key) return { synced: false };
  // After a failed pull, wait as long as for a stale copy before trying again on its own.
  const retryOk = !state.jtFailedAt || Date.now() - state.jtFailedAt >= SYNC_MAX_AGE_MS;
  const at = await lastSyncAt(db);
  if (!at) return retryOk || state.jtRunning ? pull(db, key) : { synced: false, error: state.jtLastError };
  if (Date.now() - at.getTime() >= SYNC_MAX_AGE_MS && retryOk) void pull(db, key);
  return { synced: false, error: state.jtLastError };
}
