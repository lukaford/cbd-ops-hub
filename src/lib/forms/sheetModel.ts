// Turns an uploaded work sheet (.xlsx) into a plain JSON model the app can draw
// and calculate: cell text, formulas, which cells the designer may type in,
// merged cells, sizes and a compact set of styles. Pricing lives in the uploaded
// file only; nothing from it is part of the code.

import { cleanAddr, colToNum, numToCol, splitAddr, type Value } from "./formula";

export interface CellStyle {
  b?: boolean; // bold
  i?: boolean; // italic
  sz?: number; // font size in points
  c?: string; // text colour #rrggbb
  bg?: string; // fill colour #rrggbb
  h?: "left" | "center" | "right";
  v?: "top" | "middle" | "bottom";
  wrap?: boolean;
  // Border widths: 1 thin, 2 medium, 3 thick.
  bt?: number;
  br?: number;
  bb?: number;
  bl?: number;
}

export interface SheetCell {
  v?: Value;
  f?: string; // formula without "="
  input?: boolean;
  p?: boolean; // a price, kept in the database rather than in a built-in form
  fmt?: string; // Excel number format
  st?: number; // index into styles
  rs?: number; // merged rows
  cs?: number; // merged columns
}

export interface SheetModel {
  name: string;
  // First and last row and column (1-based) of the printed area.
  area: { r1: number; c1: number; r2: number; c2: number };
  colWidths: number[]; // pixels, one per column in the area
  rowHeights: number[]; // pixels, one per row in the area
  cells: Record<string, SheetCell>;
  covered: string[]; // cells hidden under a merge
}

export interface WorkbookModel {
  sheets: SheetModel[];
  styles: CellStyle[];
  revision?: string;
}

// Office theme colours (the 2023+ default theme these sheets use).
const THEME = ["#FFFFFF", "#000000", "#E8E8E8", "#0E2841", "#156082", "#E97132", "#196B24", "#0F9ED5", "#A02B93", "#4EA72E"];

function tint(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(t < 0 ? x * (1 + t) : x + (255 - x) * t));
  return "#" + ch.map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

// Excel's 56-colour legacy palette, only the entries these sheets are likely to use.
const INDEXED: Record<number, string> = { 8: "#000000", 9: "#FFFFFF", 10: "#FF0000", 12: "#0000FF", 13: "#FFFF00", 64: "#000000" };

interface ExcelColor {
  argb?: string;
  theme?: number;
  tint?: number;
  indexed?: number;
}

export function excelColor(c: ExcelColor | undefined): string | undefined {
  if (!c) return undefined;
  if (c.argb && c.argb.length === 8) return "#" + c.argb.slice(2).toUpperCase();
  if (c.theme !== undefined) {
    const base = THEME[c.theme] ?? "#000000";
    return c.tint ? tint(base, c.tint) : base;
  }
  if (c.indexed !== undefined) return INDEXED[c.indexed];
  return undefined;
}

const BORDER_WIDTH: Record<string, number> = { hair: 1, thin: 1, dotted: 1, dashed: 1, medium: 2, mediumDashed: 2, thick: 3, double: 3 };

// Excel stores dates as days since 1899-12-30.
export function toSerial(d: Date): number {
  return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000);
}

export function fromSerial(n: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function cellValue(raw: any): { v?: Value; f?: string } {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === "number" || typeof raw === "string") return { v: raw };
  if (typeof raw === "boolean") return { v: raw ? "TRUE" : "FALSE" };
  if (raw instanceof Date) return { v: toSerial(raw) };
  if (Array.isArray(raw.richText)) return { v: raw.richText.map((r: any) => r.text).join("") };
  if (typeof raw.text === "string") return { v: raw.text };
  if (raw.error) return {};
  return {};
}

export async function parseWorkbook(data: ArrayBuffer | Uint8Array): Promise<WorkbookModel> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  const styles: CellStyle[] = [];
  const styleIndex = new Map<string, number>();
  const sheets: SheetModel[] = [];
  let revision: string | undefined;

  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== "visible") continue;
    const protectedSheet = Boolean((ws as any).sheetProtection?.sheet);
    const dims = ws.dimensions as any;
    let area = { r1: dims?.top ?? 1, c1: dims?.left ?? 1, r2: dims?.bottom ?? 1, c2: dims?.right ?? 1 };
    const printArea = ws.pageSetup?.printArea?.split(",")[0]?.replace(/\$/g, "");
    const m = printArea && /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(printArea);
    if (m) {
      // Clip the print area to cells that exist, so an over-wide area adds no blank columns.
      area = {
        r1: Number(m[2]),
        c1: colToNum(m[1]),
        r2: Math.min(Number(m[4]), Math.max(area.r2, Number(m[2]))),
        c2: Math.min(colToNum(m[3]), Math.max(area.c2, colToNum(m[1]))),
      };
    }

    const defaultWidth = ws.properties.defaultColWidth ?? 8.43;
    const defaultHeight = ws.properties.defaultRowHeight ?? 15;
    const colWidths: number[] = [];
    for (let c = area.c1; c <= area.c2; c++) {
      const col = ws.getColumn(c);
      colWidths.push(col.hidden ? 0 : Math.round((col.width ?? defaultWidth) * 7 + 5));
    }
    const rowHeights: number[] = [];
    for (let r = area.r1; r <= area.r2; r++) {
      const row = ws.getRow(r);
      rowHeights.push(row.hidden ? 0 : Math.round(((row.height ?? defaultHeight) * 4) / 3));
    }

    const cells: Record<string, SheetCell> = {};
    const covered: string[] = [];
    const merges: string[] = ((ws as any).model?.merges ?? []) as string[];
    const mergeOf = new Map<string, { rs: number; cs: number }>();
    for (const range of merges) {
      const [a, b] = range.split(":");
      if (!b) continue;
      const s = splitAddr(a);
      const e = splitAddr(b);
      mergeOf.set(cleanAddr(a), { rs: e.row - s.row + 1, cs: e.col - s.col + 1 });
      for (let r = s.row; r <= e.row; r++)
        for (let c = s.col; c <= e.col; c++) if (r !== s.row || c !== s.col) covered.push(`${numToCol(c)}${r}`);
    }
    const coveredSet = new Set(covered);

    ws.eachRow({ includeEmpty: true }, (row, r) => {
      if (r < area.r1 || r > area.r2) return;
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        if (c < area.c1 || c > area.c2) return;
        const addr = `${numToCol(c)}${r}`;
        if (coveredSet.has(addr)) return;
        const out: SheetCell = {};
        const formula = (cell as any).formula as string | undefined;
        if (formula) out.f = formula;
        else Object.assign(out, cellValue(cell.value));
        if (protectedSheet && cell.protection?.locked === false && !formula) out.input = true;
        if (cell.numFmt && cell.numFmt !== "General") out.fmt = cell.numFmt;
        const merge = mergeOf.get(addr);
        if (merge) {
          out.rs = merge.rs;
          out.cs = merge.cs;
        }

        const st: CellStyle = {};
        const font = cell.font as any;
        if (font?.bold) st.b = true;
        if (font?.italic) st.i = true;
        if (font?.size && font.size !== 11) st.sz = font.size;
        const fc = excelColor(font?.color);
        if (fc && fc !== "#000000") st.c = fc;
        const fill = cell.fill as any;
        if (fill?.type === "pattern" && fill.pattern === "solid") {
          const bg = excelColor(fill.fgColor);
          if (bg && bg !== "#FFFFFF") st.bg = bg;
        }
        const al = cell.alignment as any;
        if (al?.horizontal === "left" || al?.horizontal === "center" || al?.horizontal === "right") st.h = al.horizontal;
        if (al?.horizontal === "centerContinuous") st.h = "center";
        if (al?.vertical === "top" || al?.vertical === "middle") st.v = al.vertical;
        if (al?.wrapText) st.wrap = true;
        const bd = cell.border as any;
        for (const [k, side] of [["bt", "top"], ["br", "right"], ["bb", "bottom"], ["bl", "left"]] as const) {
          const w = BORDER_WIDTH[bd?.[side]?.style ?? ""];
          if (w) st[k] = w;
        }
        // A merged cell takes its right and bottom border from the far edge of the merge.
        if (merge) {
          const far = ws.getCell(r + merge.rs - 1, c + merge.cs - 1).border as any;
          const right = BORDER_WIDTH[far?.right?.style ?? ""];
          const bottom = BORDER_WIDTH[ws.getCell(r + merge.rs - 1, c).border?.bottom?.style ?? ""];
          if (right) st.br = right;
          if (bottom) st.bb = bottom;
        }
        const key = JSON.stringify(st);
        if (key !== "{}") {
          let i = styleIndex.get(key);
          if (i === undefined) {
            i = styles.length;
            styles.push(st);
            styleIndex.set(key, i);
          }
          out.st = i;
        }
        if (Object.keys(out).length) cells[addr] = out;
        if (!revision && typeof out.v === "string" && /^rev\.?\s*\d/i.test(out.v.trim())) revision = out.v.trim();
      });
    });

    sheets.push({ name: ws.name, area, colWidths, rowHeights, cells, covered });
  }
  return { sheets, styles, revision };
}
