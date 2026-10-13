"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { currentStaff } from "@/lib/auth/current";

export async function markAllRead(): Promise<void> {
  const me = await currentStaff();
  if (!me) return;
  await (await getDb()).update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, me.user.id), isNull(notifications.readAt)));
  revalidatePath("/", "layout");
}
