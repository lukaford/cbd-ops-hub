import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "@/db";
import { saveSnapshot } from "@/lib/import";
import { isJobAtRisk, loadJobBoard } from "@/lib/jobBoard";
import { assertReadOnly, paveClient, type Pave, type PaveQuery } from "@/lib/jobtread/client";
import { FIELD } from "@/lib/jobtread/fields";
import { fetchJobTreadJobs, saveJobTreadSync } from "@/lib/jobtread/sync";
import { parseSpecialOrders } from "@/lib/manager/parse";

// Made-up JobTread data shaped like Pave responses.
const value = (field: string, v: unknown, createdAt = "2026-10-10T14:00:00Z") => ({ value: v, createdAt, customField: { id: field } });
const JOBS = [
  {
    id: "jt1",
    number: "50001",
    name: "50001 Sample 10/21/26",
    location: { city: "Testville", account: { name: "Sample, Pat" } },
    customFieldValues: { nodes: [value(FIELD.status2, "Purchasing"), value(FIELD.installOn, "2026-10-20"), value(FIELD.installConfirmed, true)] },
  },
  {
    id: "jt2",
    number: "50003",
    name: "50003 Example",
    location: { city: "Otherton", account: { name: "Example, Lee" } },
    customFieldValues: { nodes: [value(FIELD.status2, "Production"), value(FIELD.installOn, "2026-10-15"), value(FIELD.cncCutOn, "2026-10-09")] },
  },
  {
    id: "jt3",
    number: "50004",
    name: "50004 Dated",
    location: { city: "Otherton", account: { name: "Dated, Sam" } },
    customFieldValues: { nodes: [value(FIELD.installOn, "2026-11-30"), value(FIELD.materials, "Countertops - 4 weeks"), value(FIELD.materials, "Lighting – 4 weeks")] },
  },
  {
    id: "jt4",
    number: "50005",
    name: "50005 Done",
    location: { city: "Otherton", account: { name: "Done, Jo" } },
    customFieldValues: { nodes: [value(FIELD.status2, "Complete"), value(FIELD.installOn, "2026-10-01"), value(FIELD.materials, "Countertops - 4 weeks")] },
  },
  {
    id: "jt5",
    number: "50006",
    name: "50006 Lead 10/2/26",
    location: { city: "Otherton", account: { name: "Lead, Al" } },
    customFieldValues: { nodes: [value(FIELD.status2, "Unsold"), value(FIELD.materials, "Lighting – 4 weeks")] },
  },
];

function fakePave(): { pave: Pave; sent: PaveQuery[] } {
  const sent: PaveQuery[] = [];
  const pave: Pave = async (q: any) => {
    assertReadOnly(q);
    sent.push(q);
    if (q.currentGrant) return { currentGrant: { organization: { id: "org1" } } };
    if (q.customField) {
      const ids = { [FIELD.status2]: ["jt1", "jt2", "jt4", "jt5"], [FIELD.installOn]: ["jt1", "jt2", "jt3", "jt4"], [FIELD.materials]: ["jt3", "jt4", "jt5"] }[q.customField.$.id as string]!;
      return { customField: { customFieldValues: { nextPage: null, nodes: ids.map((id) => ({ job: { id } })) } } };
    }
    const wanted: string[] = q.organization.jobs.$.where[2];
    return { organization: { jobs: { nodes: JOBS.filter((j) => wanted.includes(j.id)) } } };
  };
  return { pave, sent };
}

describe("JobTread client", () => {
  it("refuses anything that isn't a read", () => {
    expect(() => assertReadOnly({ createJob: {} })).toThrow(/only reads/);
    expect(() => assertReadOnly({ updateCustomFieldValue: {} })).toThrow(/only reads/);
    expect(() => assertReadOnly({ organization: {} })).not.toThrow();
  });

  it("never calls JobTread with a write", async () => {
    let called = false;
    const pave = paveClient("k", { fetchImpl: (async () => ((called = true), new Response("{}"))) as typeof fetch });
    await expect(pave({ deleteJob: { $: { id: "x" } } })).rejects.toThrow(/only reads/);
    expect(called).toBe(false);
  });

  it("sends the grant key inside the query", async () => {
    let body: any;
    const pave = paveClient("secret", {
      url: "https://example.test/pave",
      fetchImpl: (async (_u: string, init: RequestInit) => ((body = JSON.parse(String(init.body))), new Response('{"ok":1}'))) as typeof fetch,
    });
    expect(await pave({ currentGrant: { organization: { id: {} } } })).toEqual({ ok: 1 });
    expect(body.query.$).toEqual({ grantKey: "secret" });
  });
});

describe("JobTread sync", () => {
  it("reads sold jobs and upcoming installs, and builds the board", async () => {
    const { pave, sent } = fakePave();
    const jobs = await fetchJobTreadJobs(pave);
    expect(sent.every((q) => Object.keys(q).every((k) => ["customField", "currentGrant", "organization"].includes(k)))).toBe(true);
    expect(jobs.map((j) => [j.jobNumber, j.stage, j.installOn])).toEqual([
      ["50001", "Purchasing", "2026-10-21"],
      ["50003", "Production", "2026-10-15"],
      ["50005", "Complete", "2026-10-01"],
      ["50006", "Unsold", null],
    ]);
    // An unsold job's name carries its appointment date, not an install date.
    expect(jobs[3].apptOn).toBe("2026-10-02");
    // 50004 has no Status 2.0, so it is left out.
    expect(jobs[2].materials).toEqual(["Countertops - 4 weeks"]);
    expect(jobs[0]).toMatchObject({ customer: "Sample, Pat", installConfirmed: true, stageSince: new Date("2026-10-10T14:00:00Z") });

    const db = await openDb("memory:");
    await saveSnapshot(db, parseSpecialOrders(readFileSync(path.join(__dirname, "fixtures", "special-orders.tsv"), "utf8")));
    await saveJobTreadSync(db, jobs);
    const board = await loadJobBoard(db, "2026-10-12");
    expect(board.lastSync?.jobCount).toBe(4);
    expect(board.leads.map((l) => [l.jobNumber, l.stage, l.apptOn])).toEqual([["50006", "Unsold", "2026-10-02"]]);
    expect(board.jobs.map((j) => [j.jobNumber, j.risk, j.past])).toEqual([
      ["50005", "in-production", true],
      ["50003", "in-production", false],
      ["50001", "warning", false],
    ]);
    // The name says 10/21 but the Confirmed Install Date field says 10/20.
    expect(board.jobs[2]).toMatchObject({ installOn: "2026-10-21", installFieldOn: "2026-10-20" });
    expect(board.jobs.filter(isJobAtRisk).map((j) => j.jobNumber)).toEqual(["50001"]);
    expect(board.jobs[2].manager).toMatchObject({ folders: 2, waitingOnStep: 5 });
    expect(board.jobs[1].manager).toBeNull();

    // A second sync replaces the stored copy.
    await saveJobTreadSync(db, jobs.slice(0, 1));
    expect((await loadJobBoard(db, "2026-10-12")).jobs).toHaveLength(1);
  });
});
