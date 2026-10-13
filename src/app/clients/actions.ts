"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { clientLoginLink, createClient, linkJobs } from "@/lib/auth/accounts";
import { requestMeta, requireStaff } from "@/lib/auth/current";
import type { ActionResult } from "@/components/ActionForm";
import { emailEnabled, sendEmail } from "@/lib/email";

const jobList = (value: FormDataEntryValue | null) => String(value ?? "").split(/[\s,;]+/).filter(Boolean);

export async function addClient(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireStaff("clients.manage");
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  if (!name) return { error: "Enter the client's name." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right." };
  try {
    await createClient(await getDb(), { name, email, phone: String(form.get("phone") ?? ""), jobNumbers: jobList(form.get("jobs")) }, me?.id ?? null);
  } catch {
    return { error: "A client with that email already exists." };
  }
  revalidatePath("/clients");
  return { message: `${name} added. Make a sign-in link for them below when they need it.` };
}

export async function addJobs(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireStaff("clients.manage");
  await linkJobs(await getDb(), Number(form.get("id")), jobList(form.get("jobs")));
  revalidatePath("/clients");
  return { message: "Jobs linked." };
}

export async function makeClientLink(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireStaff("clients.manage");
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: eq(clients.id, Number(form.get("id"))) });
  if (!client?.active) return { error: "That client is switched off." };
  const link = `${(await requestMeta()).origin}/portal/link/${await clientLoginLink(db, client.id, me?.id ?? null)}`;
  if (form.get("send") === "email" && client.email && emailEnabled()) {
    const sent = await sendEmail(client.email, "Your Closets by Design project", `Hi ${client.name},\n\nOpen your project here (the link works once, for 3 days):\n${link}\n`);
    return sent ? { message: `Emailed to ${client.email}.` } : { error: "The email didn't send. Copy the link instead.", link };
  }
  return { message: "Text, email or show this link to the client. It works once, for 3 days, and keeps them signed in on that device for 90 days.", link };
}
