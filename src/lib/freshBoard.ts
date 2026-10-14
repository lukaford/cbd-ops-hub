import { getDb } from "@/db";
import { todayIn } from "./board";
import { visibleJobs } from "./auth/current";
import { limitBoard, loadJobBoard, type JobBoard } from "./jobBoard";
import { jobTreadRefreshing, keepJobTreadFresh } from "./jobtread/refresh";

export const TIME_ZONE = process.env.SHOP_TIME_ZONE ?? "America/New_York";

// Every JobTread-backed page: start a background pull from JobTread if the copy is stale, then load
// it, limited to the viewer's own jobs when their access is limited.
export async function freshBoard(): Promise<{ today: string; board: JobBoard; error?: string; refreshing: boolean }> {
  const db = await getDb();
  const today = todayIn(TIME_ZONE);
  const refresh = await keepJobTreadFresh(db);
  return { today, board: limitBoard(await loadJobBoard(db, today), await visibleJobs()), error: refresh.error, refreshing: jobTreadRefreshing() };
}
