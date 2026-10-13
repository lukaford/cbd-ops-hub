"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { requireStaff } from "@/lib/auth/current";
import { assignDesigner } from "@/lib/designers";

export async function assignJob(form: FormData): Promise<void> {
  const me = await requireStaff("jobs.assign");
  const jobNumber = String(form.get("jobNumber") ?? "").trim();
  const designerId = Number(form.get("designerId"));
  if (!jobNumber || !designerId) return;
  await assignDesigner(await getDb(), jobNumber, designerId, me?.user.id ?? null);
  revalidatePath("/assign");
  revalidatePath("/", "layout");
}
