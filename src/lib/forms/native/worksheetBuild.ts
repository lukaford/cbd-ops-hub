// Builds a built-in work sheet from a company .xlsx: takes the prices out of the
// workbook model (they are kept in the database, never in the code) and lays the
// cells the designer fills in out as labelled rows for the in-app form.
// The workbook's own formulas still do every calculation.

import { numToCol, parseFormula, rangeAddrs, splitAddr } from "../formula";
import type { SheetCell, SheetModel, WorkbookModel } from "../sheetModel";

export const PARAM_SHEET = "__P";

// A price key is "<sheet>!<cell>", or "__P!A<n>" for a number written inside a formula.
export type Prices = Record<string, number | string>;

export interface LayoutCell {
  sheet: string;
  addr: string;
  kind: "num" | "text" | "date" | "check" | "price" | "out";
  col?: string; // the column heading it sits under, e.g. "FULL PANELS" or "Sale price"
}

export interface LayoutRow {
  label: string;
  sub?: string;
  cells: LayoutCell[];
}

export interface LayoutSection {
  sheet: string;
  title: string;
  rows: LayoutRow[];
}

export interface WorksheetLayout {
  sections: LayoutSection[];
  header: Partial<Record<"client" | "room" | "designer" | "date" | "job", { sheet: string; addr: string }>>;
}

type AnyNode = { t: string; sheet?: string; addr?: string; from?: string; to?: string; args?: AnyNode[]; x?: AnyNode; a?: AnyNode; b?: AnyNode };

function walk(n: AnyNode, fn: (n: AnyNode) => void) {
  fn(n);
  for (const c of [...(n.args ?? []), n.x, n.a, n.b]) if (c) walk(c, fn);
}

// Cells each formula points at, directly (A1) or through a range (A1:B9).
export function formulaRefs(model: WorkbookModel): { direct: Set<string>; ranged: Set<string> } {
  const direct = new Set<string>();
  const ranged = new Set<string>();
  for (const s of model.sheets)
    for (const c of Object.values(s.cells)) {
      if (!c.f) continue;
      let node: AnyNode;
      try {
        node = parseFormula(c.f) as AnyNode;
      } catch {
        continue;
      }
      walk(node, (n) => {
        if (n.t === "ref") direct.add(`${n.sheet ?? s.name}!${n.addr}`);
        if (n.t === "range") for (const a of rangeAddrs(n.from!, n.to!)) ranged.add(`${n.sheet ?? s.name}!${a}`);
      });
    }
  return { direct, ranged };
}

// Numbers typed into formulas ("=SUM(H29*93)") become references to a hidden
// sheet of parameters, so the formula text carries no price.
export function paramFormula(f: string, param: (n: number) => string): string {
  let out = "";
  let i = 0;
  while (i < f.length) {
    const ch = f[i];
    if (ch === "'" || ch === '"') {
      const end = f.indexOf(ch, i + 1);
      const stop = end < 0 ? f.length : end + 1;
      out += f.slice(i, stop);
      i = stop;
      continue;
    }
    const prev = out[out.length - 1] ?? "";
    if (/\d|\./.test(ch) && !/[A-Za-z$\d._]/.test(prev)) {
      const m = /^\d*\.?\d+/.exec(f.slice(i))!;
      const next = f[i + m[0].length] ?? "";
      if (!/[A-Za-z(:!]/.test(next)) {
        const n = Number(m[0]);
        out += n === 0 || n === 1 ? m[0] : param(n);
        i += m[0].length;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

const MONEY_TEXT = /\$\s?\d/;

export function isInputCell(sheet: SheetModel, addr: string, cell: SheetCell | undefined, refs: { direct: Set<string> }): boolean {
  if (cell?.input) return true;
  if (cell?.f || (cell?.v !== undefined && cell.v !== null && cell.v !== "")) return false;
  return refs.direct.has(`${sheet.name}!${addr}`);
}

export function stripPrices(model: WorkbookModel): { model: WorkbookModel; prices: Prices } {
  const prices: Prices = {};
  const refs = formulaRefs(model);
  const params = new Map<number, string>();
  const param = (n: number) => {
    let k = params.get(n);
    if (!k) {
      k = `${PARAM_SHEET}!A${params.size + 1}`;
      params.set(n, k);
      prices[k] = n;
    }
    return k;
  };
  const sheets = model.sheets.map((s) => {
    const cells: Record<string, SheetCell> = {};
    // Blank cells that formulas read are where the designer types, even on sheets
    // that were never protected; mark them so the form offers them.
    for (const key of refs.direct) {
      const [sheet, addr] = key.split("!");
      if (sheet !== s.name || s.cells[addr] || s.covered.includes(addr)) continue;
      const { col, row } = splitAddr(addr);
      if (row < s.area.r1 || row > s.area.r2 || col < s.area.c1 || col > s.area.c2) continue;
      cells[addr] = { input: true };
    }
    for (const [addr, c] of Object.entries(s.cells)) {
      const cell: SheetCell = { ...c };
      if (cell.f) cell.f = paramFormula(cell.f, param);
      // A fill-in that comes with a dollar amount already in it is a price too.
      else if (typeof cell.v === "number" && (!cell.input || /\$/.test(cell.fmt ?? ""))) {
        prices[`${s.name}!${addr}`] = cell.v;
        delete cell.v;
        cell.p = true;
      } else if (typeof cell.v === "string" && MONEY_TEXT.test(cell.v)) {
        prices[`${s.name}!${addr}`] = cell.v;
        delete cell.v;
        cell.p = true;
      } else if (!cell.input && isInputCell(s, addr, c, refs)) cell.input = true;
      cells[addr] = cell;
    }
    return { ...s, cells };
  });
  return { model: { ...model, sheets }, prices };
}

// Puts the prices back for use: the workbook the app calculates and prints.
export function withPrices(model: WorkbookModel, prices: Prices): WorkbookModel {
  const paramCells: Record<string, SheetCell> = {};
  for (const [k, v] of Object.entries(prices)) {
    const [sheet, addr] = k.split("!");
    if (sheet === PARAM_SHEET) paramCells[addr] = { v };
  }
  const sheets = model.sheets.map((s) => {
    const cells = { ...s.cells };
    for (const [k, v] of Object.entries(prices)) {
      const [sheet, addr] = k.split("!");
      if (sheet === s.name && cells[addr]) cells[addr] = { ...cells[addr], v };
    }
    return { ...s, cells };
  });
  // The parameter sheet is calculated but never drawn (zero-size area).
  const params: SheetModel = { name: PARAM_SHEET, area: { r1: 1, c1: 1, r2: 0, c2: 0 }, colWidths: [], rowHeights: [], cells: paramCells, covered: [] };
  return { ...model, sheets: [...sheets, params] };
}

// The price keys a workbook needs: every price cell and formula parameter.
export function priceKeys(model: WorkbookModel): string[] {
  const keys: string[] = [];
  for (const s of model.sheets)
    for (const [addr, c] of Object.entries(s.cells)) {
      if (c.f) for (const m of c.f.matchAll(new RegExp(`${PARAM_SHEET}!A\\d+`, "g"))) keys.push(m[0]);
      else if (c.p) keys.push(`${s.name}!${addr}`);
    }
  return [...new Set(keys)];
}

// ---- layout -----------------------------------------------------------------

const COLUMN_WORD = /^(amt|amount|price|total|qty)\s*:?$/i;
const ACRONYMS = new Set(["BRIO", "HPL", "ATS", "XL", "VTS", "P.O.T.", "CBD", "TAG", "WASL", "RND", "SQ.", "C/TOP", "II"]);
const SMALL = new Set(["or", "and", "to", "of", "for", "with", "per", "the", "on", "in", "up", "a", "w/", "x"]);

// Sheet headings are often spaced out or in capitals; make them read normally.
export function tidy(s: string): string {
  // "M O L D I N G  P E R" -> "MOLDING PER": letters one space apart, words two.
  let t = s.replace(/\b[A-Z&](?: [A-Z&]\b){2,}/g, (m) => m.replace(/ /g, ""));
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/^[*\s]+|[*\s]+$/g, "").replace(/\*{2,}/g, " ").replace(/\s*:\s*$/, "").replace(/\s+/g, " ").trim();
  if (/[a-z]{3}/.test(t.replace(/\b(lin|ft|sq|ea|w|d|h)\b\.?/gi, "")) || !/[A-Z]{3}/.test(t)) return t;
  return t
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      const up = w.toUpperCase();
      if (ACRONYMS.has(up) || /^[a-z]{1,2}\d+$/i.test(w)) return up;
      if (/^\d/.test(w)) return w;
      if (i > 0 && SMALL.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

interface Grid {
  sheet: SheetModel;
  at(col: number, row: number): { addr: string; cell: SheetCell } | undefined;
  textAt(col: number, row: number): string | undefined;
}

function grid(sheet: SheetModel, prices: Prices = {}): Grid {
  // Every cell a merge covers points back at the merge's top-left cell.
  const owner = new Map<string, string>();
  for (const [addr, c] of Object.entries(sheet.cells)) {
    const { col, row } = splitAddr(addr);
    for (let r = row; r < row + (c.rs ?? 1); r++) for (let k = col; k < col + (c.cs ?? 1); k++) owner.set(`${numToCol(k)}${r}`, addr);
  }
  const at = (col: number, row: number) => {
    const a = owner.get(`${numToCol(col)}${row}`);
    return a ? { addr: a, cell: sheet.cells[a] } : undefined;
  };
  const textAt = (col: number, row: number) => {
    const x = at(col, row);
    // Printed text with a price in it ("TEMPLATE CHARGE HPL $200") still labels its row, without the amount.
    const priced = x?.cell.p ? prices[`${sheet.name}!${x.addr}`] : undefined;
    const v = typeof priced === "string" ? priced.replace(/\$\s?[\d,]+(\.\d*)?/g, "$") : x?.cell.v;
    return typeof v === "string" && v.trim() && !x?.cell.input ? v.trim() : undefined;
  };
  return { sheet, at, textAt };
}

const isPriceSlot = (c: SheetCell) => Boolean(c.p);
const filled = (c: SheetCell) => Boolean(c.f || c.input || (c.p && c.v === undefined) || typeof c.v === "number");

// The printed words left of a cell: the nearest run of text, e.g. "Doors · OL1 · Up to 16" deep".
function rowLabel(g: Grid, col: number, row: number, stop: Set<string> = new Set()): { label: string; sub?: string; labelCol?: number } {
  const parts: { col: number; text: string }[] = [];
  for (let c = col - 1; c >= g.sheet.area.c1; c--) {
    const x = g.at(c, row);
    if (!x || splitAddr(x.addr).col !== c) continue; // empty, or inside a merge: keep walking left
    if (stop.has(x.addr)) return parts.length ? { label: tidy(parts[0].text), labelCol: parts[0].col } : { label: "", labelCol: c };
    const t = g.textAt(c, row);
    if (t && !COLUMN_WORD.test(t)) {
      parts.unshift({ col: c, text: t });
      continue;
    }
    // A short note beside a price ("x .5 Deco") is not the item's name: keep looking left.
    if (filled(x.cell) && parts.length && parts.map((p) => p.text).join("").length > 12) break;
  }
  if (!parts.length) return { label: "" };
  return { label: tidy(parts[0].text), sub: parts.length > 1 ? parts.slice(1).map((p) => tidy(p.text)).join(" · ") : undefined, labelCol: parts[0].col };
}

// The heading printed above a cell's column ("FULL PANELS" over "Amt:"), if any.
function columnLabel(g: Grid, col: number, row: number): string | undefined {
  let sawWord = false;
  for (let r = row - 1; r >= Math.max(g.sheet.area.r1, row - 40); r--) {
    const x = g.at(col, r);
    if (!x) continue;
    const t = g.textAt(col, r);
    if (t) {
      if (COLUMN_WORD.test(t)) {
        sawWord = true;
        continue;
      }
      if (t.length > 45) return undefined;
      return sawWord || /purchased|national|sale price/i.test(t) ? tidy(t) : undefined;
    }
    if (sawWord) return undefined;
  }
  return undefined;
}

function rowIsFree(g: Grid, r: number, fillable: Set<string>): boolean {
  for (let c = g.sheet.area.c1; c <= g.sheet.area.c2; c++) {
    const x = g.at(c, r);
    if (x && (fillable.has(x.addr) || x.cell.f)) return false;
  }
  return true;
}

// The heading a row sits under: the nearest line above in the label's column
// whose own row has nothing to fill in.
function sectionTitle(g: Grid, labelCol: number, row: number, fillable: Set<string>): string | undefined {
  for (let r = row - 1; r >= g.sheet.area.r1; r--) {
    const t = g.textAt(labelCol, r);
    if (!t || COLUMN_WORD.test(t) || !rowIsFree(g, r, fillable)) continue;
    const above = g.textAt(labelCol, r - 1);
    const join = above && !COLUMN_WORD.test(above) && above.length < 40 && tidy(above) !== tidy(t) && rowIsFree(g, r - 1, fillable);
    return tidy(join ? `${above} — ${t}` : t);
  }
  return undefined;
}

const HEADER_LABELS: Record<keyof WorksheetLayout["header"], RegExp> = {
  client: /^client name:?$/i,
  job: /^job ?#:?$/i,
  room: /^location:?$/i,
  designer: /^designer:?$/i,
  date: /^date:?$/i,
};

// Inputs multiplied by a calculated amount are "include this" switches (1 or blank):
// PURCHASED on the price presentation, the collection and colour upgrades.
function switchInputs(model: WorkbookModel): Set<string> {
  const out = new Set<string>();
  const kindOf = (sheet: string, addr: string) => model.sheets.find((s) => s.name === sheet)?.cells[addr];
  for (const s of model.sheets)
    for (const c of Object.values(s.cells)) {
      if (!c.f) continue;
      let node: AnyNode;
      try {
        node = parseFormula(c.f) as AnyNode;
      } catch {
        continue;
      }
      walk(node, (n) => {
        if (n.t !== "bin" || n.a?.t !== "ref" || n.b?.t !== "ref") return;
        const a = { sheet: n.a.sheet ?? s.name, addr: n.a.addr! };
        const b = { sheet: n.b.sheet ?? s.name, addr: n.b.addr! };
        const ca = kindOf(a.sheet, a.addr);
        const cb = kindOf(b.sheet, b.addr);
        if (ca?.input && cb?.f) out.add(`${a.sheet}!${a.addr}`);
        if (cb?.input && ca?.f) out.add(`${b.sheet}!${b.addr}`);
      });
    }
  return out;
}

export function buildLayout(model: WorkbookModel, prices: Prices = {}): WorksheetLayout {
  const refs = formulaRefs(model);
  const switches = switchInputs(model);
  const header: WorksheetLayout["header"] = {};
  const headerAddrs = new Set<string>();
  const first = model.sheets[0];
  if (first) {
    const g = grid(first);
    for (const [addr, c] of Object.entries(first.cells)) {
      if (typeof c.v !== "string") continue;
      const key = (Object.keys(HEADER_LABELS) as (keyof typeof HEADER_LABELS)[]).find((k) => HEADER_LABELS[k].test(String(c.v).trim()));
      if (!key || header[key]) continue;
      const { col, row } = splitAddr(addr);
      for (let k = col + (c.cs ?? 1); k <= first.area.c2; k++) {
        const x = g.at(k, row);
        if (x?.cell.input) {
          header[key] = { sheet: first.name, addr: x.addr };
          headerAddrs.add(`${first.name}!${x.addr}`);
          break;
        }
        if (x && g.textAt(k, row)) break;
      }
    }
  }

  const sections: LayoutSection[] = [];
  for (const sheet of model.sheets) {
    if (sheet.name === PARAM_SHEET) continue;
    const g = grid(sheet, prices);
    const key = (a: string) => `${sheet.name}!${a}`;
    // What the designer fills in: cells the formulas read, plus free-text lines
    // (a description beside a typed-in price, or a wide notes line).
    const fillable = new Set<string>();
    for (const [a, c] of Object.entries(sheet.cells)) if (c.input && refs.direct.has(key(a)) && !headerAddrs.has(key(a))) fillable.add(a);
    const describe = new Set<string>();
    for (const [a, c] of Object.entries(sheet.cells)) {
      if (!c.input || fillable.has(a) || headerAddrs.has(key(a))) continue;
      const { col, row } = splitAddr(a);
      const wide = (c.cs ?? 1) >= 6;
      const priced = (c.cs ?? 1) >= 3 && !rowLabel(g, col, row).label && [...fillable].some((f) => splitAddr(f).row === row && splitAddr(f).col > col);
      if (wide || priced) {
        fillable.add(a);
        describe.add(a);
      }
    }

    interface Segment {
      row: number;
      labelCol: number;
      label: string;
      sub?: string;
      cells: LayoutCell[];
    }
    const own = new Map<string, ReturnType<typeof rowLabel>>();
    const ownOf = (a: string) => {
      let o = own.get(a);
      if (!o) {
        const { col, row } = splitAddr(a);
        o = describe.has(a) ? { label: "", labelCol: col } : rowLabel(g, col, row, describe);
        own.set(a, o);
      }
      return o;
    };
    // A blank spacer row inside another block of the sheet: the cells above and
    // below it belong to a block whose label is not this row's.
    const spacer = (a: string) => {
      if (describe.has(a)) return false;
      const o = ownOf(a);
      const { col, row } = splitAddr(a);
      for (const d of [-1, 1, -2, 2]) {
        const n = `${numToCol(col)}${row + d}`;
        if (!fillable.has(n) && !sheet.cells[n]?.p) continue;
        const on = fillable.has(n) ? ownOf(n) : rowLabel(g, col, row + d, describe);
        if (on.label && on.labelCol !== o.labelCol) return !o.label || (o.labelCol ?? 0) < (on.labelCol ?? 0);
      }
      return false;
    };
    const segments: Segment[] = [];
    const rows = new Map<number, string[]>();
    for (const a of Object.keys(sheet.cells)) {
      const { row } = splitAddr(a);
      (rows.get(row) ?? rows.set(row, []).get(row)!).push(a);
    }
    for (const [row, addrs] of [...rows].sort((p, q) => p[0] - q[0])) {
      const ins = addrs.filter((a) => fillable.has(a) && !spacer(a)).sort((p, q) => splitAddr(p).col - splitAddr(q).col);
      if (!ins.length) continue;
      const segs: Segment[] = [];
      for (const a of ins) {
        const o = ownOf(a);
        const lc = o.labelCol ?? splitAddr(a).col;
        let cur = segs.find((x) => x.labelCol === lc);
        if (!cur || describe.has(a)) {
          cur = { row, labelCol: lc, label: o.label, sub: o.sub, cells: [] };
          segs.push(cur);
        }
        const colName = columnLabel(g, splitAddr(a).col, row);
        let kind: LayoutCell["kind"] = "num";
        if (describe.has(a)) kind = "text";
        else if (switches.has(key(a)) && !/discount|%/i.test(`${o.label} ${colName ?? ""}`)) kind = "check";
        cur.cells.push({ sheet: sheet.name, addr: a, kind, col: colName });
      }
      // Rows with nothing to name them are spacers (the sheet's blank lines).
      const named = segs.filter((x) => x.label || x.cells.some((c) => c.kind === "text"));
      // Prices and results sit with the nearest block to their left.
      for (const a of addrs) {
        const c = sheet.cells[a];
        if (fillable.has(a) || !(c.f || isPriceSlot(c))) continue;
        const { col } = splitAddr(a);
        const seg = named.filter((x) => x.labelCol < col).sort((p, q) => q.labelCol - p.labelCol)[0];
        if (seg) seg.cells.push({ sheet: sheet.name, addr: a, kind: c.f ? "out" : "price", col: columnLabel(g, col, row) });
      }
      for (const x of named) x.cells.sort((p, q) => splitAddr(p.addr).col - splitAddr(q.addr).col);
      segments.push(...named);
    }

    // Read each block of the sheet top to bottom, left blocks first.
    const blocks = [...new Set(segments.map((s) => s.labelCol))].sort((a, b) => a - b);
    for (const b of blocks)
      for (const s of segments.filter((x) => x.labelCol === b)) {
        if (!s.cells.some((c) => c.kind !== "out" && c.kind !== "price")) continue;
        const title = sectionTitle(g, s.labelCol, s.row, fillable) ?? tidy(sheet.name);
        const label = s.label;
        const last = sections[sections.length - 1];
        const data: LayoutRow = { label, sub: s.sub, cells: s.cells };
        if (last && last.sheet === sheet.name && last.title === title) last.rows.push(data);
        else sections.push({ sheet: sheet.name, title, rows: [data] });
      }
  }
  nameUnlabeledColumns(sections);
  return { sections, header };
}

// A result column with no heading of its own (often under a banner such as a
// promotion) takes the heading the same column has elsewhere on the sheet.
function nameUnlabeledColumns(sections: LayoutSection[]): void {
  const names = new Map<string, Map<string, number>>();
  const cells = sections.flatMap((s) => s.rows.flatMap((r) => r.cells));
  const key = (c: LayoutCell) => `${c.sheet}!${splitAddr(c.addr).col}`;
  for (const c of cells)
    if (c.kind === "out" && c.col) {
      const m = names.get(key(c)) ?? new Map<string, number>();
      m.set(c.col, (m.get(c.col) ?? 0) + 1);
      names.set(key(c), m);
    }
  for (const c of cells)
    if (c.kind === "out" && !c.col) {
      const best = [...(names.get(key(c)) ?? [])].sort((a, b) => b[1] - a[1])[0];
      if (best) c.col = best[0];
    }
}
