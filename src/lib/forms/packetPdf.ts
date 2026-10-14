// Builds the single PDF for a packet: every room's work sheet and detail sheet in
// order, the notes, attached grids, and a signature record, with the packet name
// and version stamped on every page.

import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from "pdf-lib";
import { fillPdfForm, pdfSafe, type FieldValues } from "./pdfForm";
import type { SheetModel, WorkbookModel, CellStyle } from "./sheetModel";
import { numToCol, splitAddr } from "./formula";
import { formatValue } from "./numFmt";
import type { SheetValues } from "./review";
import { evaluateSheets } from "./review";
import { answerText, isBlank, type Answers, type DetailFormDef } from "./native/types";

const LETTER: [number, number] = [612, 792];

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

async function fonts(pdf: PDFDocument): Promise<Fonts> {
  return {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
}

function hex(c: string) {
  const n = parseInt(c.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function fitText(font: PDFFont, size: number, s: string, width: number): string {
  if (font.widthOfTextAtSize(s, size) <= width) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(s.slice(0, mid), size) <= width) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo);
}

function wrapLines(font: PDFFont, size: number, s: string, width: number): string[] {
  const out: string[] = [];
  for (const para of s.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

// Draws one sheet of a work sheet onto a page, scaled to fit, the way it prints.
function drawSheet(page: PDFPage, f: Fonts, sheet: SheetModel, styles: CellStyle[], values: Record<string, unknown>, top: number) {
  const { width: pw, height: ph } = page.getSize();
  const margin = 18;
  const W = sheet.colWidths.reduce((a, b) => a + b, 0) || 1;
  const H = sheet.rowHeights.reduce((a, b) => a + b, 0) || 1;
  const scale = Math.min((pw - margin * 2) / W, (ph - margin - top) / H);
  const x0 = margin;
  const y0 = ph - top;
  const colX: number[] = [0];
  for (const w of sheet.colWidths) colX.push(colX[colX.length - 1] + w);
  const rowY: number[] = [0];
  for (const h of sheet.rowHeights) rowY.push(rowY[rowY.length - 1] + h);
  const covered = new Set(sheet.covered);
  const { r1, c1, r2, c2 } = sheet.area;

  const box = (addr: string, rs = 1, cs = 1) => {
    const { col, row } = splitAddr(addr);
    const ci = col - c1;
    const ri = row - r1;
    const x = x0 + colX[ci] * scale;
    const w = (colX[Math.min(ci + cs, colX.length - 1)] - colX[ci]) * scale;
    const yTop = y0 - rowY[ri] * scale;
    const h = (rowY[Math.min(ri + rs, rowY.length - 1)] - rowY[ri]) * scale;
    return { x, y: yTop - h, w, h };
  };

  const entries = Object.entries(sheet.cells);
  // Fills first, then text, then borders on top.
  for (const [addr, cell] of entries) {
    const st = cell.st !== undefined ? styles[cell.st] : undefined;
    if (!st?.bg) continue;
    const b = box(addr, cell.rs, cell.cs);
    page.drawRectangle({ x: b.x, y: b.y, width: b.w, height: b.h, color: hex(st.bg) });
  }
  for (const [addr, cell] of entries) {
    const v = values[addr];
    const s = pdfSafe(formatValue((v as never) ?? cell.v ?? null, cell.fmt));
    if (!s.trim()) continue;
    const st = cell.st !== undefined ? styles[cell.st] : {};
    const font = st.b && st.i ? f.boldItalic : st.b ? f.bold : st.i ? f.italic : f.regular;
    const size = Math.max(3, ((st.sz ?? 11) * 4) / 3 * scale * 0.92);
    const b = box(addr, cell.rs, cell.cs);
    let width = b.w;
    const align0 = st.h ?? (typeof (v ?? cell.v) === "number" ? "right" : "left");
    // Like Excel, text runs on into empty neighbouring cells: rightwards when left
    // aligned, leftwards when right aligned.
    if (!st.wrap && typeof (v ?? cell.v) === "string") {
      const { col, row } = splitAddr(addr);
      const empty = (a: string) => !(sheet.cells[a]?.v !== undefined || sheet.cells[a]?.f || covered.has(a) || values[a]);
      if (align0 === "left")
        for (let c = col + (cell.cs ?? 1); c <= c2 && empty(`${numToCol(c)}${row}`); c++) width += sheet.colWidths[c - c1] * scale;
      if (align0 === "right")
        for (let c = col - 1; c >= c1 && empty(`${numToCol(c)}${row}`); c--) width += sheet.colWidths[c - c1] * scale;
    }
    const lines = st.wrap ? wrapLines(font, size, s, b.w - 2) : [fitText(font, size, s, width - 2)];
    const lineH = size * 1.15;
    const blockH = lines.length * lineH;
    let ty = st.v === "top" ? b.y + b.h - size : st.v === "middle" ? b.y + (b.h + blockH) / 2 - size : b.y + blockH - size + 1;
    const align = align0;
    for (const line of lines) {
      const lw = font.widthOfTextAtSize(line, size);
      const tx = align === "center" ? b.x + (b.w - lw) / 2 : align === "right" ? b.x + b.w - lw - 1.5 : b.x + 1.5;
      page.drawText(line, { x: tx, y: ty, size, font, color: st.c ? hex(st.c) : rgb(0, 0, 0) });
      ty -= lineH;
    }
  }
  for (const [addr, cell] of entries) {
    const st = cell.st !== undefined ? styles[cell.st] : undefined;
    if (!st || !(st.bt || st.br || st.bb || st.bl)) continue;
    const b = box(addr, cell.rs, cell.cs);
    const t = (w: number) => Math.max(0.3, w * 0.6 * Math.min(1, scale * 1.4));
    if (st.bt) page.drawLine({ start: { x: b.x, y: b.y + b.h }, end: { x: b.x + b.w, y: b.y + b.h }, thickness: t(st.bt) });
    if (st.bb) page.drawLine({ start: { x: b.x, y: b.y }, end: { x: b.x + b.w, y: b.y }, thickness: t(st.bb) });
    if (st.bl) page.drawLine({ start: { x: b.x, y: b.y }, end: { x: b.x, y: b.y + b.h }, thickness: t(st.bl) });
    if (st.br) page.drawLine({ start: { x: b.x + b.w, y: b.y }, end: { x: b.x + b.w, y: b.y + b.h }, thickness: t(st.br) });
  }
  void r2;
}

export async function appendWorksheet(out: PDFDocument, f: Fonts, model: WorkbookModel, values: SheetValues) {
  const computed = evaluateSheets(model, values);
  for (const sheet of model.sheets) {
    if (sheet.area.r2 < sheet.area.r1) continue; // hidden helper sheet (built-in work sheet parameters)
    const W = sheet.colWidths.reduce((a, b) => a + b, 0);
    const H = sheet.rowHeights.reduce((a, b) => a + b, 0);
    const page = out.addPage(W > H ? [LETTER[1], LETTER[0]] : LETTER);
    drawSheet(page, f, sheet, model.styles, computed[sheet.name] ?? {}, 30);
  }
}

// A built-in detail sheet, printed as a tidy form: each section with its answers.
export function appendNativeDetail(out: PDFDocument, f: Fonts, def: DetailFormDef, values: Answers, title: string) {
  const [pw, ph] = LETTER;
  const left = 36;
  const width = pw - left * 2;
  let page = out.addPage(LETTER);
  let y = ph - 40;
  const newPage = () => {
    page = out.addPage(LETTER);
    y = ph - 40;
    page.drawText(pdfSafe(`${def.name} (continued): ${title}`), { x: left, y, size: 10, font: f.bold });
    y -= 20;
  };
  const need = (h: number) => {
    if (y - h < 36) newPage();
  };
  page.drawText(pdfSafe(def.name.toUpperCase()), { x: left, y, size: 16, font: f.bold });
  const rev = pdfSafe(def.revision);
  page.drawText(rev, { x: pw - left - f.regular.widthOfTextAtSize(rev, 9), y: y + 4, size: 9, font: f.regular });
  y -= 16;
  page.drawText(pdfSafe(title), { x: left, y, size: 11, font: f.regular, color: rgb(0.3, 0.3, 0.3) });
  y -= 14;
  if (def.note) {
    for (const line of wrapLines(f.italic, 8.5, pdfSafe(def.note), width)) {
      page.drawText(line, { x: left, y, size: 8.5, font: f.italic });
      y -= 11;
    }
  }
  y -= 4;
  const size = 9;
  const colW = width / 2;
  for (const s of def.sections) {
    const answered = s.fields.filter((fl) => !isBlank(values[fl.key]) || (s.key === "site" && fl.type === "choice"));
    need(18 + (s.note ? 12 : 0) + (answered.length ? 13 : 12));
    page.drawRectangle({ x: left, y: y - 4, width, height: 15, color: rgb(0.9, 0.92, 0.91) });
    page.drawText(pdfSafe(s.title.toUpperCase()), { x: left + 4, y, size: 9.5, font: f.bold });
    y -= 17;
    if (s.note) {
      for (const line of wrapLines(f.italic, 8, pdfSafe(s.note), width - 8)) {
        need(11);
        page.drawText(line, { x: left + 4, y, size: 8, font: f.italic, color: rgb(0.25, 0.25, 0.25) });
        y -= 10;
      }
      y -= 2;
    }
    if (!answered.length) {
      page.drawText("-", { x: left + 4, y, size, font: f.regular, color: rgb(0.5, 0.5, 0.5) });
      y -= 14;
      continue;
    }
    // Two answers per line; long ones (notes, wide fields) take the whole line.
    let col = 0;
    for (const fl of answered) {
      const text = isBlank(values[fl.key]) ? "NOT ANSWERED" : answerText(fl, values[fl.key]);
      const wide = fl.wide || fl.type === "textarea" || f.regular.widthOfTextAtSize(`${fl.label}: ${text}`, size) > colW - 10;
      if (wide && col === 1) {
        y -= 13;
        col = 0;
      }
      const w = wide ? width - 8 : colW - 10;
      const labelText = pdfSafe(`${fl.label}: `);
      const lw = f.bold.widthOfTextAtSize(labelText, size);
      const lines = lw + f.regular.widthOfTextAtSize(pdfSafe(text), size) <= w ? [pdfSafe(text)] : wrapLines(f.regular, size, pdfSafe(text), w - 10);
      need(13 * (lines.length + (lines.length > 1 ? 1 : 0)));
      const x = left + 4 + (wide ? 0 : col * colW);
      page.drawText(labelText, { x, y, size, font: f.bold });
      if (lines.length === 1) page.drawText(lines[0], { x: x + lw, y, size, font: f.regular, color: text === "NOT ANSWERED" ? rgb(0.75, 0.1, 0.1) : rgb(0, 0, 0) });
      else
        for (const line of lines) {
          y -= 12;
          page.drawText(line, { x: x + 10, y, size, font: f.regular });
        }
      if (wide || col === 1) {
        y -= 13;
        col = 0;
      } else col = 1;
    }
    if (col === 1) y -= 13;
    y -= 4;
  }
}

export interface PacketPdfInput {
  title: string; // "63931 Smith - Sale Paperwork v2"
  stamp?: string; // big label for revisions, e.g. "FINAL MEASUREMENTS"
  superseded?: string; // e.g. "Superseded by v3"
  docs: (
    | { kind: "worksheet"; title: string; model: WorkbookModel; values: SheetValues }
    | { kind: "detail"; title: string; template: Uint8Array; values: FieldValues }
    | { kind: "native"; title: string; def: DetailFormDef; values: Answers }
  )[];
  notes: string;
  files: { name: string; contentType: string; data: Uint8Array }[];
  signatures: {
    role: string;
    signerName: string;
    signerEmail: string;
    image: string;
    consent: string;
    contentHash: string;
    ip: string;
    userAgent: string;
    signedAt: Date;
    current: boolean;
  }[];
  contentHash: string;
  generatedAt: Date;
}

function textPage(out: PDFDocument, f: Fonts, heading: string, body: string) {
  let page = out.addPage(LETTER);
  let y = 792 - 60;
  page.drawText(pdfSafe(heading), { x: 40, y, size: 16, font: f.bold });
  y -= 26;
  for (const line of wrapLines(f.regular, 11, pdfSafe(body), 532)) {
    if (y < 50) {
      page = out.addPage(LETTER);
      y = 792 - 60;
    }
    page.drawText(line, { x: 40, y, size: 11, font: f.regular });
    y -= 15;
  }
}

function fmtTime(d: Date): string {
  return d.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "long" });
}

export async function buildPacketPdf(input: PacketPdfInput): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setTitle(input.title);
  out.setProducer("CBD Ops Hub");
  out.setCreationDate(input.generatedAt);
  const f = await fonts(out);

  for (const d of input.docs) {
    if (d.kind === "worksheet") await appendWorksheet(out, f, d.model, d.values);
    else if (d.kind === "native") appendNativeDetail(out, f, d.def, d.values, d.title);
    else {
      const filled = await fillPdfForm(d.template, d.values, { flatten: true });
      const pages = await out.copyPages(filled, filled.getPageIndices());
      for (const p of pages) out.addPage(p);
    }
  }

  if (input.notes.trim()) textPage(out, f, "Notes", input.notes);

  for (const file of input.files) {
    try {
      if (file.contentType === "application/pdf") {
        const src = await PDFDocument.load(file.data, { ignoreEncryption: true });
        for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
        continue;
      }
      const img = file.contentType === "image/png" ? await out.embedPng(file.data) : await out.embedJpg(file.data);
      const land = img.width > img.height;
      const page = out.addPage(land ? [LETTER[1], LETTER[0]] : LETTER);
      const { width: pw, height: ph } = page.getSize();
      const s = Math.min((pw - 48) / img.width, (ph - 72) / img.height);
      page.drawImage(img, { x: (pw - img.width * s) / 2, y: (ph - 30 - img.height * s) / 2, width: img.width * s, height: img.height * s });
      page.drawText(pdfSafe(file.name), { x: 24, y: ph - 24, size: 9, font: f.regular, color: rgb(0.35, 0.35, 0.35) });
    } catch (err) {
      textPage(out, f, file.name, `This file could not be added to the PDF (${err instanceof Error ? err.message : "unknown error"}).`);
    }
  }

  // Signature record: who signed, when, from where, and the fingerprint of what they signed.
  if (input.signatures.length) {
    const page = out.addPage(LETTER);
    let y = 792 - 60;
    page.drawText("Signatures", { x: 40, y, size: 16, font: f.bold });
    y -= 20;
    page.drawText(pdfSafe(`Document: ${input.title}`), { x: 40, y, size: 9, font: f.regular });
    y -= 12;
    page.drawText(`Content fingerprint (SHA-256): ${input.contentHash}`, { x: 40, y, size: 7.5, font: f.regular });
    y -= 22;
    for (const s of input.signatures) {
      if (y < 170) break;
      page.drawText(pdfSafe(`${s.role === "customer" ? "Customer" : "Designer"}: ${s.signerName}${s.signerEmail ? ` <${s.signerEmail}>` : ""}`), { x: 40, y, size: 11, font: f.bold });
      y -= 6;
      try {
        const png = await out.embedPng(Buffer.from(s.image.replace(/^data:image\/png;base64,/, ""), "base64"));
        const sc = Math.min(220 / png.width, 70 / png.height);
        page.drawImage(png, { x: 40, y: y - png.height * sc, width: png.width * sc, height: png.height * sc });
        y -= png.height * sc + 4;
      } catch {
        y -= 4;
      }
      page.drawLine({ start: { x: 40, y }, end: { x: 300, y }, thickness: 0.6 });
      y -= 12;
      const lines = [
        `Signed ${fmtTime(s.signedAt)} from ${s.ip || "unknown address"}`,
        `Device: ${s.userAgent.slice(0, 110)}`,
        `Agreed: "${s.consent}"`,
        s.current ? `Signed this exact content (${s.contentHash.slice(0, 16)}...)` : `NOTE: the paperwork changed after this signature (signed ${s.contentHash.slice(0, 16)}...)`,
      ];
      for (const l of lines) {
        for (const w of wrapLines(f.regular, 8, pdfSafe(l), 532)) {
          page.drawText(w, { x: 40, y, size: 8, font: s.current || !l.startsWith("NOTE") ? f.regular : f.bold, color: rgb(0.25, 0.25, 0.25) });
          y -= 10;
        }
      }
      y -= 16;
    }
  }

  if (out.getPageCount() === 0) textPage(out, f, input.title, "No sheets have been added yet.");

  // Stamp every page so a printed or forwarded page always says which packet it is from.
  const pages = out.getPages();
  pages.forEach((page, i) => {
    const { width: pw, height: ph } = page.getSize();
    const footer = pdfSafe(`${input.title}  |  Page ${i + 1} of ${pages.length}`);
    page.drawText(footer, { x: pw - 10 - f.regular.widthOfTextAtSize(footer, 7), y: 6, size: 7, font: f.regular, color: rgb(0.3, 0.3, 0.3) });
    if (input.stamp) {
      const s = pdfSafe(input.stamp.toUpperCase());
      const w = f.bold.widthOfTextAtSize(s, 8) + 10;
      page.drawRectangle({ x: 8, y: ph - 15, width: w, height: 12, color: rgb(0.12, 0.42, 0.35) });
      page.drawText(s, { x: 13, y: ph - 12, size: 8, font: f.bold, color: rgb(1, 1, 1) });
    }
    if (input.superseded) {
      const s = pdfSafe(input.superseded.toUpperCase());
      page.drawText(s, { x: pw * 0.12, y: ph * 0.35, size: 44, font: f.bold, color: rgb(0.8, 0.1, 0.1), opacity: 0.22, rotate: degrees(35) });
    }
  });

  return out.save({ useObjectStreams: false });
}

export type { Fonts };
export { fonts as embedFonts };
