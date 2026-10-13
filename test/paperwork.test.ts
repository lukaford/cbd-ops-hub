import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { evaluateWorkbook, parseFormula } from "@/lib/forms/formula";
import { coerceInput, formatValue } from "@/lib/forms/numFmt";
import { packetFileName, templateInfo } from "@/lib/forms/naming";
import { parseWorkbook } from "@/lib/forms/sheetModel";
import { fillPdfForm, parsePdfForm } from "@/lib/forms/pdfForm";
import { labelFields, pdfTextItems } from "@/lib/forms/fieldLabels";
import { reviewPacket, type DetailDoc, type WorksheetDoc } from "@/lib/forms/review";
import { buildPacketPdf } from "@/lib/forms/packetPdf";
import { contentHash } from "@/lib/paperwork";

// Small stand-ins for the real templates, which hold company pricing and stay out of the repo.
async function sampleWorkbook(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet("Closet Components");
  a.getCell("A1").value = "Client Name:";
  a.getCell("B1").protection = { locked: false };
  a.getCell("C1").value = "Job #:";
  a.getCell("D1").protection = { locked: false };
  a.getCell("A3").value = "12\" DEEP PANEL";
  a.getCell("B3").protection = { locked: false };
  a.getCell("C3").value = 100;
  a.getCell("D3").value = { formula: "SUM(B3*C3)" };
  a.getCell("A4").value = "12\" SHELF";
  a.getCell("B4").protection = { locked: false };
  a.getCell("C4").value = 50;
  a.getCell("D4").value = { formula: "SUM(B4*C4)" };
  a.getCell("D4").numFmt = '"$"#,##0';
  await a.protect("", {});
  const b = wb.addWorksheet("Closet Price Presentation");
  b.getCell("D1").value = "PURCHASED:";
  b.getCell("A2").value = "EVERYDAY";
  b.getCell("B2").value = { formula: "SUM('Closet Components'!D3:D4)" };
  b.getCell("C2").value = { formula: "SUM(B2*0.6)" };
  b.getCell("D2").value = { formula: "SUM(C2*E2)" };
  b.getCell("E2").protection = { locked: false };
  b.getCell("A3").value = "CLASSIC";
  b.getCell("B3").value = { formula: "SUM(B2+100)" };
  b.getCell("C3").value = { formula: "SUM(B3*0.6)" };
  b.getCell("D3").value = { formula: "SUM(C3*E3)" };
  b.getCell("E3").protection = { locked: false };
  b.getCell("A5").value = "T O T A L with 40% off promo";
  b.getCell("B5").value = { formula: "SUM(B2*E2,B3*E3)" };
  b.getCell("C6").value = "Sale Price:";
  b.getCell("D6").value = { formula: "SUM(D2:D3)" };
  b.mergeCells("A7:C7");
  b.getCell("A7").value = "merged";
  await b.protect("", {});
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const form = pdf.getForm();
  const label = (s: string, x: number, y: number) => page.drawText(s, { x, y, size: 10, font });
  label("CLIENT NAME:", 20, 750);
  form.createTextField("Text1").addToPage(page, { x: 110, y: 745, width: 180, height: 16 });
  label("JOB #:", 320, 750);
  form.createTextField("Job#").addToPage(page, { x: 360, y: 745, width: 80, height: 16 });
  label("COLLECTION:", 20, 720);
  const col = form.createDropdown("Collection");
  col.addOptions(["None", "EVERYDAY", "CLASSIC", "BRIO"]);
  col.select("None");
  col.addToPage(page, { x: 110, y: 715, width: 120, height: 16 });
  label("COUNTERTOPS:", 20, 690);
  const top = form.createDropdown("Dropdown80");
  top.addOptions(["None", '1.18" QUARTZ up to 27" deep']);
  top.select("None");
  top.addToPage(page, { x: 110, y: 685, width: 200, height: 16 });
  label("Measurements Final:", 20, 660);
  form.createCheckBox("Check Box32").addToPage(page, { x: 150, y: 658, width: 10, height: 10 });
  label("Yes", 163, 660);
  form.createCheckBox("Check Box33").addToPage(page, { x: 190, y: 658, width: 10, height: 10 });
  label("No", 203, 660);
  return pdf.save();
}

describe("work sheet formulas", () => {
  it("parses references, ranges, other sheets and arithmetic", () => {
    expect(parseFormula("=SUM('Closet Accessories'!I10:J10,K36*J36)")).toMatchObject({ t: "call", name: "SUM" });
    const out = evaluateWorkbook(
      {
        A: { A1: { value: 2 }, A2: { value: 3 }, A3: { formula: "SUM(A1:A2)*2-1" }, A4: { formula: "B!A1" }, A5: { formula: "(A1+A2)/0" } },
        B: { A1: { formula: "SUM(A!A1*10)" } },
      },
      { A: { A2: 5 } },
    );
    expect(out.A.A3).toBe(13);
    expect(out.A.A4).toBe(20);
    expect(out.A.A5).toBe(0);
  });

  it("passes text through a bare reference and ignores it in SUM", () => {
    const out = evaluateWorkbook({ S: { A1: { value: "Jane" }, B1: { formula: "(A1)" }, C1: { formula: "SUM(A1)" } } });
    expect(out.S.B1).toBe("Jane");
    expect(out.S.C1).toBe(0);
  });

  it("formats and reads values like Excel", () => {
    expect(formatValue(1339.2, '"$"#,##0;[Red]"$"#,##0')).toBe("$1,339");
    expect(formatValue(0.4, "0%")).toBe("40%");
    expect(formatValue(46308, "mm-dd-yy")).toBe("10/13/26");
    expect(coerceInput("$1,200")).toBe(1200);
    expect(coerceInput("63931")).toBe(63931);
    expect(coerceInput("Master closet")).toBe("Master closet");
    expect(coerceInput("10/13/26", "mm-dd-yy")).toBe(46308);
  });
});

describe("templates", () => {
  it("names and orders templates from their file names", () => {
    expect(templateInfo("01. Closet Work Sheet.xlsx")).toMatchObject({ name: "Closet Work Sheet", room: "Closet", kind: "worksheet", position: 1 });
    expect(templateInfo("03b. Wall Bed Detail Sheet.pdf")).toMatchObject({ room: "Wall Bed", kind: "detail", position: 3.2 });
    expect(packetFileName({ jobNumber: "63931", customer: "Jane Smith", label: "Final Measurements", version: 2 })).toBe("63931 Smith - Final Measurements v2.pdf");
  });

  it("reads a protected work sheet: unlocked cells are the fill-ins", async () => {
    const model = await parseWorkbook(await sampleWorkbook());
    expect(model.sheets.map((s) => s.name)).toEqual(["Closet Components", "Closet Price Presentation"]);
    const a = model.sheets[0];
    expect(a.cells.B3.input).toBe(true);
    expect(a.cells.C3.input).toBeUndefined();
    expect(a.cells.D3.f).toBe("SUM(B3*C3)");
    expect(model.sheets[1].cells.A7).toMatchObject({ v: "merged", cs: 3 });
    expect(model.sheets[1].covered).toContain("B7");
  });

  it("reads a fillable PDF and names fields by their printed labels", async () => {
    const bytes = await samplePdf();
    const model = await parsePdfForm(bytes);
    const fields = labelFields(model, await pdfTextItems(bytes));
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.Text1.label).toBe("CLIENT NAME");
    expect(byName.Collection).toMatchObject({ kind: "choice", label: "COLLECTION", value: "None" });
    expect(byName["Check Box32"]).toMatchObject({ kind: "check", label: "Yes", group: "Measurements Final" });
    const filled = await fillPdfForm(bytes, { Text1: "Jane “JJ” Smith", Collection: "BRIO", "Check Box32": true }, { flatten: true });
    expect(filled.getForm().getFields()).toHaveLength(0);
  });
});

describe("packet review", () => {
  async function docs(work: Record<string, Record<string, string | number>>, detail: Record<string, string | boolean>) {
    const wb = await parseWorkbook(await sampleWorkbook());
    const pdf = await samplePdf();
    const pm = await parsePdfForm(pdf);
    const fields = labelFields(pm, await pdfTextItems(pdf));
    const w: WorksheetDoc = { id: 1, kind: "worksheet", title: "Master Closet", room: "Closet", model: wb, values: work };
    const d: DetailDoc = { id: 2, kind: "detail", title: "Master Closet", room: "Closet", model: { ...pm, fields }, values: detail };
    return [w, d];
  }

  it("totals the work sheet and finds special orders", async () => {
    const r = reviewPacket(
      await docs(
        { "Closet Components": { B1: "Jane Smith", D1: 63931, B3: 2, B4: 5 }, "Closet Price Presentation": { E2: 1 } },
        { Text1: "Jane Smith", "Job#": "63931", Collection: "EVERYDAY", Dropdown80: '1.18" QUARTZ up to 27" deep', "Check Box32": true },
      ),
      { jobNumber: "63931", customer: "Jane Smith", gridCount: 1, signatures: [{ role: "customer", current: true }, { role: "designer", current: true }] },
    );
    const work = r.rooms.find((x) => x.kind === "worksheet")!;
    expect(work.salePrice).toBeCloseTo((2 * 100 + 5 * 50) * 0.6);
    expect(work.nationalPrice).toBe(2 * 100 + 5 * 50);
    expect(work.purchased).toEqual([{ item: "EVERYDAY", amount: expect.closeTo(270, 2) }]);
    expect(r.specials).toEqual([{ docId: 2, room: "Master Closet", type: "Countertops", item: '1.18" QUARTZ up to 27" deep' }]);
    expect(r.checks).toEqual([]);
  });

  it("flags missing answers, mismatches and stale signatures", async () => {
    const r = reviewPacket(
      await docs({ "Closet Components": { B1: "Bob Jones", D1: 11111, B3: 1 }, "Closet Price Presentation": { E3: 1 } }, { Text1: "Jane Smith", "Job#": "63931", Collection: "EVERYDAY", "Check Box33": true }),
      { jobNumber: "63931", customer: "Jane Smith", gridCount: 0, signatures: [{ role: "customer", current: false }] },
    );
    const messages = r.checks.map((c) => c.message);
    expect(messages).toContain("Job # 11111 does not match job 63931.");
    expect(messages).toContain('Client name "Bob Jones" does not match Jane Smith.');
    expect(messages).toContain("Collection is EVERYDAY on the detail sheet but CLASSIC is priced on the work sheet.");
    expect(messages).toContain("Measurements are not final; resubmit as Final Measurements once measured.");
    expect(messages).toContain("No grids attached.");
    expect(messages).toContain("The paperwork changed after the customer signed; have them sign again.");
    expect(messages).toContain("Designer has not signed.");
  });

  it("fingerprints exactly what was signed", () => {
    const base = { jobNumber: "1", notes: "x" };
    const d = [{ id: 1, templateId: 1, title: "Closet", values: { a: 1 } }];
    expect(contentHash(base, d, [])).toBe(contentHash(base, [{ ...d[0] }], []));
    expect(contentHash(base, d, [])).not.toBe(contentHash(base, [{ ...d[0], values: { a: 2 } }], []));
    expect(contentHash(base, d, [])).not.toBe(contentHash({ ...base, notes: "y" }, d, []));
  });

  it("builds one PDF with every sheet, notes and the signature record", async () => {
    const wb = await parseWorkbook(await sampleWorkbook());
    const bytes = await buildPacketPdf({
      title: "63931 Smith - Sale Paperwork v1",
      docs: [
        { kind: "worksheet", title: "Master Closet", model: wb, values: { "Closet Components": { B3: 1 } } },
        { kind: "detail", title: "Master Closet", template: await samplePdf(), values: { Text1: "Jane Smith" } },
      ],
      notes: "Call before install.",
      files: [],
      signatures: [
        {
          role: "customer",
          signerName: "Jane Smith",
          signerEmail: "",
          image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
          consent: "I agree",
          contentHash: "abc",
          ip: "1.2.3.4",
          userAgent: "test",
          signedAt: new Date("2026-10-13T15:00:00Z"),
          current: true,
        },
      ],
      contentHash: "abc",
      generatedAt: new Date("2026-10-13T15:00:00Z"),
    });
    const out = await PDFDocument.load(bytes);
    // 2 work sheet tabs + 1 detail page + notes + signatures
    expect(out.getPageCount()).toBe(5);
    expect(out.getTitle()).toBe("63931 Smith - Sale Paperwork v1");
  });
});
