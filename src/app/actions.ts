"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { refreshFromJobTread } from "@/lib/jobtread/refresh";

export async function refreshNow(): Promise<void> {
  await refreshFromJobTread(await getDb(), true);
  revalidatePath("/");
}
