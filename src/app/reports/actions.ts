"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { savedReports } from "@/db/schema";

export async function saveReport(form: FormData): Promise<void> {
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const query = String(form.get("query") ?? "");
  if (!name) return;
  const [row] = await (await getDb()).insert(savedReports).values({ name, query }).returning();
  revalidatePath("/reports");
  redirect(`/reports?${query}${query ? "&" : ""}saved=${row.id}`);
}

export async function deleteReport(form: FormData): Promise<void> {
  await (await getDb()).delete(savedReports).where(eq(savedReports.id, Number(form.get("id"))));
  revalidatePath("/reports");
  redirect("/reports");
}
