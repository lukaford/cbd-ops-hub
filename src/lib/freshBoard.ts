import { getDb } from "@/db";
import { todayIn } from "./board";
import { loadJobBoard, type JobBoard } from "./jobBoard";
import { refreshFromJobTread } from "./jobtread/refresh";

export const TIME_ZONE = process.env.SHOP_TIME_ZONE ?? "America/New_York";

// Every JobTread-backed page: pull from JobTread if the copy is stale, then load it.
export async function freshBoard(): Promise<{ today: string; board: JobBoard; error?: string }> {
  const db = await getDb();
  const today = todayIn(TIME_ZONE);
  const refresh = await refreshFromJobTread(db);
  return { today, board: await loadJobBoard(db, today), error: refresh.error };
}
