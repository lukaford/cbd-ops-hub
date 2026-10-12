import { and, eq, notInArray } from "drizzle-orm";
import type { Db } from "@/db";
import { folderSteps, folders, importBatches, jobs, specialOrders } from "@/db/schema";
import type { ParseResult } from "./manager/parse";
import { folderProgress } from "./manager/progress";

const cents = (n: number | null) => (n === null ? null : Math.round(n * 100));

export interface ImportSummary {
  importId: number;
  rowCount: number;
  jobCount: number;
  folderCount: number;
  droppedJobCount: number;
}

// Each paste is a full snapshot of Manager's Special Orders table: jobs in it are
// replaced wholesale, and jobs missing from it are marked as no longer listed.
export async function saveSnapshot(db: Db, parsed: ParseResult): Promise<ImportSummary> {
  return db.transaction(async (tx) => {
    const folderCount = parsed.jobs.reduce((n, j) => n + j.folders.length, 0);
    const [batch] = await tx
      .insert(importBatches)
      .values({ rowCount: parsed.rowCount, jobCount: parsed.jobs.length, folderCount })
      .returning({ id: importBatches.id });

    for (const job of parsed.jobs) {
      const values = {
        customer: job.customer,
        description: job.description,
        address: job.address,
        city: job.city,
        zip: job.zip,
        designer: job.designer,
        installer: job.installer,
        contractOn: job.contractOn,
        dueOn: job.dueOn,
        installOn: job.installOn,
        amountCents: cents(job.amount),
        balanceCents: cents(job.balance),
        inLatestImport: true,
        lastImportId: batch.id,
        updatedAt: new Date(),
      };
      const [row] = await tx
        .insert(jobs)
        .values({ jobNumber: job.jobNumber, ...values })
        .onConflictDoUpdate({ target: jobs.jobNumber, set: values })
        .returning({ id: jobs.id });

      await tx.delete(folders).where(eq(folders.jobId, row.id));
      await tx.delete(specialOrders).where(eq(specialOrders.jobId, row.id));

      for (const folder of job.folders) {
        const p = folderProgress(folder);
        const [f] = await tx
          .insert(folders)
          .values({
            jobId: row.id,
            position: folder.index,
            letter: folder.letter,
            room: folder.room,
            color: folder.color,
            furthestStep: p.furthest,
            nextStep: p.next,
            lastStep: p.last?.step ?? null,
            lastDoneOn: p.last?.doneOn ?? null,
            lastRef: p.last?.ref ?? null,
          })
          .returning({ id: folders.id });
        const steps = Object.values(folder.steps).map((s) => ({
          folderId: f.id,
          step: s.step,
          doneOn: s.doneOn,
          ref: s.ref,
          eta: s.eta,
          detail: s.detail,
          material: s.material,
        }));
        if (steps.length) await tx.insert(folderSteps).values(steps);
      }

      if (job.specialOrders.length) {
        await tx.insert(specialOrders).values(
          job.specialOrders.map((o) => ({
            jobId: row.id,
            item: o.item,
            vendor: o.vendor,
            material: o.material,
            detail: o.detail,
            ref: o.ref,
            eta: o.eta,
            receivedOn: o.receivedOn,
          })),
        );
      }
    }

    const listed = parsed.jobs.map((j) => j.jobNumber);
    const dropped = listed.length
      ? await tx
          .update(jobs)
          .set({ inLatestImport: false })
          .where(and(eq(jobs.inLatestImport, true), notInArray(jobs.jobNumber, listed)))
          .returning({ id: jobs.id })
      : [];
    const droppedJobCount = dropped.length;
    await tx.update(importBatches).set({ droppedJobCount }).where(eq(importBatches.id, batch.id));

    return { importId: batch.id, rowCount: parsed.rowCount, jobCount: parsed.jobs.length, folderCount, droppedJobCount };
  });
}
