// Packets of designer paperwork: creating versions, loading everything a packet
// needs, and the fingerprint signatures are tied to. Nothing here writes to JobTread.

import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { formTemplates, jobtreadJobs, paperworkDocs, paperworkFiles, paperworkIssues, paperworkPackets, paperworkSignatures } from "@/db/schema";
import type { WorkbookModel } from "./forms/sheetModel";
import { evaluateSheets, reviewPacket, worksheetHeaderCells, detailHeaderFields, type DetailModel, type PacketDoc, type SheetValues } from "./forms/review";
import type { FieldValues } from "./forms/pdfForm";
import { toSerial } from "./forms/sheetModel";
import { packetFileName, packetTitle } from "./forms/naming";

export type Packet = typeof paperworkPackets.$inferSelect;
export type Template = Omit<typeof formTemplates.$inferSelect, "file">;
export type Doc = typeof paperworkDocs.$inferSelect;

export const templateColumns = {
  id: formTemplates.id,
  kind: formTemplates.kind,
  name: formTemplates.name,
  room: formTemplates.room,
  revision: formTemplates.revision,
  position: formTemplates.position,
  fileName: formTemplates.fileName,
  model: formTemplates.model,
  archived: formTemplates.archived,
  uploadedAt: formTemplates.uploadedAt,
};

export async function activeTemplates(db: Db): Promise<Template[]> {
  return db.select(templateColumns).from(formTemplates).where(eq(formTemplates.archived, false)).orderBy(asc(formTemplates.position), asc(formTemplates.name));
}

export interface NewPacket {
  jobtreadId?: string | null;
  jobNumber: string;
  customer: string;
  city?: string;
  designer?: string;
  label: string;
  copyFrom?: number | null;
}

export async function createPacket(db: Db, p: NewPacket): Promise<number> {
  const [last] = await db
    .select({ version: paperworkPackets.version })
    .from(paperworkPackets)
    .where(eq(paperworkPackets.jobNumber, p.jobNumber))
    .orderBy(desc(paperworkPackets.version))
    .limit(1);
  const source = p.copyFrom ? (await db.select().from(paperworkPackets).where(eq(paperworkPackets.id, p.copyFrom)))[0] : undefined;
  const [row] = await db
    .insert(paperworkPackets)
    .values({
      jobtreadId: p.jobtreadId ?? null,
      jobNumber: p.jobNumber,
      customer: p.customer,
      city: p.city ?? "",
      designer: p.designer ?? source?.designer ?? "",
      label: p.label,
      version: (last?.version ?? 0) + 1,
      notes: source?.notes ?? "",
    })
    .returning({ id: paperworkPackets.id });

  // A new version starts from the previous one: same sheets and answers, same
  // grids, but no signatures, since the customer has to sign the new version.
  if (source) {
    const docs = await db.select().from(paperworkDocs).where(eq(paperworkDocs.packetId, source.id)).orderBy(asc(paperworkDocs.position));
    if (docs.length)
      await db.insert(paperworkDocs).values(docs.map((d) => ({ packetId: row.id, templateId: d.templateId, title: d.title, position: d.position, values: d.values })));
    const files = await db.select().from(paperworkFiles).where(eq(paperworkFiles.packetId, source.id));
    if (files.length)
      await db.insert(paperworkFiles).values(files.map((f) => ({ packetId: row.id, kind: f.kind, name: f.name, contentType: f.contentType, data: f.data })));
    const issues = await db.select().from(paperworkIssues).where(and(eq(paperworkIssues.packetId, source.id)));
    const open = issues.filter((i) => !i.resolvedAt);
    if (open.length) await db.insert(paperworkIssues).values(open.map((i) => ({ packetId: row.id, text: i.text, createdBy: i.createdBy })));
  }
  return row.id;
}

// Fills the header of a new sheet (client, job #, room, designer, date) from the job.
export function prefillValues(template: Template, packet: Packet, title: string, today = new Date()): SheetValues | FieldValues {
  if (template.kind === "worksheet") {
    const model = template.model as WorkbookModel;
    const cells = worksheetHeaderCells(model);
    const v: SheetValues = {};
    const put = (k: string, val: string | number) => {
      const c = cells[k];
      if (c && val !== "") (v[c.sheet] ??= {})[c.addr] = val;
    };
    put("client", packet.customer);
    put("job", /^\d+$/.test(packet.jobNumber) ? Number(packet.jobNumber) : packet.jobNumber);
    put("room", title);
    put("designer", packet.designer);
    put("date", toSerial(today));
    return v;
  }
  const head = detailHeaderFields((template.model as DetailModel).fields);
  const v: FieldValues = {};
  const date = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;
  const put = (k: string, val: string) => {
    if (head[k] && head[k].kind === "text" && val) v[head[k].name] = val;
  };
  put("client", packet.customer);
  put("job", packet.jobNumber);
  put("room", title);
  put("designer", packet.designer);
  put("date", date);
  return v;
}

export async function addDoc(db: Db, packetId: number, templateId: number, title: string): Promise<number> {
  const [packet] = await db.select().from(paperworkPackets).where(eq(paperworkPackets.id, packetId));
  const [template] = await db.select(templateColumns).from(formTemplates).where(eq(formTemplates.id, templateId));
  if (!packet || !template) throw new Error("Packet or template not found");
  const count = (await db.select({ id: paperworkDocs.id }).from(paperworkDocs).where(eq(paperworkDocs.packetId, packetId))).length;
  const name = title.trim() || template.room || template.name;
  const [row] = await db
    .insert(paperworkDocs)
    .values({ packetId, templateId, title: name, position: count, values: prefillValues(template, packet, name) })
    .returning({ id: paperworkDocs.id });
  return row.id;
}

export interface LoadedDoc extends Doc {
  template: Template;
}

export interface LoadedPacket {
  packet: Packet;
  docs: LoadedDoc[];
  files: { id: number; kind: string; name: string; contentType: string; createdAt: Date; hash: string }[];
  signatures: (typeof paperworkSignatures.$inferSelect & { current: boolean })[];
  issues: (typeof paperworkIssues.$inferSelect)[];
  versions: { id: number; version: number; label: string; status: string; createdAt: Date }[];
  newer?: { id: number; version: number; label: string };
  contentHash: string;
  fileName: string;
  title: string;
}

// Docs in packet order: by the template's number (rooms in order, work sheet
// before detail sheet), then the order they were added.
export function orderDocs<T extends { position: number; template: { position: number } }>(docs: T[]): T[] {
  return [...docs].sort((a, b) => a.template.position - b.template.position || a.position - b.position);
}

export function contentHash(packet: Pick<Packet, "jobNumber" | "notes">, docs: { id: number; templateId: number; title: string; values: unknown }[], fileHashes: string[]): string {
  const body = JSON.stringify({
    job: packet.jobNumber,
    notes: packet.notes.trim(),
    docs: docs.map((d) => [d.templateId, d.title, d.values]),
    files: fileHashes,
  });
  return createHash("sha256").update(body).digest("hex");
}

export async function loadPacket(db: Db, id: number): Promise<LoadedPacket | null> {
  const [packet] = await db.select().from(paperworkPackets).where(eq(paperworkPackets.id, id));
  if (!packet) return null;
  const docRows = await db.select().from(paperworkDocs).where(eq(paperworkDocs.packetId, id));
  const templateIds = [...new Set(docRows.map((d) => d.templateId))];
  const templates = templateIds.length ? await db.select(templateColumns).from(formTemplates).where(inArray(formTemplates.id, templateIds)) : [];
  const byId = new Map(templates.map((t) => [t.id, t]));
  const docs = orderDocs(docRows.map((d) => ({ ...d, template: byId.get(d.templateId)! })).filter((d) => d.template));
  const fileRows = await db.select().from(paperworkFiles).where(eq(paperworkFiles.packetId, id)).orderBy(asc(paperworkFiles.id));
  const files = fileRows.map((f) => ({
    id: f.id,
    kind: f.kind,
    name: f.name,
    contentType: f.contentType,
    createdAt: f.createdAt,
    hash: createHash("sha256").update(f.data).digest("hex"),
  }));
  const hash = contentHash(packet, docs, files.map((f) => f.hash));
  const sigs = await db.select().from(paperworkSignatures).where(eq(paperworkSignatures.packetId, id)).orderBy(asc(paperworkSignatures.signedAt));
  const issues = await db.select().from(paperworkIssues).where(eq(paperworkIssues.packetId, id)).orderBy(asc(paperworkIssues.createdAt));
  const versions = await db
    .select({ id: paperworkPackets.id, version: paperworkPackets.version, label: paperworkPackets.label, status: paperworkPackets.status, createdAt: paperworkPackets.createdAt })
    .from(paperworkPackets)
    .where(eq(paperworkPackets.jobNumber, packet.jobNumber))
    .orderBy(asc(paperworkPackets.version));
  const [newer] = await db
    .select({ id: paperworkPackets.id, version: paperworkPackets.version, label: paperworkPackets.label })
    .from(paperworkPackets)
    .where(and(eq(paperworkPackets.jobNumber, packet.jobNumber), gt(paperworkPackets.version, packet.version), eq(paperworkPackets.status, "submitted")))
    .orderBy(desc(paperworkPackets.version))
    .limit(1);
  return {
    packet,
    docs,
    files,
    signatures: sigs.map((s) => ({ ...s, current: s.contentHash === hash })),
    issues,
    versions,
    newer,
    contentHash: hash,
    fileName: packetFileName(packet),
    title: `${packet.jobNumber} ${packet.customer} - ${packetTitle(packet)}`,
  };
}

export function packetDocs(lp: LoadedPacket): PacketDoc[] {
  return lp.docs.map((d) =>
    d.template.kind === "worksheet"
      ? { id: d.id, kind: "worksheet", title: d.title, room: d.template.room, model: d.template.model as WorkbookModel, values: d.values as SheetValues }
      : { id: d.id, kind: "detail", title: d.title, room: d.template.room, model: d.template.model as DetailModel, values: d.values as FieldValues },
  );
}

export function reviewLoaded(lp: LoadedPacket) {
  return reviewPacket(packetDocs(lp), {
    jobNumber: lp.packet.jobNumber,
    customer: lp.packet.customer,
    gridCount: lp.files.filter((f) => f.kind === "grid").length,
    signatures: lp.signatures.map((s) => ({ role: s.role, current: s.current })),
  });
}

export function totalSalePrice(lp: LoadedPacket): number {
  let total = 0;
  for (const d of packetDocs(lp)) {
    if (d.kind !== "worksheet") continue;
    const r = reviewPacket([d], { jobNumber: "", customer: "", gridCount: 1, signatures: [] }).rooms[0];
    total += r.salePrice ?? 0;
  }
  return total;
}

export async function findJobs(db: Db, q: string, limit = 25) {
  const rows = await db
    .select({
      jobtreadId: jobtreadJobs.jobtreadId,
      jobNumber: jobtreadJobs.jobNumber,
      customer: jobtreadJobs.customer,
      city: jobtreadJobs.city,
      stage: jobtreadJobs.stage,
      name: jobtreadJobs.name,
    })
    .from(jobtreadJobs);
  const needle = q.trim().toLowerCase();
  return rows
    .filter((r) => !needle || `${r.jobNumber} ${r.customer} ${r.city} ${r.name}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.jobNumber) - Number(a.jobNumber))
    .slice(0, limit);
}

export { evaluateSheets };
