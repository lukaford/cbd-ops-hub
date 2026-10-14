// The built-in sales forms: six detail sheets and five work sheets, ready to use
// with nothing uploaded. Each gets a form_templates row (by builtin_key) so
// paperwork can point at it like any other template.

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { formPrices, formTemplates, paperworkAnswers } from "@/db/schema";
import type { WorkbookModel } from "../sheetModel";
import { evaluateWorkbook, type Value } from "../formula";
import { sheetSources } from "../review";
import { formatValue } from "../numFmt";
import { DETAIL_SHEETS, allFields } from "./detailSheets";
import { answerText, isBlank, type Answers, type DetailFormDef } from "./types";
import { priceKeys, withPrices, type Prices, type WorksheetLayout } from "./worksheetBuild";
import closet from "./worksheets/closet.json";
import pantry from "./worksheets/pantry.json";
import office from "./worksheets/office.json";
import garage from "./worksheets/garage.json";
import laundry from "./worksheets/laundry.json";

export interface WorksheetFormDef {
  key: string;
  kind: "worksheet";
  room: string;
  name: string;
  revision: string;
  position: number;
  model: WorkbookModel; // prices taken out
  layout: WorksheetLayout;
}

type Built = { model: unknown; layout: unknown };
const ws = (room: string, position: number, data: Built): WorksheetFormDef => {
  const model = data.model as WorkbookModel;
  return { key: `${room.toLowerCase()}-worksheet`, kind: "worksheet", room, name: `${room} Work Sheet`, revision: model.revision ?? "", position, model, layout: data.layout as WorksheetLayout };
};

export const WORKSHEETS: WorksheetFormDef[] = [ws("Closet", 100, closet), ws("Pantry", 200, pantry), ws("Office", 300, office), ws("Garage", 400, garage), ws("Laundry", 500, laundry)];

export type BuiltinForm = DetailFormDef | WorksheetFormDef;
export const BUILTIN_FORMS: BuiltinForm[] = [...WORKSHEETS, ...DETAIL_SHEETS].sort((a, b) => a.position - b.position);

export function builtinForm(key: string | null | undefined): BuiltinForm | undefined {
  return key ? BUILTIN_FORMS.find((f) => f.key === key) : undefined;
}

export const NATIVE_KINDS = { detail: "native-detail", worksheet: "native-worksheet" } as const;
export const isNativeKind = (kind: string) => kind === NATIVE_KINDS.detail || kind === NATIVE_KINDS.worksheet;

let ensured = false;

// Makes sure every built-in form has its template row, and keeps names and
// revisions in step with the code. Cheap after the first call.
export async function ensureBuiltinTemplates(db: Db): Promise<void> {
  if (ensured) return;
  const rows = await db.select({ id: formTemplates.id, builtinKey: formTemplates.builtinKey, name: formTemplates.name, revision: formTemplates.revision, position: formTemplates.position }).from(formTemplates).where(isNotNull(formTemplates.builtinKey));
  const byKey = new Map(rows.map((r) => [r.builtinKey!, r]));
  for (const f of BUILTIN_FORMS) {
    const kind = NATIVE_KINDS[f.kind];
    const row = byKey.get(f.key);
    if (!row)
      await db
        .insert(formTemplates)
        .values({ builtinKey: f.key, kind, name: f.name, room: f.room, revision: f.revision, position: f.position, fileName: "", file: new Uint8Array(), model: {} })
        .onConflictDoNothing();
    else if (row.name !== f.name || row.revision !== f.revision || row.position !== f.position)
      await db.update(formTemplates).set({ name: f.name, room: f.room, revision: f.revision, position: f.position, kind }).where(eq(formTemplates.id, row.id));
  }
  await loadPrivatePrices(db);
  ensured = true;
}

// Prices can't live in the code (the repository is public), so a copy of the
// app can bring them in a private file: private/form-prices.json next to the
// app, read once while the database has no prices yet.
async function loadPrivatePrices(db: Db): Promise<void> {
  const [any] = await db.select({ form: formPrices.form }).from(formPrices).limit(1);
  if (any) return;
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const file = process.env.FORM_PRICES_FILE || join(process.cwd(), "private", "form-prices.json");
    const counts = await savePrices(db, JSON.parse(await readFile(file, "utf8")), null);
    if (Object.keys(counts).length) console.log(`Loaded work sheet prices from ${file}`);
  } catch {
    // No private prices file: an admin loads them on Paperwork → Prices.
  }
}

// ---- prices -------------------------------------------------------------------

export async function loadPrices(db: Db, form?: string): Promise<Record<string, Prices>> {
  await ensureBuiltinTemplates(db);
  const rows = await db.select({ form: formPrices.form, cell: formPrices.cell, value: formPrices.value }).from(formPrices).where(form ? eq(formPrices.form, form) : undefined);
  const out: Record<string, Prices> = {};
  for (const r of rows) (out[r.form] ??= {})[r.cell] = r.value as number | string;
  return out;
}

export function priceStatus(def: WorksheetFormDef, prices: Prices | undefined): { needed: number; loaded: number } {
  const keys = priceKeys(def.model);
  return { needed: keys.length, loaded: keys.filter((k) => prices?.[k] !== undefined).length };
}

// Saves prices for the built-in work sheets, keeping only keys a form uses.
// Returns how many prices each form received.
export async function savePrices(db: Db, all: Record<string, Prices>, userId: number | null): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const def of WORKSHEETS) {
    const p = all[def.key];
    if (!p) continue;
    const keys = new Set(priceKeys(def.model));
    const rows = Object.entries(p)
      .filter(([k, v]) => keys.has(k) && (typeof v === "number" ? Number.isFinite(v) : typeof v === "string"))
      .map(([cell, value]) => ({ form: def.key, cell, value, updatedByUserId: userId, updatedAt: new Date() }));
    if (!rows.length) continue;
    await db.transaction(async (tx) => {
      await tx.delete(formPrices).where(and(eq(formPrices.form, def.key), inArray(formPrices.cell, rows.map((r) => r.cell))));
      await tx.insert(formPrices).values(rows);
    });
    counts[def.key] = rows.length;
  }
  return counts;
}

// The work sheet with prices in, ready to calculate and print.
export function pricedModel(def: WorksheetFormDef, prices: Prices | undefined): WorkbookModel {
  return withPrices(def.model, prices ?? {});
}

// ---- answers table --------------------------------------------------------------

export interface AnswerRow {
  field: string;
  section: string;
  label: string;
  value: string;
  num: number | null;
}

export function detailAnswerRows(def: DetailFormDef, values: Answers): AnswerRow[] {
  const out: AnswerRow[] = [];
  for (const s of def.sections)
    for (const f of s.fields) {
      const v = values[f.key];
      if (isBlank(v)) continue;
      const num = typeof v === "number" ? v : f.type === "number" && typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : null;
      out.push({ field: f.key, section: s.title, label: f.label, value: answerText(f, v), num });
    }
  return out;
}

export function worksheetAnswerRows(def: WorksheetFormDef, model: WorkbookModel, values: Record<string, Record<string, Value>>): AnswerRow[] {
  const computed = evaluateWorkbook(sheetSources(model), values);
  const out: AnswerRow[] = [];
  for (const s of def.layout.sections)
    for (const r of s.rows)
      for (const c of r.cells) {
        if (c.kind === "out" || c.kind === "price") continue;
        const v = values[c.sheet]?.[c.addr];
        if (v === undefined || v === null || v === "") continue;
        const label = [r.label, r.sub, c.col].filter(Boolean).join(" · ") || "Line";
        const total = r.cells.find((x) => x.kind === "out" && x.col === c.col);
        const t = total ? computed[total.sheet]?.[total.addr] : undefined;
        out.push({
          field: `${c.sheet}!${c.addr}`,
          section: s.title,
          label: label + (typeof t === "number" && t ? ` (total ${formatValue(t, "$#,##0.00")})` : ""),
          value: String(v),
          num: typeof v === "number" ? v : isNaN(Number(v)) ? null : Number(v),
        });
      }
  for (const [k, cell] of Object.entries(def.layout.header)) {
    const v = cell ? values[cell.sheet]?.[cell.addr] : undefined;
    if (v !== undefined && v !== null && v !== "") out.push({ field: `header.${k}`, section: "Header", label: k, value: String(v), num: null });
  }
  return out;
}

export async function writeAnswers(db: Db, doc: { id: number; packetId: number; title: string }, jobNumber: string, form: string, rows: AnswerRow[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(paperworkAnswers).where(eq(paperworkAnswers.docId, doc.id));
    if (rows.length)
      await tx.insert(paperworkAnswers).values(
        rows.map((r) => ({ docId: doc.id, packetId: doc.packetId, jobNumber, form, room: doc.title, field: r.field, section: r.section, label: r.label.slice(0, 300), value: r.value.slice(0, 4000), num: r.num })),
      );
  });
}

// Keeps only answers that belong to the form, in the type the field expects.
export function cleanDetailValues(def: DetailFormDef, raw: unknown): Answers {
  const out: Answers = {};
  if (!raw || typeof raw !== "object") return out;
  const input = raw as Record<string, unknown>;
  for (const f of allFields(def)) {
    const v = input[f.key];
    if (v === undefined || v === null) continue;
    if (f.type === "check") {
      if (v === true) out[f.key] = true;
    } else if (f.type === "checks") {
      if (Array.isArray(v)) {
        const picked = v.filter((x): x is string => typeof x === "string" && (f.options ?? []).includes(x));
        if (picked.length) out[f.key] = picked;
      }
    } else if (f.type === "choice") {
      if (typeof v === "string" && f.options?.includes(v)) out[f.key] = v;
    } else if (f.type === "number") {
      const s = String(v).trim().slice(0, 20);
      if (s) out[f.key] = s;
    } else {
      const s = String(v).slice(0, f.type === "textarea" ? 5000 : 300);
      if (s.trim()) out[f.key] = s;
    }
  }
  return out;
}

