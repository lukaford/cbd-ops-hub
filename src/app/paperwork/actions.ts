"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { formTemplates, jobtreadJobs, paperworkDocs, paperworkFiles, paperworkIssues, paperworkPackets, paperworkSignatures } from "@/db/schema";
import { parseWorkbook } from "@/lib/forms/sheetModel";
import { parsePdfForm } from "@/lib/forms/pdfForm";
import { labelFields, pdfTextItems } from "@/lib/forms/fieldLabels";
import { templateInfo, PACKET_LABELS, SIGN_CONSENT } from "@/lib/forms/naming";
import { addDoc, createPacket, loadPacket, templateColumns } from "@/lib/paperwork";
import { currentStaff, inScope, requireStaff, visibleJobs } from "@/lib/auth/current";
import { BUILTIN_FORMS, builtinForm, ensureBuiltinTemplates, cleanDetailValues, detailAnswerRows, loadPrices, pricedModel, savePrices, worksheetAnswerRows, writeAnswers, WORKSHEETS, type WorksheetFormDef } from "@/lib/forms/native";
import { stripPrices, type Prices } from "@/lib/forms/native/worksheetBuild";
import type { Value } from "@/lib/forms/formula";

const str = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

async function packetOrThrow(id: number) {
  const db = await getDb();
  const [p] = await db.select().from(paperworkPackets).where(eq(paperworkPackets.id, id));
  // People who see only their own work can only touch their own jobs' paperwork.
  if (!p || !inScope(await visibleJobs(), p.jobNumber)) throw new Error("Packet not found");
  return { db, packet: p };
}

async function editablePacket(id: number) {
  const r = await packetOrThrow(id);
  if (r.packet.status !== "draft") throw new Error("This paperwork was submitted. Start a new version to change it.");
  return r;
}

// --- templates ---

export async function uploadTemplates(form: FormData): Promise<void> {
  const db = await getDb();
  const added: string[] = [];
  const skipped: string[] = [];
  for (const entry of form.getAll("files")) {
    if (!(entry instanceof File) || !entry.size) continue;
    const bytes = new Uint8Array(await entry.arrayBuffer());
    const info = templateInfo(entry.name);
    try {
      if (bytes.length > MAX_FILE) throw new Error("file is over 8 MB");
      let model: unknown;
      let revision = "";
      if (/\.xlsx$/i.test(entry.name)) {
        const wb = await parseWorkbook(bytes);
        if (!wb.sheets.length) throw new Error("no sheets");
        model = wb;
        revision = wb.revision ?? "";
      } else if (/\.pdf$/i.test(entry.name)) {
        const pdf = await parsePdfForm(bytes);
        if (!pdf.fields.length) throw new Error("not a fillable PDF (it has no form fields)");
        const items = await pdfTextItems(bytes);
        model = { ...pdf, fields: labelFields(pdf, items) };
        revision = (/\brev\.?\s*\d+(?:\s?-\s?\w+)?/i.exec(items.map((t) => t.str).join(" "))?.[0] ?? "").replace(/\s?-\s?/, "-");
      } else throw new Error("only .xlsx work sheets and fillable .pdf detail sheets can be used");
      // A newer upload of the same form replaces the old one for new paperwork;
      // paperwork already started keeps the version it was started on.
      await db
        .update(formTemplates)
        .set({ archived: true })
        .where(and(eq(formTemplates.name, info.name), eq(formTemplates.kind, info.kind), eq(formTemplates.archived, false)));
      await db.insert(formTemplates).values({
        uploadedByUserId: (await currentStaff())?.user.id ?? null,
        kind: info.kind,
        name: info.name,
        room: info.room,
        revision,
        position: Math.round(info.position * 100),
        fileName: entry.name,
        file: bytes,
        model,
      });
      added.push(info.name);
    } catch (err) {
      skipped.push(`${entry.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  revalidatePath("/paperwork/templates");
  const q = new URLSearchParams();
  if (added.length) q.set("added", added.join(", "));
  if (skipped.length) q.set("skipped", skipped.join(" | "));
  redirect(`/paperwork/templates?${q}`);
}

export async function archiveTemplate(form: FormData): Promise<void> {
  const db = await getDb();
  await db.update(formTemplates).set({ archived: true }).where(eq(formTemplates.id, Number(form.get("id"))));
  revalidatePath("/paperwork/templates");
  redirect("/paperwork/templates");
}

// --- packets ---

export async function startPacket(form: FormData): Promise<void> {
  const db = await getDb();
  const jobtreadId = str(form, "jobtreadId");
  const label = PACKET_LABELS.includes(str(form, "label")) ? str(form, "label") : "Sale Paperwork";
  let jobNumber = str(form, "jobNumber");
  let customer = str(form, "customer");
  let city = "";
  if (jobtreadId) {
    const [j] = await db.select().from(jobtreadJobs).where(eq(jobtreadJobs.jobtreadId, jobtreadId));
    if (j) {
      jobNumber = j.jobNumber;
      customer = j.customer;
      city = j.city;
    }
  }
  if (!jobNumber || !customer) redirect("/paperwork?error=Pick+a+job+or+enter+a+job+number+and+customer");
  const copyFrom = Number(form.get("copyFrom")) || null;
  const staff = await currentStaff();
  const designer = str(form, "designer") || staff?.user.jobNames[0] || "";
  const id = await createPacket(db, { jobtreadId: jobtreadId || null, jobNumber, customer, city, designer, label, copyFrom, createdByUserId: staff?.user.id ?? null });
  revalidatePath("/paperwork");
  redirect(`/paperwork/${id}`);
}

export async function addSheet(form: FormData): Promise<void> {
  const packetId = Number(form.get("packetId"));
  const { db } = await editablePacket(packetId);
  const docId = await addDoc(db, packetId, Number(form.get("templateId")), str(form, "title"));
  redirect(`/paperwork/doc/${docId}`);
}

// A room's built-in work sheet and detail sheet together (Wall Bed has only a detail sheet).
export async function addRoom(form: FormData): Promise<void> {
  const packetId = Number(form.get("packetId"));
  const { db } = await editablePacket(packetId);
  const room = str(form, "room");
  const keys = BUILTIN_FORMS.filter((f) => f.room === room).map((f) => f.key);
  if (!keys.length) redirect(`/paperwork/${packetId}`);
  await ensureBuiltinTemplates(db);
  const rows = await db.select({ id: formTemplates.id, builtinKey: formTemplates.builtinKey }).from(formTemplates).where(inArray(formTemplates.builtinKey, keys));
  const title = str(form, "title") || room;
  for (const k of keys) {
    const t = rows.find((r) => r.builtinKey === k);
    if (t) await addDoc(db, packetId, t.id, title);
  }
  revalidatePath(`/paperwork/${packetId}`);
  redirect(`/paperwork/${packetId}#sheets`);
}

export async function removeDoc(form: FormData): Promise<void> {
  const db = await getDb();
  const [doc] = await db.select().from(paperworkDocs).where(eq(paperworkDocs.id, Number(form.get("id"))));
  if (!doc) return;
  await editablePacket(doc.packetId);
  await db.delete(paperworkDocs).where(eq(paperworkDocs.id, doc.id));
  revalidatePath(`/paperwork/${doc.packetId}`);
  redirect(`/paperwork/${doc.packetId}`);
}

// Only the cells a built-in work sheet lets the designer fill, as numbers where the sheet expects them.
function cleanSheetValues(def: WorksheetFormDef, raw: unknown): Record<string, Record<string, Value>> {
  const allowed = new Map<string, "num" | "text" | "check" | "date">();
  for (const s of def.layout.sections) for (const r of s.rows) for (const c of r.cells) if (c.kind !== "out" && c.kind !== "price") allowed.set(`${c.sheet}!${c.addr}`, c.kind);
  for (const [k, c] of Object.entries(def.layout.header)) if (c) allowed.set(`${c.sheet}!${c.addr}`, k === "date" ? "num" : k === "job" ? "num" : "text");
  const out: Record<string, Record<string, Value>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [sheet, cells] of Object.entries(raw as Record<string, unknown>)) {
    if (!cells || typeof cells !== "object") continue;
    for (const [addr, v] of Object.entries(cells as Record<string, unknown>)) {
      const kind = allowed.get(`${sheet}!${addr}`);
      if (!kind || v === null || v === undefined || v === "") continue;
      let val: Value;
      if (kind === "text") val = String(v).slice(0, 300);
      else if (typeof v === "number" && Number.isFinite(v)) val = v;
      else if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) val = Number(v);
      else if (typeof v === "string") val = v.slice(0, 60); // a job number with letters, say
      else continue;
      (out[sheet] ??= {})[addr] = val;
    }
  }
  return out;
}

// Called from the sheet editors as the designer types.
export async function saveDocValues(docId: number, values: unknown, title?: string): Promise<{ ok: boolean; error?: string; savedAt?: string }> {
  await requireStaff("paperwork.write");
  const db = await getDb();
  const [doc] = await db.select().from(paperworkDocs).where(eq(paperworkDocs.id, docId));
  if (!doc) return { ok: false, error: "This sheet no longer exists." };
  const [p] = await db.select().from(paperworkPackets).where(eq(paperworkPackets.id, doc.packetId));
  if (!p || !inScope(await visibleJobs(), p.jobNumber)) return { ok: false, error: "This sheet no longer exists." };
  if (p?.status !== "draft") return { ok: false, error: "This paperwork was submitted, so it can't be changed. Start a new version instead." };
  if (!values || typeof values !== "object") return { ok: false, error: "Nothing to save." };
  const [template] = await db.select(templateColumns).from(formTemplates).where(eq(formTemplates.id, doc.templateId));
  const def = builtinForm(template?.builtinKey);
  const now = new Date();
  const newTitle = title?.trim() ? title.trim().slice(0, 80) : doc.title;
  let clean: unknown = values;
  if (def?.kind === "detail") clean = cleanDetailValues(def, values);
  else if (def?.kind === "worksheet") clean = cleanSheetValues(def, values);
  await db
    .update(paperworkDocs)
    .set({ values: clean, updatedAt: now, title: newTitle })
    .where(eq(paperworkDocs.id, docId));
  // Built-in sheets also keep every answer as its own row for reports.
  if (def) {
    const rows =
      def.kind === "detail"
        ? detailAnswerRows(def, clean as Record<string, never>)
        : worksheetAnswerRows(def, pricedModel(def, (await loadPrices(db, def.key))[def.key]), clean as Record<string, Record<string, Value>>);
    await writeAnswers(db, { id: doc.id, packetId: doc.packetId, title: newTitle }, p.jobNumber, def.key, rows);
  }
  return { ok: true, savedAt: now.toISOString() };
}

// --- prices for the built-in work sheets ---

// Accepts the company work sheet files (.xlsx: prices read from the same cells)
// or a prices file (.json) made from them.
export async function uploadPrices(form: FormData): Promise<void> {
  const staff = await requireStaff("pricebook.manage");
  const db = await getDb();
  const loaded: string[] = [];
  const skipped: string[] = [];
  for (const entry of form.getAll("files")) {
    if (!(entry instanceof File) || !entry.size) continue;
    try {
      const bytes = new Uint8Array(await entry.arrayBuffer());
      let all: Record<string, Prices> = {};
      if (/\.json$/i.test(entry.name)) all = JSON.parse(new TextDecoder().decode(bytes));
      else if (/\.xlsx$/i.test(entry.name)) {
        const { prices } = stripPrices(await parseWorkbook(bytes));
        // Match the file to the built-in work sheet whose cells it fills best.
        const best = WORKSHEETS.map((d) => ({ d, hits: Object.keys(prices).filter((k) => d.model.sheets.some((s) => k.startsWith(`${s.name}!`))).length }))
          .filter((x) => x.hits > 0)
          .sort((a, b) => b.hits - a.hits)[0];
        if (!best) throw new Error("its tabs don't match any built-in work sheet");
        all = { [best.d.key]: prices };
      } else throw new Error("use the work sheet .xlsx files or a prices .json file");
      const counts = await savePrices(db, all, staff?.user.id ?? null);
      if (!Object.keys(counts).length) throw new Error("no prices in it match the built-in work sheets");
      for (const [k, n] of Object.entries(counts)) loaded.push(`${WORKSHEETS.find((w) => w.key === k)?.name ?? k} (${n})`);
    } catch (err) {
      skipped.push(`${entry.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  revalidatePath("/paperwork/prices");
  const q = new URLSearchParams();
  if (loaded.length) q.set("loaded", loaded.join(", "));
  if (skipped.length) q.set("skipped", skipped.join(" | "));
  redirect(`/paperwork/prices?${q}`);
}

export async function setPrice(form: FormData): Promise<void> {
  const staff = await requireStaff("pricebook.manage");
  const db = await getDb();
  const key = str(form, "form");
  const cell = str(form, "cell");
  const raw = str(form, "value").replace(/[$,]/g, "");
  if (raw !== "" && !isNaN(Number(raw))) await savePrices(db, { [key]: { [cell]: Number(raw) } }, staff?.user.id ?? null);
  revalidatePath("/paperwork/prices");
  redirect(`/paperwork/prices?form=${encodeURIComponent(key)}#${encodeURIComponent(cell)}`);
}

export async function saveNotes(form: FormData): Promise<void> {
  const id = Number(form.get("packetId"));
  const { db } = await editablePacket(id);
  await db
    .update(paperworkPackets)
    .set({ notes: String(form.get("notes") ?? "").slice(0, 20000), designer: str(form, "designer") })
    .where(eq(paperworkPackets.id, id));
  revalidatePath(`/paperwork/${id}`);
  redirect(`/paperwork/${id}#notes`);
}

const FILE_TYPES = ["image/png", "image/jpeg", "application/pdf"];
// The built-in database cannot store a single value much over 8 MB; phone photos are well under.
const MAX_FILE = 8 * 1024 * 1024;

export async function uploadFiles(form: FormData): Promise<void> {
  const id = Number(form.get("packetId"));
  const { db } = await editablePacket(id);
  const kind = str(form, "kind") === "other" ? "other" : "grid";
  const rejected: string[] = [];
  for (const entry of form.getAll("files")) {
    if (!(entry instanceof File) || !entry.size) continue;
    const type = entry.type === "image/jpg" ? "image/jpeg" : entry.type;
    if (!FILE_TYPES.includes(type) || entry.size > MAX_FILE) {
      rejected.push(entry.name);
      continue;
    }
    await db.insert(paperworkFiles).values({ packetId: id, kind, name: entry.name.slice(0, 120), contentType: type, data: new Uint8Array(await entry.arrayBuffer()) });
  }
  revalidatePath(`/paperwork/${id}`);
  redirect(`/paperwork/${id}${rejected.length ? `?rejected=${encodeURIComponent(rejected.join(", "))}` : ""}#files`);
}

export async function deleteFile(form: FormData): Promise<void> {
  const db = await getDb();
  const [f] = await db.select({ id: paperworkFiles.id, packetId: paperworkFiles.packetId }).from(paperworkFiles).where(eq(paperworkFiles.id, Number(form.get("id"))));
  if (!f) return;
  await editablePacket(f.packetId);
  await db.delete(paperworkFiles).where(eq(paperworkFiles.id, f.id));
  revalidatePath(`/paperwork/${f.packetId}`);
  redirect(`/paperwork/${f.packetId}#files`);
}

export async function addIssue(form: FormData): Promise<void> {
  const id = Number(form.get("packetId"));
  const { db } = await packetOrThrow(id);
  const text = str(form, "text").slice(0, 500);
  if (text) await db.insert(paperworkIssues).values({ packetId: id, text, createdBy: str(form, "createdBy").slice(0, 60), createdByUserId: (await currentStaff())?.user.id ?? null });
  revalidatePath(`/paperwork/${id}`);
  redirect(`/paperwork/${id}#checks`);
}

export async function resolveIssue(form: FormData): Promise<void> {
  const db = await getDb();
  const [i] = await db.select().from(paperworkIssues).where(eq(paperworkIssues.id, Number(form.get("id"))));
  if (!i) return;
  await packetOrThrow(i.packetId);
  const resolvedByUserId = i.resolvedAt ? null : ((await currentStaff())?.user.id ?? null);
  await db.update(paperworkIssues).set({ resolvedAt: i.resolvedAt ? null : new Date(), resolvedByUserId }).where(eq(paperworkIssues.id, i.id));
  revalidatePath(`/paperwork/${i.packetId}`);
  redirect(`/paperwork/${i.packetId}#checks`);
}

export async function signPacket(form: FormData): Promise<{ ok: boolean; error?: string }> {
  const id = Number(form.get("packetId"));
  const db = await getDb();
  const lp = await loadPacket(db, id);
  if (!lp || !inScope(await visibleJobs(), lp.packet.jobNumber)) return { ok: false, error: "Paperwork not found." };
  if (lp.packet.status !== "draft") return { ok: false, error: "This paperwork was already submitted." };
  const role = str(form, "role") === "designer" ? "designer" : "customer";
  const signerName = str(form, "name").slice(0, 100);
  const image = String(form.get("image") ?? "");
  if (!signerName) return { ok: false, error: "Type your full name." };
  if (form.get("consent") !== "on") return { ok: false, error: "Check the box to agree to sign electronically." };
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image) || image.length < 200 || image.length > 2_000_000) return { ok: false, error: "Draw your signature in the box." };
  // The page shows the fingerprint it was loaded with; if the paperwork changed since, ask to review again.
  if (str(form, "hash") !== lp.contentHash) return { ok: false, error: "The paperwork changed while this page was open. Reload it, review, and sign again." };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  await db.insert(paperworkSignatures).values({
    packetId: id,
    role,
    signerName,
    signerEmail: str(form, "email").slice(0, 120),
    // A designer signs in their own name; the customer signs on the designer's device.
    signerUserId: role === "designer" ? ((await currentStaff())?.user.id ?? null) : null,
    image,
    consent: SIGN_CONSENT,
    contentHash: lp.contentHash,
    ip,
    userAgent: (h.get("user-agent") ?? "").slice(0, 300),
  });
  revalidatePath(`/paperwork/${id}`);
  return { ok: true };
}

export async function submitPacket(form: FormData): Promise<void> {
  const id = Number(form.get("packetId"));
  const { db } = await editablePacket(id);
  // Built-in work sheets keep the prices they were sold at, whatever changes later.
  const lp = await loadPacket(db, id);
  for (const d of lp?.docs ?? []) if (d.native && "model" in d.native && !d.native.frozen) await db.update(paperworkDocs).set({ prices: d.native.prices }).where(eq(paperworkDocs.id, d.id));
  await db.update(paperworkPackets).set({ status: "submitted", submittedAt: new Date() }).where(eq(paperworkPackets.id, id));
  revalidatePath(`/paperwork/${id}`);
  revalidatePath("/paperwork");
  redirect(`/paperwork/${id}?submitted=1`);
}

export async function deleteDraft(form: FormData): Promise<void> {
  const id = Number(form.get("packetId"));
  const { db } = await editablePacket(id);
  await db.delete(paperworkPackets).where(eq(paperworkPackets.id, id));
  revalidatePath("/paperwork");
  redirect("/paperwork");
}
