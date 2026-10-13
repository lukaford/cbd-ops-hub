// The packet summary as an Excel file: job details, rooms with colours and
// prices, special-order items, every selection, and the checks and open items.

import type { LoadedPacket } from "../paperwork";
import type { Check, RoomSummary, SpecialOrderItem } from "./review";

export async function summaryWorkbook(
  lp: LoadedPacket,
  review: { rooms: RoomSummary[]; specials: SpecialOrderItem[]; checks: Check[] },
): Promise<Uint8Array> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "CBD Ops Hub";
  const p = lp.packet;
  const bold = { bold: true };
  const money = '"$"#,##0.00';

  const job = wb.addWorksheet("Summary");
  job.columns = [{ width: 24 }, { width: 60 }];
  const rows: [string, string | number][] = [
    ["Job #", p.jobNumber],
    ["Customer", p.customer],
    ["City", p.city],
    ["Designer", p.designer],
    ["Paperwork", `${p.label} v${p.version}`],
    ["Status", p.status === "submitted" ? `Submitted ${p.submittedAt?.toLocaleDateString("en-US") ?? ""}` : "Draft"],
    ["Superseded by", lp.newer ? `v${lp.newer.version} ${lp.newer.label}` : ""],
    ["Rooms", [...new Set(review.rooms.map((r) => r.title))].join(", ")],
    ["Material types", [...new Set(review.specials.map((s) => s.type))].join(", ") || "None found"],
    ["Total sale price", review.rooms.reduce((s, r) => s + (r.salePrice ?? 0), 0)],
    ["Customer signed", lp.signatures.filter((s) => s.role === "customer").map((s) => `${s.signerName} ${s.signedAt.toLocaleString("en-US")}${s.current ? "" : " (paperwork changed after)"}`).join("; ") || "No"],
    ["Open checks", review.checks.length],
    ["Open items", lp.issues.filter((i) => !i.resolvedAt).length],
    ["File name", lp.fileName],
  ];
  for (const [k, v] of rows) {
    const r = job.addRow([k, v]);
    r.getCell(1).font = bold;
    if (k === "Total sale price") r.getCell(2).numFmt = money;
  }

  const rooms = wb.addWorksheet("Rooms");
  rooms.columns = [
    { header: "Room", width: 22 },
    { header: "Sheets", width: 26 },
    { header: "Color", width: 18 },
    { header: "Collection", width: 16 },
    { header: "Sale price", width: 14, style: { numFmt: money } },
    { header: "National price", width: 14, style: { numFmt: money } },
    { header: "Purchased options", width: 70 },
  ];
  // One row per room, combining its detail sheet (colour, collection) and work sheet (prices).
  const titles = [...new Set(review.rooms.map((r) => r.title))];
  for (const title of titles) {
    const rs = review.rooms.filter((r) => r.title === title);
    const detail = rs.find((r) => r.kind === "detail");
    const work = rs.filter((r) => r.kind === "worksheet");
    const sum = (k: "salePrice" | "nationalPrice") => (work.length ? work.reduce((s, r) => s + (r[k] ?? 0), 0) : null);
    rooms.addRow([
      title,
      rs.map((r) => (r.kind === "worksheet" ? "Work sheet" : "Detail sheet")).join(" + "),
      detail?.header.color ?? "",
      detail?.header.collection ?? "",
      sum("salePrice"),
      sum("nationalPrice"),
      work.flatMap((r) => r.purchased.map((x) => `${x.item} ($${x.amount.toFixed(2)})`)).join("; "),
    ]);
  }

  const specials = wb.addWorksheet("Special Orders");
  specials.columns = [
    { header: "Room", width: 22 },
    { header: "Material type", width: 28 },
    { header: "Item", width: 60 },
  ];
  for (const s of review.specials) specials.addRow([s.room, s.type, s.item]);

  const sel = wb.addWorksheet("Selections");
  sel.columns = [
    { header: "Room", width: 22 },
    { header: "Item", width: 44 },
    { header: "Selection", width: 50 },
  ];
  for (const r of review.rooms) for (const s of r.selections) sel.addRow([r.title, s.label, s.value]);

  const checks = wb.addWorksheet("Checks & Open Items");
  checks.columns = [
    { header: "Type", width: 16 },
    { header: "Room", width: 22 },
    { header: "What", width: 80 },
    { header: "Added by", width: 16 },
    { header: "Resolved", width: 18 },
  ];
  for (const c of review.checks) checks.addRow([c.level === "missing" ? "Missing" : "Check", c.room ?? "", c.message, "Automatic", ""]);
  for (const i of lp.issues) checks.addRow(["Open item", "", i.text, i.createdBy, i.resolvedAt ? i.resolvedAt.toLocaleDateString("en-US") : ""]);

  for (const ws of [rooms, specials, sel, checks]) {
    ws.getRow(1).font = bold;
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
