import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import type { Db } from "@/db";
import { designerRequests, jobAssignments, jobs, jobtreadJobs, notifications, users } from "@/db/schema";
import { accessOf, audit, countUsers, ownJobNumbers, type StaffUser } from "./auth/accounts";
import { can } from "./auth/permissions";
import { emailEnabled, sendEmail } from "./email";
import { COMPLETE } from "./jobtread/fields";

export interface JobNeedingDesigner {
  jobNumber: string;
  name: string;
  customer: string;
  stage: string | null;
  // Who uploaded its photos in JobTread: usually the designer, so a strong hint.
  photographers: string[];
}

// Designers: active, non-admin accounts that see only their own work.
export async function designerAccounts(db: Db): Promise<StaffUser[]> {
  const list = await db.select().from(users).where(eq(users.active, true));
  const out: StaffUser[] = [];
  for (const u of list) if ((await accessOf(db, u)).scope === "own") out.push(u);
  return out;
}

// Open jobs (leads and sold jobs not yet complete) that no designer account owns
// and that have no designer name in the Manager paste.
export async function jobsNeedingDesigner(db: Db): Promise<JobNeedingDesigner[]> {
  const owned = new Set<string>();
  for (const d of await designerAccounts(db)) for (const n of await ownJobNumbers(db, d)) owned.add(n);
  const [jt, mgr] = await Promise.all([db.select().from(jobtreadJobs), db.select().from(jobs).where(eq(jobs.inLatestImport, true))]);
  const named = new Set(mgr.filter((j) => j.designer.trim()).map((j) => j.jobNumber));
  const out = new Map<string, JobNeedingDesigner>();
  for (const j of jt) {
    if (j.stage === COMPLETE || owned.has(j.jobNumber) || named.has(j.jobNumber)) continue;
    out.set(j.jobNumber, { jobNumber: j.jobNumber, name: j.name, customer: j.customer, stage: j.stage, photographers: j.photographers });
  }
  for (const j of mgr) {
    if (owned.has(j.jobNumber) || named.has(j.jobNumber) || out.has(j.jobNumber)) continue;
    out.set(j.jobNumber, { jobNumber: j.jobNumber, name: j.description, customer: j.customer, stage: null, photographers: [] });
  }
  return [...out.values()].sort((a, b) => b.jobNumber.localeCompare(a.jobNumber));
}

// Who gets asked: people whose categories include "jobs.assign" (the front
// office manager). If nobody has it, the admins are asked instead.
export async function designerRequestRecipients(db: Db): Promise<StaffUser[]> {
  const active = await db.select().from(users).where(eq(users.active, true));
  const holders: StaffUser[] = [];
  for (const u of active) if (u.role !== "admin" && can(await accessOf(db, u), "jobs.assign")) holders.push(u);
  return holders.length ? holders : active.filter((u) => u.role === "admin");
}

// Asks once about each job that has no designer, after every JobTread refresh
// and Manager paste. A handful of new jobs get an alert each; a big batch (like
// the first run) gets one summary alert.
export async function askForMissingDesigners(db: Db, origin = process.env.APP_URL ?? ""): Promise<number> {
  // Nobody to ask until accounts are turned on.
  if ((await countUsers(db)) === 0) return 0;
  const missing = await jobsNeedingDesigner(db);
  const numbers = missing.map((j) => j.jobNumber);
  // Jobs that got a designer (or closed) can be asked about again if they lose it.
  await db.delete(designerRequests).where(numbers.length ? notInArray(designerRequests.jobNumber, numbers) : undefined);
  if (!numbers.length) return 0;
  const asked = new Set((await db.select().from(designerRequests).where(inArray(designerRequests.jobNumber, numbers))).map((r) => r.jobNumber));
  const fresh = missing.filter((j) => !asked.has(j.jobNumber));
  if (!fresh.length) return 0;
  await db.insert(designerRequests).values(fresh.map((j) => ({ jobNumber: j.jobNumber }))).onConflictDoNothing();

  const recipients = await designerRequestRecipients(db);
  const hint = (j: JobNeedingDesigner) => (j.photographers.length ? ` Photos by ${j.photographers.join(", ")}.` : "");
  const alerts =
    fresh.length <= 5
      ? fresh.map((j) => ({
          title: `Job ${j.jobNumber} needs a designer`,
          body: `${j.customer || j.name}${j.stage ? ` · ${j.stage}` : ""}.${hint(j)}`,
          link: `/assign#job-${j.jobNumber}`,
        }))
      : [{ title: `${fresh.length} jobs need a designer`, body: `Including ${fresh.slice(0, 3).map((j) => j.jobNumber).join(", ")}.`, link: "/assign" }];
  if (recipients.length) {
    await db.insert(notifications).values(recipients.flatMap((u) => alerts.map((a) => ({ ...a, userId: u.id, kind: "designer_needed" }))));
  }
  await audit(db, { action: "designer_requested", entity: "jobs", data: { jobs: fresh.map((j) => j.jobNumber), to: recipients.map((u) => u.id) } });

  if (emailEnabled() && origin) {
    const lines = fresh.slice(0, 30).map((j) => `- ${j.jobNumber} ${j.customer || j.name}${hint(j)}`);
    for (const u of recipients) {
      await sendEmail(u.email, alerts.length === 1 ? alerts[0].title : `${fresh.length} jobs need a designer`, `${lines.join("\n")}\n\nAssign them here: ${origin}/assign\n`);
    }
  }
  return fresh.length;
}

// Assigns a job to a designer and clears the alerts about it.
export async function assignDesigner(db: Db, jobNumber: string, designerId: number, byUserId: number | null) {
  await db.insert(jobAssignments).values({ userId: designerId, jobNumber, createdByUserId: byUserId }).onConflictDoNothing();
  await db.delete(designerRequests).where(eq(designerRequests.jobNumber, jobNumber));
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.kind, "designer_needed"), eq(notifications.link, `/assign#job-${jobNumber}`), isNull(notifications.readAt)));
  await audit(db, { action: "designer_assigned", userId: byUserId, entity: "job", entityId: jobNumber, data: { designerId } });
}
