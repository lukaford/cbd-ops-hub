"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { audit, clientLoginLink, createClient, linkJobs } from "@/lib/auth/accounts";
import { requestMeta, requireStaff, type Staff } from "@/lib/auth/current";
import type { ActionResult } from "@/components/ActionForm";
import { emailEnabled, sendEmail } from "@/lib/email";

const jobList = (value: FormDataEntryValue | null) => String(value ?? "").split(/[\s,;]+/).filter(Boolean);

// People who see only their own work can only touch their own clients.
async function ownClient(staff: Staff | null, id: number) {
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!client || (staff?.access.scope === "own" && client.assignedUserId !== staff.user.id)) throw new Error("Client not found.");
  return { db, client };
}

export async function addClient(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireStaff("clients.manage");
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  if (!name) return { error: "Enter the client's name." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right." };
  // A designer's new client is theirs; the office picks the designer.
  const assignedUserId = me?.access.scope === "own" ? me.user.id : Number(form.get("assignedUserId")) || null;
  try {
    await createClient(
      await getDb(),
      { name, email, phone: String(form.get("phone") ?? ""), jobNumbers: jobList(form.get("jobs")), assignedUserId },
      me?.user.id ?? null,
    );
  } catch {
    return { error: "A client with that email already exists." };
  }
  revalidatePath("/clients");
  return { message: `${name} added. Make a sign-in link for them below when they need it.` };
}

export async function updateClient(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireStaff("clients.manage");
  const { db, client } = await ownClient(me, Number(form.get("id")));
  await linkJobs(db, client.id, jobList(form.get("jobs")));
  if (me?.access.scope !== "own" && form.has("assignedUserId")) {
    await db.update(clients).set({ assignedUserId: Number(form.get("assignedUserId")) || null }).where(eq(clients.id, client.id));
  }
  await audit(db, { action: "client_updated", userId: me?.user.id, entity: "client", entityId: client.id });
  revalidatePath("/clients");
  return { message: "Saved." };
}

export async function makeClientLink(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireStaff("clients.manage");
  const { db, client } = await ownClient(me, Number(form.get("id")));
  if (!client.active) return { error: "That client is switched off." };
  const link = `${(await requestMeta()).origin}/portal/link/${await clientLoginLink(db, client.id, me?.user.id ?? null)}`;
  if (form.get("send") === "email" && client.email && emailEnabled()) {
    const sent = await sendEmail(client.email, "Your Closets by Design project", `Hi ${client.name},\n\nOpen your project here (the link works once, for 3 days):\n${link}\n`);
    return sent ? { message: `Emailed to ${client.email}.` } : { error: "The email didn't send. Copy the link instead.", link };
  }
  return { message: "Text, email or show this link to the client. It works once, for 3 days, and keeps them signed in on that device for 90 days.", link };
}
