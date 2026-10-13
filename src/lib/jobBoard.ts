import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { folders, jobs, jobtreadJobs, jobtreadSyncs } from "@/db/schema";
import { COMPLETE, stageInfo } from "./jobtread/fields";
import { daysBetween, RISK_WINDOW_DAYS, type Risk } from "./manager/progress";

export interface BoardJob {
  jobtreadId: string;
  jobNumber: string;
  name: string;
  customer: string;
  city: string;
  stage: string | null;
  stageSince: Date | null;
  installOn: string | null;
  installFieldOn: string | null;
  installConfirmed: boolean;
  daysToInstall: number | null;
  production: { label: string; on: string | null }[];
  materialsOrdered: boolean | null;
  materials: string[];
  orderBy: string | null;
  // Installed or marked Complete; shown under Past instead of Upcoming.
  past: boolean;
  risk: Risk;
  // From the latest Manager paste, when the job is in it.
  manager: { installOn: string | null; folders: number; waitingOnStep: number | null } | null;
}

export interface JobBoard {
  lastSync: { id: number; createdAt: Date; jobCount: number } | null;
  jobs: BoardJob[];
}

export function jobRisk(stage: string | null, installOn: string | null, today: string): Risk {
  if (stageInfo(stage)?.inProduction) return "in-production";
  if (!installOn) return "no-date";
  const days = daysBetween(today, installOn);
  if (days < 0) return "past-install";
  if (days <= 7) return "critical";
  if (days <= RISK_WINDOW_DAYS) return "warning";
  return "ok";
}

export function isPast(stage: string | null, installOn: string | null, today: string): boolean {
  return stage === COMPLETE || (installOn !== null && installOn < today);
}

export function isJobAtRisk(j: BoardJob): boolean {
  return !j.past && (j.risk === "critical" || j.risk === "warning");
}

export async function loadJobBoard(db: Db, today: string): Promise<JobBoard> {
  const [lastSync] = await db.select().from(jobtreadSyncs).orderBy(desc(jobtreadSyncs.id)).limit(1);
  const rows = await db.select().from(jobtreadJobs).orderBy(asc(jobtreadJobs.installOn), asc(jobtreadJobs.jobNumber));

  const numbers = rows.map((r) => r.jobNumber);
  const mgrJobs = numbers.length
    ? await db.select().from(jobs).where(inArray(jobs.jobNumber, numbers))
    : [];
  const mgrFolders = mgrJobs.length
    ? await db
        .select({ jobNumber: jobs.jobNumber, nextStep: folders.nextStep })
        .from(folders)
        .innerJoin(jobs, eq(folders.jobId, jobs.id))
        .where(inArray(jobs.jobNumber, numbers))
    : [];
  const mgrByNumber = new Map(mgrJobs.filter((j) => j.inLatestImport).map((j) => [j.jobNumber, j]));
  const foldersByNumber = Map.groupBy(mgrFolders, (f) => f.jobNumber);

  return {
    lastSync: lastSync ?? null,
    jobs: rows.map((r) => {
      const mgr = mgrByNumber.get(r.jobNumber);
      const fs = foldersByNumber.get(r.jobNumber) ?? [];
      const waiting = fs.map((f) => f.nextStep).filter((s): s is number => s !== null);
      return {
        jobtreadId: r.jobtreadId,
        jobNumber: r.jobNumber,
        name: r.name,
        customer: r.customer,
        city: r.city,
        stage: r.stage,
        stageSince: r.stageSince,
        installOn: r.installOn,
        installFieldOn: r.installFieldOn,
        installConfirmed: r.installConfirmed,
        daysToInstall: r.installOn ? daysBetween(today, r.installOn) : null,
        production: [
          { label: "CNC cut", on: r.cncCutOn },
          { label: "Edge banding", on: r.edgeBandingOn },
          { label: "Drawer assembly", on: r.drawerAssemblyOn },
          { label: "Final QA", on: r.finalQaOn },
        ],
        materialsOrdered: r.materialsOrdered,
        materials: r.materials,
        orderBy: r.orderBy,
        past: isPast(r.stage, r.installOn, today),
        risk: jobRisk(r.stage, r.installOn, today),
        manager: mgr
          ? { installOn: mgr.installOn, folders: fs.length, waitingOnStep: waiting.length ? Math.min(...waiting) : null }
          : null,
      };
    }),
  };
}
