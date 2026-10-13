"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { askForMissingDesigners } from "@/lib/designers";
import { saveSnapshot } from "@/lib/import";
import { parseSpecialOrders, PasteError } from "@/lib/manager/parse";

export type ImportState = { ok: true; message: string } | { ok: false; message: string } | null;

export async function importPaste(_prev: ImportState, form: FormData): Promise<ImportState> {
  const text = String(form.get("paste") ?? "");
  if (!text.trim()) return { ok: false, message: "Paste the Special Orders table first." };
  try {
    const parsed = parseSpecialOrders(text);
    if (!parsed.jobs.some((j) => j.folders.length)) {
      return { ok: false, message: "No step rows found. Make sure you copied the Special Orders table." };
    }
    const db = await getDb();
    const s = await saveSnapshot(db, parsed);
    await askForMissingDesigners(db).catch((err) => console.error("Designer alerts failed:", err));
    revalidatePath("/");
    revalidatePath("/folders");
    const dropped = s.droppedJobCount ? ` ${s.droppedJobCount} jobs from the last paste are no longer listed and were taken off the board.` : "";
    return { ok: true, message: `Loaded ${s.rowCount} rows: ${s.jobCount} jobs, ${s.folderCount} folders.${dropped}` };
  } catch (err) {
    if (err instanceof PasteError) return { ok: false, message: err.message };
    throw err;
  }
}
