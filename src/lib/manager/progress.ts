import type { IsoDate } from "./parse";
import { FINAL_STEP } from "./steps";

export interface FolderSteps {
  color: string;
  steps: Record<number, { doneOn: IsoDate | null; ref: string }>;
}

export interface Progress {
  furthest: number; // furthest step (1-9) with a date, 0 if none
  next: number | null; // step the folder is waiting on, null once received by production
  last: { step: number; doneOn: IsoDate; ref: string } | null;
}

// Manager often leaves earlier steps undated once later ones are entered,
// so the furthest dated step decides how far a folder has got.
export function folderProgress(folder: FolderSteps): Progress {
  let furthest = 0;
  for (let s = 1; s <= FINAL_STEP; s++) {
    if (folder.steps[s]?.doneOn) furthest = s;
  }
  let next: number | null = furthest >= FINAL_STEP ? null : furthest + 1;
  // Job color counts as done once a color is entered, dated or not.
  if (next === 8 && folder.color) next = 9;

  let last: Progress["last"] = null;
  for (const [step, row] of Object.entries(folder.steps)) {
    if (row.doneOn && (!last || row.doneOn >= last.doneOn)) {
      last = { step: Number(step), doneOn: row.doneOn, ref: row.ref };
    }
  }
  return { furthest, next, last };
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 864e5);
}

export type Risk = "in-production" | "past-install" | "critical" | "warning" | "ok" | "no-date";

export const RISK_WINDOW_DAYS = 14;

export function installRisk(next: number | null, installOn: IsoDate | null, today: IsoDate): Risk {
  if (next === null) return "in-production";
  if (!installOn) return "no-date";
  const days = daysBetween(today, installOn);
  if (days < 0) return "past-install";
  if (days <= 7) return "critical";
  if (days <= RISK_WINDOW_DAYS) return "warning";
  return "ok";
}
