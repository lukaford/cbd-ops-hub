import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { folderSteps, folders, importBatches, jobs, specialOrders } from "@/db/schema";
import { daysBetween, installRisk, RISK_WINDOW_DAYS, type Risk } from "./manager/progress";

export interface BoardFolder {
  id: number;
  jobNumber: string;
  customer: string;
  description: string;
  city: string;
  designer: string;
  installer: string;
  contractOn: string | null;
  dueOn: string | null;
  installOn: string | null;
  daysToInstall: number | null;
  amountCents: number | null;
  balanceCents: number | null;
  letter: string;
  room: string;
  color: string;
  furthestStep: number;
  nextStep: number | null;
  lastStep: number | null;
  lastDoneOn: string | null;
  lastRef: string | null;
  risk: Risk;
  steps: { step: number; doneOn: string | null; ref: string; detail: string }[];
  specialOrders: { item: string; vendor: string; detail: string; eta: string | null; receivedOn: string | null }[];
}

export interface Board {
  today: string;
  lastImport: { id: number; createdAt: Date; rowCount: number; jobCount: number; folderCount: number } | null;
  folders: BoardFolder[];
}

export function todayIn(timeZone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function loadBoard(db: Db, today: string): Promise<Board> {
  const [lastImport] = await db.select().from(importBatches).orderBy(desc(importBatches.id)).limit(1);

  const rows = await db
    .select({ folder: folders, job: jobs })
    .from(folders)
    .innerJoin(jobs, eq(folders.jobId, jobs.id))
    .where(eq(jobs.inLatestImport, true))
    .orderBy(asc(jobs.installOn), asc(jobs.jobNumber), asc(folders.position));

  const folderIds = rows.map((r) => r.folder.id);
  const jobIds = [...new Set(rows.map((r) => r.job.id))];
  const steps = folderIds.length
    ? await db.select().from(folderSteps).where(inArray(folderSteps.folderId, folderIds))
    : [];
  const orders = jobIds.length ? await db.select().from(specialOrders).where(inArray(specialOrders.jobId, jobIds)) : [];

  const stepsByFolder = Map.groupBy(steps, (s) => s.folderId);
  const ordersByJob = Map.groupBy(orders, (o) => o.jobId);

  return {
    today,
    lastImport: lastImport ?? null,
    folders: rows.map(({ folder, job }) => ({
      id: folder.id,
      jobNumber: job.jobNumber,
      customer: job.customer,
      description: job.description,
      city: job.city,
      designer: job.designer,
      installer: job.installer,
      contractOn: job.contractOn,
      dueOn: job.dueOn,
      installOn: job.installOn,
      daysToInstall: job.installOn ? daysBetween(today, job.installOn) : null,
      amountCents: job.amountCents,
      balanceCents: job.balanceCents,
      letter: folder.letter,
      room: folder.room,
      color: folder.color,
      furthestStep: folder.furthestStep,
      nextStep: folder.nextStep,
      lastStep: folder.lastStep,
      lastDoneOn: folder.lastDoneOn,
      lastRef: folder.lastRef,
      risk: installRisk(folder.nextStep, job.installOn, today),
      steps: (stepsByFolder.get(folder.id) ?? [])
        .sort((a, b) => a.step - b.step)
        .map((s) => ({ step: s.step, doneOn: s.doneOn, ref: s.ref, detail: s.detail })),
      specialOrders: (ordersByJob.get(job.id) ?? []).map((o) => ({
        item: o.item,
        vendor: o.vendor,
        detail: o.detail,
        eta: o.eta,
        receivedOn: o.receivedOn,
      })),
    })),
  };
}

export function isAtRisk(f: BoardFolder): boolean {
  return f.nextStep !== null && f.daysToInstall !== null && f.daysToInstall <= RISK_WINDOW_DAYS;
}
