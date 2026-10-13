import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openDb } from "@/db";
import { notifications } from "@/db/schema";
import { createOwner, inviteUser, listCategories, ownJobNumbers } from "@/lib/auth/accounts";
import { askForMissingDesigners, assignDesigner, jobsNeedingDesigner } from "@/lib/designers";
import { saveSnapshot } from "@/lib/import";
import { saveJobTreadSync, type JobTreadJob } from "@/lib/jobtread/sync";
import { parseSpecialOrders } from "@/lib/manager/parse";

const base: JobTreadJob = {
  jobtreadId: "", jobNumber: "", name: "", customer: "", city: "", stage: "Appt Set", stageSince: null, installOn: null, installFieldOn: null, apptOn: null,
  createdAt: null, installConfirmed: false, cncCutOn: null, edgeBandingOn: null, drawerAssemblyOn: null, finalQaOn: null, materialsOrdered: null, materials: [], orderBy: null, photographers: [],
};
const job = (n: string, extra: Partial<JobTreadJob> = {}) => ({ ...base, jobtreadId: `jt${n}`, jobNumber: n, customer: `Customer ${n}`, ...extra });

describe("jobs with no designer", () => {
  it("asks the front office manager once per job and clears the alert when assigned", async () => {
    const db = await openDb("memory:");
    const admin = await createOwner(db, { name: "Owner", email: "o@example.com", password: "a-long-password" });
    const cats = await listCategories(db);
    const cat = (name: string) => cats.find((c) => c.name === name)!.id;
    const { user: fom } = await inviteUser(db, { email: "f@example.com", name: "Fran", role: "staff", categoryIds: [cat("Front office manager")] }, admin.id);
    const { user: dee } = await inviteUser(db, { email: "d@example.com", name: "Dee", role: "staff", categoryIds: [cat("Designer")], jobNames: ["Dee D"] }, admin.id);

    // The Manager paste names a designer for 50001/50002, so they don't need one.
    await saveSnapshot(db, parseSpecialOrders(readFileSync(path.join(__dirname, "fixtures", "special-orders.tsv"), "utf8")));
    await saveJobTreadSync(db, [job("50001"), job("70001", { photographers: ["Dee D"] }), job("70002", { photographers: ["Office"] }), job("70003", { stage: "Complete" })]);

    expect((await jobsNeedingDesigner(db)).map((j) => j.jobNumber)).toEqual(["70002"]);
    expect(await askForMissingDesigners(db)).toBe(1);
    expect(await askForMissingDesigners(db)).toBe(0);
    const alerts = await db.select().from(notifications).where(eq(notifications.userId, fom.id));
    expect(alerts).toMatchObject([{ title: "Job 70002 needs a designer", link: "/assign#job-70002", readAt: null }]);
    // Only the front office manager is asked, not the admin.
    expect(await db.select().from(notifications).where(eq(notifications.userId, admin.id))).toEqual([]);

    await assignDesigner(db, "70002", dee.id, fom.id);
    expect((await ownJobNumbers(db, dee)).has("70002")).toBe(true);
    expect(await jobsNeedingDesigner(db)).toEqual([]);
    const [after] = await db.select().from(notifications).where(eq(notifications.userId, fom.id));
    expect(after.readAt).not.toBeNull();
  });

  it("sums up a big batch in one alert", async () => {
    const db = await openDb("memory:");
    await createOwner(db, { name: "Owner", email: "o@example.com", password: "a-long-password" });
    await saveJobTreadSync(db, ["1", "2", "3", "4", "5", "6", "7"].map((n) => job(`8000${n}`)));
    expect(await askForMissingDesigners(db)).toBe(7);
    // Nobody has the permission, so the admin is asked.
    expect((await db.select().from(notifications)).map((n) => n.title)).toEqual(["7 jobs need a designer"]);
  });
});
