"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import {
  assignJobs,
  deleteCategory,
  inviteUser,
  passwordResetLink,
  saveCategory,
  staffInputProblem,
  updateUser,
  type StaffInput,
} from "@/lib/auth/accounts";
import { requestMeta, requireStaff } from "@/lib/auth/current";
import type { ActionResult } from "@/components/ActionForm";
import { emailEnabled, sendEmail } from "@/lib/email";

const list = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split(/[\n,;]+/)
    .map((v) => v.trim())
    .filter(Boolean);

function staffInput(form: FormData): StaffInput {
  return {
    email: String(form.get("email") ?? ""),
    name: String(form.get("name") ?? ""),
    initials: String(form.get("initials") ?? ""),
    role: String(form.get("role") ?? "staff"),
    categoryIds: form.getAll("categories").map(Number).filter(Boolean),
    jobNames: list(form.get("jobNames")),
  };
}

async function admin() {
  const me = await requireStaff("users.manage");
  if (!me) throw new Error("Create the first admin account on the setup page first.");
  return me.user;
}

const isDuplicate = (err: unknown) => err instanceof Error && /duplicate|unique/i.test(err.message + String((err as { cause?: unknown }).cause ?? ""));

export async function addUser(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await admin();
  const input = staffInput(form);
  const problem = staffInputProblem(input);
  if (problem) return { error: problem };
  const db = await getDb();
  let result;
  try {
    result = await inviteUser(db, input, me.id);
  } catch (err) {
    if (isDuplicate(err)) return { error: "Someone already has that email." };
    throw err;
  }
  await assignJobs(db, result.user.id, list(form.get("jobs")), me.id);
  const link = `${(await requestMeta()).origin}/invite/${result.token}`;
  revalidatePath("/admin", "layout");
  const sent =
    emailEnabled() &&
    (await sendEmail(result.user.email, "Your Closets by Design hub account", `Hi ${result.user.name},\n\nSet your password here (the link works for 7 days):\n${link}\n`));
  return {
    message: sent ? `Invite emailed to ${result.user.email}. You can also send them this link:` : `Account made. Send ${result.user.name} this link to set their password (works once, for 7 days):`,
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
  const db = await getDb();
  try {
    await updateUser(db, id, { ...input, active: form.get("active") === "on" }, me.id);
  } catch (err) {
    return { error: isDuplicate(err) ? "Someone already has that email." : err instanceof Error ? err.message : "Couldn't save." };
  }
  await assignJobs(db, id, list(form.get("jobs")), me.id);
  revalidatePath("/admin", "layout");
  return { message: "Saved. Their access changes straight away." };
}

export async function resetLink(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await admin();
  const token = await passwordResetLink(await getDb(), Number(form.get("id")), me.id);
  return { message: "Send them this link to choose a password (works once, for 2 hours):", link: `${(await requestMeta()).origin}/invite/${token}` };
}

export async function saveCategoryAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await admin();
  const id = Number(form.get("id")) || null;
  try {
    await saveCategory(
      await getDb(),
      id,
      {
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        permissions: form.getAll("permissions").map(String),
        jobScope: String(form.get("jobScope") ?? "all"),
      },
      me.id,
    );
  } catch (err) {
    return { error: isDuplicate(err) ? "There's already a category with that name." : err instanceof Error ? err.message : "Couldn't save." };
  }
  revalidatePath("/admin", "layout");
  return { message: id ? "Saved. Everyone in it gets the change straight away." : "Category added." };
}

export async function deleteCategoryAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await admin();
  try {
    await deleteCategory(await getDb(), Number(form.get("id")), me.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't delete." };
  }
  revalidatePath("/admin", "layout");
  return { message: "Deleted." };
}
