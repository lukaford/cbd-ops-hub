"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { inviteUser, passwordResetLink, staffInputProblem, updateUser, type StaffInput } from "@/lib/auth/accounts";
import { requestMeta, requireStaff } from "@/lib/auth/current";
import type { ActionResult } from "@/components/ActionForm";
import { emailEnabled, sendEmail } from "@/lib/email";

function staffInput(form: FormData): StaffInput {
  return {
    email: String(form.get("email") ?? ""),
    name: String(form.get("name") ?? ""),
    initials: String(form.get("initials") ?? ""),
    role: String(form.get("role") ?? "staff"),
    departments: form.getAll("departments").map(String),
  };
}

async function admin() {
  const me = await requireStaff("users.manage");
  if (!me) throw new Error("Create the first admin account on the setup page first.");
  return me;
}

export async function addUser(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await admin();
  const input = staffInput(form);
  const problem = staffInputProblem(input);
  if (problem) return { error: problem };
  const db = await getDb();
  let result;
  try {
    result = await inviteUser(db, input, me.id);
  } catch {
    return { error: "Someone already has that email." };
  }
  const link = `${(await requestMeta()).origin}/invite/${result.token}`;
  revalidatePath("/admin/users");
  const sent = emailEnabled() && (await sendEmail(result.user.email, "Your Closets by Design hub account", `Hi ${result.user.name},\n\nSet your password here (the link works for 7 days):\n${link}\n`));
  return {
    message: sent ? `Invite emailed to ${result.user.email}. You can also send them this link:` : `Account made. Send ${result.user.name} this link to set their password (works for 7 days, once):`,
    link,
  };
}

export async function saveUser(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await admin();
  const id = Number(form.get("id"));
  const input = staffInput(form);
  const problem = staffInputProblem(input);
  if (problem) return { error: problem };
  if (id === me.id && (input.role !== "admin" || form.get("active") !== "on")) return { error: "You can't remove your own admin access." };
  try {
    await updateUser(await getDb(), id, { ...input, active: form.get("active") === "on" }, me.id);
  } catch (err) {
    return { error: err instanceof Error && !/duplicate|unique/i.test(err.message) ? err.message : "Someone already has that email." };
  }
  revalidatePath("/admin/users");
  return { message: "Saved." };
}

export async function resetLink(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await admin();
  const token = await passwordResetLink(await getDb(), Number(form.get("id")), me.id);
  return { message: "Send them this link to choose a new password (works for 2 hours, once):", link: `${(await requestMeta()).origin}/invite/${token}` };
}
