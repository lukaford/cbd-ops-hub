// Sales managers can change the built-in detail sheets: reword, reorder, add or
// turn off questions, and decide which dropdown list each one offers. Their
// version is kept in form_definitions; shared dropdown lists in option_lists.
// Submitted paperwork keeps the form it was filled on (paperwork_docs.def).

import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { formDefinitions, optionLists } from "@/db/schema";
import { DETAIL_SHEETS } from "./detailSheets";
import { BUILTIN_LISTS, type OptionList } from "./options";
import { FIELD_TYPES, hasOptions, type DetailFormDef, type FieldType, type FormField, type FormSection } from "./types";

export { FIELD_TYPES, hasOptions };

export interface EditableList extends OptionList {
  builtin: boolean; // one of the app's lists (can be changed, not deleted)
  changed: boolean; // differs from the app's list
}

export async function loadLists(db: Db): Promise<EditableList[]> {
  const rows = await db.select().from(optionLists);
  const saved = new Map(rows.map((r) => [r.key, r]));
  const out: EditableList[] = BUILTIN_LISTS.map((l) => {
    const r = saved.get(l.key);
    return r ? { key: l.key, name: r.name, options: r.options as string[], builtin: true, changed: true } : { ...l, builtin: true, changed: false };
  });
  for (const r of rows) if (!BUILTIN_LISTS.some((l) => l.key === r.key)) out.push({ key: r.key, name: r.name, options: r.options as string[], builtin: false, changed: true });
  return out;
}

// Each detail sheet as a manager last saved it (or as built in), before lists are filled in.
export async function loadEditableForms(db: Db): Promise<{ def: DetailFormDef; changed: boolean; updatedAt?: Date }[]> {
  const rows = await db.select().from(formDefinitions);
  return DETAIL_SHEETS.map((base) => {
    const r = rows.find((x) => x.form === base.key);
    return r ? { def: { ...(r.def as DetailFormDef), key: base.key, kind: "detail", room: base.room, position: base.position }, changed: true, updatedAt: r.updatedAt } : { def: base, changed: false };
  });
}

// The form designers fill in: turned-off questions left out, shared lists filled in.
export function resolveForm(def: DetailFormDef, lists: OptionList[]): DetailFormDef {
  const byKey = new Map(lists.map((l) => [l.key, l.options]));
  const sections: FormSection[] = def.sections
    .map((s) => ({
      ...s,
      fields: s.fields.filter((f) => !f.hidden).map((f) => (f.list && byKey.has(f.list) ? { ...f, options: byKey.get(f.list) } : f)),
    }))
    .filter((s) => s.fields.length > 0 || s.note);
  return { ...def, sections };
}

export async function currentDetailForms(db: Db): Promise<Map<string, DetailFormDef>> {
  const [forms, lists] = await Promise.all([loadEditableForms(db), loadLists(db)]);
  return new Map(forms.map((f) => [f.def.key, resolveForm(f.def, lists)]));
}

// ---- checking what the editor sends ----------------------------------------

const KEY = /^[a-z0-9_]{1,60}$/;
const PREFILLS = new Set(["customer", "jobNumber", "room", "designer", "date"]);
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

function cleanOptions(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of v) {
    const s = clip(o, 200);
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
    if (out.length >= 500) break;
  }
  return out;
}

export function cleanListOptions(text: string): string[] {
  return cleanOptions(text.split(/\r?\n/));
}

// Rebuilds a form from the editor's JSON, keeping only what a form may hold.
// Throws with a message a manager can act on.
export function cleanForm(raw: unknown, base: DetailFormDef, listKeys: Set<string>): DetailFormDef {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(r.sections)) throw new Error("The form has no sections.");
  const keys = new Set<string>();
  const sectionKeys = new Set<string>();
  const sections: FormSection[] = [];
  for (const rs of r.sections.slice(0, 60) as Record<string, unknown>[]) {
    const key = String(rs?.key ?? "");
    const title = clip(rs?.title, 120);
    if (!KEY.test(key) || sectionKeys.has(key)) throw new Error(`Section "${title || key}" has a bad or repeated id.`);
    if (!title) throw new Error("Every section needs a title.");
    sectionKeys.add(key);
    const fields: FormField[] = [];
    for (const rf of (Array.isArray(rs.fields) ? rs.fields : []).slice(0, 300) as Record<string, unknown>[]) {
      const fkey = String(rf?.key ?? "");
      const label = clip(rf?.label, 200);
      const type = rf?.type as FieldType;
      if (!KEY.test(fkey) || keys.has(fkey)) throw new Error(`Question "${label || fkey}" has a bad or repeated id.`);
      if (!label) throw new Error(`A question in "${title}" has no wording.`);
      if (!FIELD_TYPES.some((t) => t.type === type)) throw new Error(`"${label}" has an unknown answer type.`);
      keys.add(fkey);
      const f: FormField = { key: fkey, label, type };
      if (hasOptions(type)) {
        const list = typeof rf.list === "string" && listKeys.has(rf.list) ? rf.list : undefined;
        const options = cleanOptions(rf.options);
        if (list) f.list = list;
        else if (options.length) f.options = options;
        else throw new Error(`"${label}" needs at least one choice, or a shared list.`);
      }
      const hint = clip(rf.hint, 300);
      if (hint) f.hint = hint;
      if (rf.wide === true) f.wide = true;
      if (rf.required === true) f.required = true;
      if (rf.hidden === true) f.hidden = true;
      if (typeof rf.prefill === "string" && PREFILLS.has(rf.prefill)) f.prefill = rf.prefill as FormField["prefill"];
      fields.push(f);
    }
    const note = clip(rs.note, 500);
    sections.push({ key, title, ...(note ? { note } : {}), fields });
  }
  if (!sections.some((s) => s.fields.length)) throw new Error("The form has no questions.");
  const note = clip(r.note, 500);
  return {
    key: base.key,
    kind: "detail",
    room: base.room,
    position: base.position,
    name: clip(r.name, 80) || base.name,
    revision: clip(r.revision, 40),
    ...(note ? { note } : {}),
    sections,
  };
}

export async function saveForm(db: Db, def: DetailFormDef, userId: number | null): Promise<void> {
  await db
    .insert(formDefinitions)
    .values({ form: def.key, def, updatedByUserId: userId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: formDefinitions.form, set: { def, updatedByUserId: userId, updatedAt: new Date() } });
}

export async function resetForm(db: Db, key: string): Promise<void> {
  await db.delete(formDefinitions).where(eq(formDefinitions.form, key));
}
