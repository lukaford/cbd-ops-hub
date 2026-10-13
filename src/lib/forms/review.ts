// Reads a packet's filled sheets back out: the job summary (rooms, colours,
// collections, prices, special-order items) and the checks that flag missing
// or conflicting information before the paperwork goes to the office.

import { evaluateWorkbook, splitAddr, numToCol, type Value, type CellSource } from "./formula";
import type { WorkbookModel, SheetModel } from "./sheetModel";
import { headerKey, type LabeledField } from "./fieldLabels";
import type { FieldValues, PdfFormModel } from "./pdfForm";
import { formatValue } from "./numFmt";
import { lastName } from "./naming";

export type SheetValues = Record<string, Record<string, Value>>;

export type DetailModel = Omit<PdfFormModel, "fields"> & { fields: LabeledField[] };

export interface DetailDoc {
  id: number;
  kind: "detail";
  title: string;
  room: string;
  model: DetailModel;
  values: FieldValues;
}

export interface WorksheetDoc {
  id: number;
  kind: "worksheet";
  title: string;
  room: string;
  model: WorkbookModel;
  values: SheetValues;
}

export type PacketDoc = DetailDoc | WorksheetDoc;

export interface Check {
  level: "missing" | "check";
  docId?: number;
  room?: string;
  message: string;
}

export interface RoomSummary {
  docId: number;
  title: string;
  room: string;
  kind: "detail" | "worksheet";
  header: Record<string, string>;
  salePrice?: number;
  nationalPrice?: number;
  purchased: { item: string; amount: number }[];
  selections: { label: string; value: string }[];
}

export interface SpecialOrderItem {
  docId: number;
  room: string;
  type: string;
  item: string;
}

// --- work sheets ---------------------------------------------------------

export function sheetSources(model: WorkbookModel): Record<string, Record<string, CellSource>> {
  const out: Record<string, Record<string, CellSource>> = {};
  for (const s of model.sheets) {
    const cells: Record<string, CellSource> = (out[s.name] = {});
    for (const [a, c] of Object.entries(s.cells)) cells[a] = { formula: c.f, value: c.v };
  }
  return out;
}

export function evaluateSheets(model: WorkbookModel, values: SheetValues): SheetValues {
  return evaluateWorkbook(sheetSources(model), values);
}

function rowCells(sheet: SheetModel, row: number): string[] {
  const out: string[] = [];
  for (let c = sheet.area.c1; c <= sheet.area.c2; c++) {
    const a = `${numToCol(c)}${row}`;
    if (sheet.cells[a]) out.push(a);
  }
  return out;
}

function text(v: Value | undefined): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

// The first cell to the right of a printed label on the same row that the designer
// types in (inputs) or that the sheet calculates (formulas).
export function cellRightOf(sheet: SheetModel, label: RegExp, want: "input" | "formula"): string | undefined {
  for (const [addr, cell] of Object.entries(sheet.cells)) {
    if (typeof cell.v !== "string" || !label.test(cell.v.trim())) continue;
    const { col, row } = splitAddr(addr);
    for (const a of rowCells(sheet, row)) {
      if (splitAddr(a).col <= col) continue;
      const c = sheet.cells[a];
      if (want === "input" ? c.input : Boolean(c.f)) return a;
    }
  }
  return undefined;
}

const SHEET_HEADER: Record<string, RegExp> = {
  client: /^client name:?$/i,
  job: /^job ?#:?$/i,
  room: /^location:?$/i,
  designer: /^designer:?$/i,
  date: /^date:?$/i,
};

export function worksheetHeaderCells(model: WorkbookModel): Record<string, { sheet: string; addr: string }> {
  const first = model.sheets[0];
  const out: Record<string, { sheet: string; addr: string }> = {};
  if (!first) return out;
  for (const [k, re] of Object.entries(SHEET_HEADER)) {
    const a = cellRightOf(first, re, "input");
    if (a) out[k] = { sheet: first.name, addr: a };
  }
  return out;
}

function presentation(model: WorkbookModel): SheetModel | undefined {
  return model.sheets.find((s) => /presentation/i.test(s.name)) ?? model.sheets[model.sheets.length - 1];
}

function summarizeWorksheet(doc: WorksheetDoc): RoomSummary {
  const computed = evaluateSheets(doc.model, doc.values);
  const header: Record<string, string> = {};
  for (const [k, { sheet, addr }] of Object.entries(worksheetHeaderCells(doc.model))) {
    const cell = doc.model.sheets.find((s) => s.name === sheet)?.cells[addr];
    header[k] = formatValue(computed[sheet]?.[addr] ?? null, cell?.fmt);
  }
  const pres = presentation(doc.model);
  const summary: RoomSummary = { docId: doc.id, title: doc.title, room: doc.room, kind: "worksheet", header, purchased: [], selections: [] };
  if (!pres) return summary;
  const vals = computed[pres.name] ?? {};
  const sale = cellRightOf(pres, /^sale price:?$/i, "formula");
  if (sale) summary.salePrice = Number(vals[sale]) || 0;
  const total = cellRightOf(pres, /^t\s*o\s*t\s*a\s*l\b/i, "formula");
  if (total) summary.nationalPrice = Number(vals[total]) || 0;

  // Rows below the "PURCHASED:" heading with an amount are what the customer bought.
  for (const [addr, cell] of Object.entries(pres.cells)) {
    if (typeof cell.v !== "string" || !/^purchased:?$/i.test(cell.v.trim())) continue;
    const { col, row } = splitAddr(addr);
    for (let r = row + 1; r <= pres.area.r2; r++) {
      const a = `${numToCol(col)}${r}`;
      const amount = Number(vals[a]) || 0;
      if (!amount || !pres.cells[a]?.f || (sale && splitAddr(sale).row <= r) || (total && splitAddr(total).row <= r)) continue;
      const label = rowCells(pres, r)
        .map((x) => pres.cells[x])
        .find((c) => typeof c.v === "string" && /[A-Za-z]{3}/.test(c.v));
      summary.purchased.push({ item: text(label?.v).replace(/\s{2,}/g, " "), amount });
    }
    break;
  }
  return summary;
}

// --- detail sheets -------------------------------------------------------

const EMPTY_CHOICE = /^(none|.*select below|.*- none|fence -none|rail - none|rotating - none|wall - none|dbl - none|sngl - none|rnd - none)$/i;

function fieldValue(f: LabeledField, values: FieldValues): string | boolean | undefined {
  const v = values[f.name];
  return v === undefined ? f.value : v;
}

function isFilled(f: LabeledField, v: string | boolean | undefined): boolean {
  if (f.kind === "check") return v === true;
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || /^_+$/.test(s)) return false;
  if (f.kind === "choice" && EMPTY_CHOICE.test(s)) return false;
  // Template text that was never changed (labels typed into fields).
  if (f.kind === "text" && f.value && s === f.value) return false;
  return true;
}

export function detailHeaderFields(fields: LabeledField[]): Record<string, LabeledField> {
  const out: Record<string, LabeledField> = {};
  // Top of the page first, so the header's COLOR wins over a door COLOR further down.
  const sorted = [...fields].sort((a, b) => b.boxes[0].y - a.boxes[0].y);
  for (const f of sorted) {
    const k = headerKey(f);
    if (k && !out[k]) out[k] = f;
  }
  return out;
}

function summarizeDetail(doc: DetailDoc): RoomSummary {
  const header: Record<string, string> = {};
  const head = detailHeaderFields(doc.model.fields);
  const headNames = new Set(Object.values(head).map((f) => f.name));
  for (const [k, f] of Object.entries(head)) {
    const v = fieldValue(f, doc.values);
    header[k] = isFilled(f, v) ? String(v) : "";
  }
  const selections = doc.model.fields
    .filter((f) => !headNames.has(f.name))
    .map((f) => ({ f, v: fieldValue(f, doc.values) }))
    .filter(({ f, v }) => isFilled(f, v))
    .sort((a, b) => b.f.boxes[0].y - a.f.boxes[0].y || a.f.boxes[0].x - b.f.boxes[0].x)
    .map(({ f, v }) => ({
      label: [f.group, f.label].filter(Boolean).join(" / ") || "(unlabeled)",
      value: v === true ? "Yes" : String(v),
    }));
  return { docId: doc.id, title: doc.title, room: doc.room, kind: "detail", header, purchased: [], selections };
}

// --- special orders ------------------------------------------------------

// The material types used in JobTread, matched from what a detail sheet selects.
export function specialOrderType(label: string, value: string): string | undefined {
  const s = `${label} ${value}`;
  if (/traxtile|garage floor/i.test(s)) return "Traxtile Garage Flooring";
  if (/glass shel/i.test(s)) return "Glass shelves";
  if (/\blight(ing|s)?\b/i.test(value)) return "Lighting";
  if (/quartz|hpl|wilsonart|butcher ?block/i.test(value)) return "Countertops";
  if (/glass|mesh|leather|mirror|shagreen|buffalo|metro|creel|tweed/i.test(value) && /insert|deco|style|type/i.test(label)) return "Deco (glass, mesh, other)";
  if (/bellaire|captiva|shaker|bimini|sunrise|abaco|bahama/i.test(value)) return "Deco (no glass)";
  if (/\b\d{3}\.\d{2}\.\d{3}\b/.test(value)) return "Special Order Accessories";
  return undefined;
}

export function specialOrders(rooms: RoomSummary[]): SpecialOrderItem[] {
  const out: SpecialOrderItem[] = [];
  for (const r of rooms) {
    if (r.kind !== "detail") continue;
    const types = new Map<string, string[]>();
    for (const s of r.selections) {
      const t = specialOrderType(s.label, s.value);
      if (t) (types.get(t) ?? types.set(t, []).get(t)!).push(s.value);
    }
    // Glass, mesh or leather inserts make the whole room's deco the glass kind.
    if (types.has("Deco (glass, mesh, other)") && types.has("Deco (no glass)")) {
      types.get("Deco (glass, mesh, other)")!.unshift(...types.get("Deco (no glass)")!);
      types.delete("Deco (no glass)");
    }
    for (const [type, items] of types) for (const item of items) out.push({ docId: r.docId, room: r.title, type, item });
  }
  return out;
}

// --- checks --------------------------------------------------------------

const HEADER_NAMES: Record<string, string> = {
  client: "Client name",
  room: "Room/location",
  designer: "Designer",
  date: "Date",
  job: "Job #",
  color: "Color",
  collection: "Collection",
};

export interface PacketFacts {
  jobNumber: string;
  customer: string;
  gridCount: number;
  signatures: { role: string; current: boolean }[];
}

export function reviewPacket(docs: PacketDoc[], facts: PacketFacts): { rooms: RoomSummary[]; specials: SpecialOrderItem[]; checks: Check[] } {
  const rooms = docs.map((d) => (d.kind === "worksheet" ? summarizeWorksheet(d) : summarizeDetail(d)));
  const checks: Check[] = [];
  const add = (level: Check["level"], r: RoomSummary | undefined, message: string) =>
    checks.push({ level, docId: r?.docId, room: r ? `${r.title} (${r.kind === "worksheet" ? "work sheet" : "detail sheet"})` : undefined, message });

  if (docs.length === 0) add("missing", undefined, "No sheets added yet.");
  const who = lastName(facts.customer).toLowerCase();

  for (const r of rooms) {
    const required = r.kind === "detail" ? ["client", "room", "designer", "date", "job", "color", "collection"] : ["client", "job", "designer"];
    for (const k of required) if (k in r.header && !r.header[k]) add("missing", r, `${HEADER_NAMES[k]} is blank.`);
    const job = r.header.job?.replace(/\D/g, "");
    if (job && facts.jobNumber && job !== facts.jobNumber.replace(/\D/g, "")) add("check", r, `Job # ${r.header.job} does not match job ${facts.jobNumber}.`);
    if (r.header.client && who && !r.header.client.toLowerCase().includes(who)) add("check", r, `Client name "${r.header.client}" does not match ${facts.customer}.`);
    if (r.kind === "worksheet" && !r.salePrice) add("missing", r, "No sale price yet (nothing marked purchased).");
  }

  for (const d of docs) {
    if (d.kind !== "detail") continue;
    const r = rooms.find((x) => x.docId === d.id);
    // Yes/No questions: two checkboxes under the same heading.
    const groups = new Map<string, LabeledField[]>();
    for (const f of d.model.fields) if (f.kind === "check" && f.group && f.group.length > 12) (groups.get(f.group) ?? groups.set(f.group, []).get(f.group)!).push(f);
    for (const [g, fs] of groups) {
      if (fs.length !== 2) continue;
      const on = fs.filter((f) => fieldValue(f, d.values) === true);
      if (on.length === 0) add("missing", r, `"${g}" is not answered.`);
      if (on.length === 2) add("check", r, `"${g}" has both boxes checked.`);
      if (/measurements final/i.test(g) && on.length === 1) {
        const left = [...fs].sort((a, b) => a.boxes[0].x - b.boxes[0].x);
        if (on[0] === left[1]) add("check", r, "Measurements are not final; resubmit as Final Measurements once measured.");
      }
    }
  }

  // Each room should have its work sheet and its detail sheet, with the same collection.
  const byRoom = new Map<string, RoomSummary[]>();
  for (const r of rooms) (byRoom.get(r.room) ?? byRoom.set(r.room, []).get(r.room)!).push(r);
  for (const [room, rs] of byRoom) {
    const detail = rs.filter((r) => r.kind === "detail");
    const work = rs.filter((r) => r.kind === "worksheet");
    if (detail.length && !work.length) add("missing", detail[0], `${room}: no work sheet (pricing) for this room.`);
    if (work.length && !detail.length) add("missing", work[0], `${room}: no detail sheet for this room.`);
    if (detail.length === 1 && work.length === 1) {
      const col = detail[0].header.collection?.toUpperCase();
      const bought = work[0].purchased.map((p) => p.item.toUpperCase());
      const collections = ["EVERYDAY", "CLASSIC", "BRIO"];
      const boughtCollection = collections.find((c) => bought.some((b) => b === c || b.startsWith(c + " ")));
      if (col && boughtCollection && !col.startsWith(boughtCollection)) add("check", detail[0], `Collection is ${detail[0].header.collection} on the detail sheet but ${boughtCollection} is priced on the work sheet.`);
    }
  }

  if (facts.gridCount === 0) add("missing", undefined, "No grids attached.");
  const customer = facts.signatures.filter((s) => s.role === "customer");
  if (!customer.length) add("missing", undefined, "Customer has not signed.");
  else if (!customer.some((s) => s.current)) add("check", undefined, "The paperwork changed after the customer signed; have them sign again.");
  if (facts.signatures.some((s) => s.role === "designer" && !s.current)) add("check", undefined, "The paperwork changed after the designer signed.");
  if (!facts.signatures.some((s) => s.role === "designer")) add("missing", undefined, "Designer has not signed.");

  return { rooms, specials: specialOrders(rooms), checks };
}
