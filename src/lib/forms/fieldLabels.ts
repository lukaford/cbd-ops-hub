// Detail sheet fields have generic names ("Text18", "Check Box12"), so each one
// is named after the printed words beside it: the text just left of a box or
// dropdown, the text just right of a checkbox, plus the row heading it sits under.

import path from "node:path";
import type { FormField, PdfFormModel } from "./pdfForm";

export interface TextItem {
  page: number;
  str: string;
  x: number;
  y: number; // baseline, points from the bottom of the page
  w: number;
  h: number;
}

export interface LabeledField extends FormField {
  label?: string;
  group?: string;
}

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/[:\s_]+$/, "").replace(/^[\s_□!]+/, "").trim();

export function labelFields(model: PdfFormModel, items: TextItem[]): LabeledField[] {
  const words = items.filter((t) => /[A-Za-z0-9]/.test(t.str));
  return model.fields.map((f) => {
    const b = f.boxes[0];
    if (!b) return f;
    const mid = b.y + b.h / 2;
    const onLine = words.filter((t) => t.page === b.page && Math.abs(t.y + t.h * 0.35 - mid) <= Math.max(4, b.h / 2));
    const left = onLine.filter((t) => t.x + t.w <= b.x + 3).sort((p, q) => q.x + q.w - (p.x + p.w));
    const right = onLine.filter((t) => t.x >= b.x + b.w - 3).sort((p, q) => p.x - q.x);
    const heading = left.find((t) => /:\s*$/.test(t.str) && b.x - (t.x + t.w) < 260);
    const nearRight = right[0] && right[0].x - (b.x + b.w) < 40 ? clean(right[0].str) : undefined;
    const nearLeft = left[0] && b.x - (left[0].x + left[0].w) < 120 ? clean(left[0].str) : undefined;
    // Quantity blanks ("____ Tie Rack") sit left of their words, so fall back to the other side.
    // A box laid over the blank of "____ Single Jewelry Tray" takes the words after the blank.
    const under = onLine.find((t) => t.x <= b.x + 3 && t.x + t.w > b.x + b.w && /^\s*_{2,}/.test(t.str));
    let label = under
      ? clean(under.str)
      : f.kind === "check" || f.kind === "radio"
        ? nearRight || nearLeft
        : nearLeft || nearRight;
    if (label && !/[A-Za-z]/.test(label)) label = undefined;
    const group = heading ? clean(heading.str) : undefined;
    return { ...f, label: label || group, group: group && group !== label ? group : undefined };
  });
}

export async function pdfTextItems(data: Uint8Array): Promise<TextItem[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Font metrics for the standard PDF fonts (Helvetica etc.) ship with pdf.js.
  const standardFontDataUrl = path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts") + path.sep;
  const doc = await pdfjs.getDocument({ data: data.slice(), isEvalSupported: false, useSystemFonts: false, standardFontDataUrl }).promise;
  const out: TextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const [x0, y0] = page.view; // same origin as the field boxes
    for (const it of tc.items) {
      if (!("str" in it) || !it.str) continue;
      out.push({ page: p - 1, str: it.str, x: it.transform[4] - x0, y: it.transform[5] - y0, w: it.width, h: it.height || Math.abs(it.transform[3]) });
    }
  }
  await doc.destroy();
  return out;
}

// Header fields worth recognising on every sheet, by their printed label.
export const HEADER_KEYS: Record<string, RegExp> = {
  client: /^client name$/i,
  room: /^room\/?\s*location$|^location$/i,
  designer: /^designer$/i,
  date: /^date( submitted)?$/i,
  job: /^job ?#$/i,
  color: /^color$/i,
  collection: /^collection$/i,
};

export function headerKey(f: LabeledField): string | undefined {
  if (f.group && f.label !== f.group) return undefined;
  for (const [k, re] of Object.entries(HEADER_KEYS)) if (f.label && re.test(f.label)) return k;
  return undefined;
}
