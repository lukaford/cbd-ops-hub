// Turns an uploaded price book PDF into catalog entries: every printed line with
// a price, with the section heading and column heading it sits under, so it can
// be searched. The book itself is uploaded in the app and never stored in the code.

import path from "node:path";

export interface BookLine {
  text: string; // segments joined with "  "
  segments: string[];
  x: number;
  y: number;
  size: number;
}

export interface CatalogItem {
  page: number; // 1-based
  section: string;
  columns: string; // the heading line above, e.g. "12" Deep  16" Deep  20" Deep"
  label: string; // description before the first price
  prices: string[]; // each printed price segment, e.g. "$383", "add $238"
  text: string; // the whole printed line
}

export interface PriceBookModel {
  pages: { n: number; title: string; headings: string[]; text: string }[];
  items: CatalogItem[];
}

interface Run {
  str: string;
  x: number;
  y: number;
  w: number;
  size: number;
}

const PRICE = /(?:add\s*)?\$\s?\d[\d,]*(?:\.\d+)?(?:\s*\+\s*\$?\s?\d[\d,]*(?:\.\d+)?)?/i;

// Joins the runs on one printed line, keeping wide gaps as column breaks.
export function groupLines(runs: Run[]): BookLine[] {
  const sorted = [...runs].filter((r) => r.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Run[][] = [];
  for (const r of sorted) {
    const line = lines.find((l) => Math.abs(l[0].y - r.y) <= Math.max(2, r.size * 0.35));
    if (line) line.push(r);
    else lines.push([r]);
  }
  return lines
    .map((l) => {
      l.sort((a, b) => a.x - b.x);
      const segments: string[] = [];
      let cur = "";
      let end = -Infinity;
      for (const r of l) {
        const gap = r.x - end;
        if (cur && gap > Math.max(8, r.size * 1.2)) {
          segments.push(cur.trim());
          cur = "";
        } else if (cur && gap > r.size * 0.15 && !cur.endsWith(" ") && !r.str.startsWith(" ")) cur += " ";
        cur += r.str;
        end = r.x + r.w;
      }
      if (cur.trim()) segments.push(cur.trim());
      const clean = segments.map((s) => s.replace(/\s+/g, " ")).filter(Boolean);
      return { text: clean.join("  "), segments: clean, x: l[0].x, y: l[0].y, size: Math.max(...l.map((r) => r.size)) };
    })
    .filter((l) => l.text)
    .sort((a, b) => b.y - a.y || a.x - b.x);
}

const isFooter = (t: string) => /page \d+\s*$/i.test(t) || /^\d{2}\/\d{4}$/.test(t.trim());

export function pageItems(lines: BookLine[], page: number, startSection = ""): { items: CatalogItem[]; headings: string[]; section: string } {
  const sizes = lines.map((l) => l.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] ?? 10;
  const items: CatalogItem[] = [];
  const headings: string[] = [];
  let section = startSection;
  let columns = "";
  for (const l of lines) {
    if (isFooter(l.text)) continue;
    const priced = PRICE.test(l.text);
    if (!priced) {
      const words = l.text.replace(/[^A-Za-z ]/g, "").trim();
      const caps = words.length >= 4 && words === words.toUpperCase();
      if (l.size >= body * 1.25 || (caps && l.text.length <= 70)) {
        section = l.text.length > 80 ? l.text.slice(0, 80) : l.text;
        headings.push(section);
        columns = "";
      } else if (l.segments.length >= 2) columns = l.text;
      continue;
    }
    const first = l.segments.findIndex((s) => PRICE.test(s));
    const label = l.segments.slice(0, Math.max(first, 0)).join("  ") || l.segments[0].replace(PRICE, "").trim();
    const prices = l.segments.slice(first).filter((s) => PRICE.test(s));
    items.push({ page, section, columns, label, prices, text: l.text });
  }
  return { items, headings, section };
}

export async function parsePriceBook(data: Uint8Array): Promise<PriceBookModel> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const standardFontDataUrl = path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts") + path.sep;
  const doc = await pdfjs.getDocument({ data: data.slice(), isEvalSupported: false, useSystemFonts: false, standardFontDataUrl }).promise;
  const model: PriceBookModel = { pages: [], items: [] };
  let section = "";
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const runs: Run[] = [];
    for (const it of tc.items) {
      if (!("str" in it) || !it.str) continue;
      runs.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, size: Math.abs(it.transform[3]) || it.height || 10 });
    }
    const lines = groupLines(runs);
    const r = pageItems(lines, n, section);
    section = r.section;
    model.items.push(...r.items);
    model.pages.push({ n, title: r.headings[0] ?? lines[0]?.text.slice(0, 80) ?? `Page ${n}`, headings: r.headings, text: lines.map((l) => l.text).join("\n") });
    page.cleanup();
  }
  await doc.destroy();
  return model;
}

export function searchCatalog<T extends { name: string; model: PriceBookModel }>(books: (T & { id: number })[], q: string, limit = 200) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: { bookId: number; book: string; item: CatalogItem; score: number }[] = [];
  for (const b of books) {
    for (const item of b.model.items) {
      const hay = `${item.section} ${item.columns} ${item.text}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
      const score = words.reduce((s, w) => s + (item.label.toLowerCase().includes(w) ? 2 : 0) + (item.section.toLowerCase().includes(w) ? 1 : 0), 0);
      out.push({ bookId: b.id, book: b.name, item, score });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// "01 Main Components Rev8 05-01-25.pdf" -> Main Components, Rev8 05-01-25, position 1
export function bookInfo(fileName: string): { name: string; revision: string; position: number } {
  const base = fileName.replace(/\.pdf$/i, "").replace(/_/g, " ").trim();
  const m = /^(\d+)[.\s-]+(.*)$/.exec(base);
  const rest = (m ? m[2] : base).trim();
  const rev = /\s+(rev\.?\s*\d.*)$/i.exec(rest);
  return { name: (rev ? rest.slice(0, rev.index) : rest).trim(), revision: rev ? rev[1].trim() : "", position: m ? Number(m[1]) : 99 };
}
