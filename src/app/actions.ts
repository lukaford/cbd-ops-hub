"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { startJobTreadRefresh } from "@/lib/jobtread/refresh";

export async function refreshNow(): Promise<void> {
  startJobTreadRefresh(await getDb());
  revalidatePath("/");
}
