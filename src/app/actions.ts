"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { todayIn } from "@/lib/board";
import { refreshFromJobTread } from "@/lib/jobtread/refresh";

const TIME_ZONE = process.env.SHOP_TIME_ZONE ?? "America/New_York";

export async function refreshNow(): Promise<void> {
  await refreshFromJobTread(await getDb(), todayIn(TIME_ZONE), true);
  revalidatePath("/");
}
