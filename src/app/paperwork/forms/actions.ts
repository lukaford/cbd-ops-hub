"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { formDefinitions, optionLists } from "@/db/schema";
import { requireStaff } from "@/lib/auth/current";
import { audit } from "@/lib/auth/accounts";
import { DETAIL_SHEETS } from "@/lib/forms/native/detailSheets";
import { cleanForm, cleanListOptions, loadLists, resetForm, saveForm } from "@/lib/forms/native/editing";
import { BUILTIN_LISTS } from "@/lib/forms/native/options";
import type { DetailFormDef } from "@/lib/forms/native/types";

const str = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

export async function saveFormDef(key: string, raw: unknown): Promise<{ ok: boolean; error?: string; savedAt?: string }> {
  const staff = await requireStaff("forms.manage");
  const base = DETAIL_SHEETS.find((d) => d.key === key);
  if (!base) return { ok: false, error: "That form doesn't exist." };
  const db = await getDb();
  let def: DetailFormDef;
  try {
    def = cleanForm(raw, base, new Set((await loadLists(db)).map((l) => l.key)));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  await saveForm(db, def, staff?.user.id ?? null);
  await audit(db, { action: "form.edit", userId: staff?.user.id, entity: "form", entityId: key });
  revalidatePath("/paperwork/forms");
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function restoreForm(form: FormData): Promise<void> {
  const staff = await requireStaff("forms.manage");
  const key = str(form, "form");
  const db = await getDb();
  await resetForm(db, key);
  await audit(db, { action: "form.restore", userId: staff?.user.id, entity: "form", entityId: key });
  revalidatePath("/paperwork/forms");
  redirect(`/paperwork/forms/${encodeURIComponent(key)}?restored=1`);
}

// Saves a dropdown list. A new list gets a key from its name.
export async function saveList(form: FormData): Promise<void> {
  const staff = await requireStaff("forms.manage");
  const db = await getDb();
  const name = str(form, "name").slice(0, 80);
  const options = cleanListOptions(String(form.get("options") ?? ""));
  let key = str(form, "key");
  const back = str(form, "back");
  const fail = (msg: string) => redirect(`/paperwork/forms/lists?${new URLSearchParams({ ...(key ? { list: key } : {}), error: msg })}`);
  if (!name) fail("Give the list a name.");
  if (!options.length) fail("Add at least one choice, one per line.");
  const lists = await loadLists(db);
  if (!key) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "list";
    key = `my_${slug}`;
    for (let n = 2; lists.some((l) => l.key === key); n++) key = `my_${slug}_${n}`;
  } else if (!lists.some((l) => l.key === key)) fail("That list no longer exists.");
  await db
    .insert(optionLists)
    .values({ key, name, options, updatedByUserId: staff?.user.id ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({ target: optionLists.key, set: { name, options, updatedByUserId: staff?.user.id ?? null, updatedAt: new Date() } });
  await audit(db, { action: "list.edit", userId: staff?.user.id, entity: "option_list", entityId: key, data: { count: options.length } });
  revalidatePath("/paperwork/forms");
  redirect(back && back.startsWith("/paperwork/forms/") ? back : `/paperwork/forms/lists?list=${encodeURIComponent(key)}&saved=1`);
}

// Puts one of the app's lists back as built, or deletes a list a manager added
// when no form uses it.
export async function removeList(form: FormData): Promise<void> {
  const staff = await requireStaff("forms.manage");
  const db = await getDb();
  const key = str(form, "key");
  const builtin = BUILTIN_LISTS.some((l) => l.key === key);
  if (!builtin) {
    const saved = await db.select({ form: formDefinitions.form, def: formDefinitions.def }).from(formDefinitions);
    const users = saved.filter((r) => (r.def as DetailFormDef).sections.some((s) => s.fields.some((f) => f.list === key)));
    if (users.length) {
      const names = users.map((u) => DETAIL_SHEETS.find((d) => d.key === u.form)?.name ?? u.form).join(", ");
      redirect(`/paperwork/forms/lists?${new URLSearchParams({ list: key, error: `Still used on ${names}. Change those questions first.` })}`);
    }
  }
  await db.delete(optionLists).where(eq(optionLists.key, key));
  await audit(db, { action: builtin ? "list.restore" : "list.delete", userId: staff?.user.id, entity: "option_list", entityId: key });
  revalidatePath("/paperwork/forms");
  redirect(builtin ? `/paperwork/forms/lists?list=${encodeURIComponent(key)}&saved=1` : "/paperwork/forms/lists");
}
