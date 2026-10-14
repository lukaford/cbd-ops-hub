// Reads the fillable fields of an uploaded detail sheet (a PDF form) and fills
// them back in. The original PDF is the template, so the finished sheet looks
// exactly like the paper one.

import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
  StandardFonts,
  TextAlignment,
  type PDFField,
} from "pdf-lib";

export type FieldKind = "text" | "check" | "choice" | "radio";

export interface FieldBox {
  page: number;
  // PDF points from the bottom-left corner of the visible page (its crop box).
  x: number;
  y: number;
  w: number;
  h: number;
  on?: string; // the value a checkbox or radio button stands for
}

export interface FormField {
  name: string;
  kind: FieldKind;
  boxes: FieldBox[];
  options?: string[];
  editable?: boolean; // dropdown also accepts typed text
  multiline?: boolean;
  align?: "left" | "center" | "right";
  maxLen?: number;
  fontSize?: number; // 0 = auto
  // Prefilled label text in the template, shown but not meant to be changed.
  fixed?: string;
  value?: string | boolean;
}

export interface PdfFormModel {
  pages: { w: number; h: number }[];
  fields: FormField[];
}

export type FieldValues = Record<string, string | boolean>;

function kindOf(f: PDFField): FieldKind | null {
  if (f instanceof PDFTextField) return "text";
  if (f instanceof PDFCheckBox) return "check";
  if (f instanceof PDFDropdown || f instanceof PDFOptionList) return "choice";
  if (f instanceof PDFRadioGroup) return "radio";
  if (f instanceof PDFSignature) return null;
  return null;
}

function onValue(widget: { getOnValue(): PDFName | undefined }): string | undefined {
  try {
    return widget.getOnValue()?.decodeText();
  } catch {
    return undefined;
  }
}

export async function parsePdfForm(data: Uint8Array | ArrayBuffer): Promise<PdfFormModel> {
  const pdf = await PDFDocument.load(data, { ignoreEncryption: true });
  const pages = pdf.getPages();
  const pageIndex = new Map(pages.map((p, i) => [p.ref.toString(), i]));
  // Widgets do not always point back at their page, so also index each page's annotations.
  const annotPage = new Map<string, number>();
  pages.forEach((p, i) => {
    const annots = p.node.Annots();
    if (!annots) return;
    for (let k = 0; k < annots.size(); k++) annotPage.set(String(annots.get(k)), i);
  });

  const fields: FormField[] = [];
  for (const f of pdf.getForm().getFields()) {
    const kind = kindOf(f);
    if (!kind) continue;
    const widgets = f.acroField.getWidgets();
    const boxes: FieldBox[] = widgets.map((w) => {
      const r = w.getRectangle();
      const ref = pdf.context.getObjectRef(w.dict);
      const p = w.P();
      const page = (p && pageIndex.get(p.toString())) ?? (ref ? annotPage.get(ref.toString()) : undefined) ?? 0;
      // Measured from the corner of the visible page, which is not always at 0,0.
      const crop = pages[page]?.getCropBox() ?? { x: 0, y: 0 };
      return { page, x: r.x - crop.x, y: r.y - crop.y, w: r.width, h: r.height, on: kind === "check" || kind === "radio" ? onValue(w) : undefined };
    });
    const field: FormField = { name: f.getName(), kind, boxes };
    const da = f.acroField.getDefaultAppearance() ?? "";
    const size = /([\d.]+)\s+Tf/.exec(da);
    if (size) field.fontSize = Number(size[1]);

    if (f instanceof PDFTextField) {
      field.multiline = f.isMultiline();
      const a = f.getAlignment();
      field.align = a === TextAlignment.Center ? "center" : a === TextAlignment.Right ? "right" : "left";
      field.maxLen = f.getMaxLength();
      const text = f.getText();
      if (text) {
        field.value = text;
        if (f.isReadOnly()) field.fixed = text;
      }
    } else if (f instanceof PDFCheckBox) {
      field.value = f.isChecked();
    } else if (f instanceof PDFDropdown || f instanceof PDFOptionList) {
      field.options = f.getOptions();
      if (f instanceof PDFDropdown) field.editable = f.isEditable();
      const sel = f.getSelected()[0];
      if (sel) field.value = sel;
    } else if (f instanceof PDFRadioGroup) {
      field.options = f.getOptions();
      const sel = f.getSelected();
      if (sel) field.value = sel;
    }
    fields.push(field);
  }
  return {
    pages: pages.map((p) => {
      const c = p.getCropBox();
      return { w: c.width, h: c.height };
    }),
    fields,
  };
}

// The standard PDF fonts only cover Latin-1 plus a few marks; swap anything else.
export function pdfSafe(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

export async function fillPdfForm(template: Uint8Array | ArrayBuffer, values: FieldValues, opts: { flatten?: boolean } = {}): Promise<PDFDocument> {
  const pdf = await PDFDocument.load(template, { ignoreEncryption: true });
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const [name, value] of Object.entries(values)) {
    let f: PDFField;
    try {
      f = form.getField(name);
    } catch {
      continue; // a field from an older revision of the template
    }
    try {
      if (f instanceof PDFTextField) {
        const text = pdfSafe(String(value ?? ""));
        const max = f.getMaxLength();
        f.setText(max ? text.slice(0, max) : text);
      } else if (f instanceof PDFCheckBox) {
        if (value === true || value === "true") f.check();
        else f.uncheck();
      } else if (f instanceof PDFDropdown) {
        const v = String(value ?? "");
        if (!v) f.clear();
        else {
          if (!f.getOptions().includes(v)) f.addOptions(pdfSafe(v));
          f.select(f.getOptions().includes(v) ? v : pdfSafe(v));
        }
      } else if (f instanceof PDFOptionList) {
        const v = String(value ?? "");
        if (v && f.getOptions().includes(v)) f.select(v);
      } else if (f instanceof PDFRadioGroup) {
        const v = String(value ?? "");
        if (v && f.getOptions().includes(v)) f.select(v);
      }
    } catch (err) {
      console.error(`Could not fill field ${name}:`, err);
    }
  }
  // Rebuild every field's look with a font that can draw the text, then lock it in.
  try {
    form.updateFieldAppearances(font);
  } catch (err) {
    console.error("Could not refresh field appearances:", err);
  }
  if (opts.flatten) {
    try {
      form.flatten({ updateFieldAppearances: false });
    } catch (err) {
      console.error("Could not flatten the form:", err);
    }
  }
  return pdf;
}
