import { afterEach, describe, expect, it, vi } from "vitest";
import { openDb } from "@/db";
import { jobtreadSyncs } from "@/db/schema";
import { jobTreadRefreshing, keepJobTreadFresh, startJobTreadRefresh } from "@/lib/jobtread/refresh";

// A JobTread that answers each request after `ms`, with no jobs.
function slowJobTread(ms: number) {
  let calls = 0;
  const release: (() => void)[] = [];
  const fetchStub = vi.fn(async () => {
    calls++;
    await new Promise<void>((r) => (ms ? setTimeout(r, ms) : release.push(r)));
    return new Response(JSON.stringify({ customField: { customFieldValues: { nodes: [], nextPage: null } } }));
  });
  vi.stubGlobal("fetch", fetchStub);
  return { calls: () => calls, releaseAll: () => release.splice(0).forEach((r) => r()) };
}

describe("keeping the JobTread copy fresh", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("waits only for the very first pull", async () => {
    vi.stubEnv("JOBTREAD_GRANT_KEY", "k");
    const db = await openDb("memory:");
    const jt = slowJobTread(5);
    expect(await keepJobTreadFresh(db)).toEqual({ synced: true });
    expect(await db.select().from(jobtreadSyncs)).toHaveLength(1);
    expect(jt.calls()).toBe(1);
  });

  it("answers at once when the copy is stale and runs one pull however many pages ask", async () => {
    vi.stubEnv("JOBTREAD_GRANT_KEY", "k");
    const db = await openDb("memory:");
    await db.insert(jobtreadSyncs).values({ jobCount: 0, createdAt: new Date(Date.now() - 60 * 60 * 1000) });
    const jt = slowJobTread(0); // never answers until released
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => keepJobTreadFresh(db)));
    startJobTreadRefresh(db);
    expect(results.every((r) => !r.synced)).toBe(true);
    expect(jobTreadRefreshing()).toBe(true);
    await vi.waitFor(() => expect(jt.calls()).toBe(1));
    jt.releaseAll();
    await vi.waitFor(() => expect(jobTreadRefreshing()).toBe(false));
    expect(jt.calls()).toBe(1);
    expect(await db.select().from(jobtreadSyncs)).toHaveLength(2);
  });
});
