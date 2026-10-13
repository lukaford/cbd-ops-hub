import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { formTemplates, paperworkFiles } from "@/db/schema";
import { loadPacket } from "@/lib/paperwork";
import { buildPacketPdf } from "@/lib/forms/packetPdf";
import type { WorkbookModel } from "@/lib/forms/sheetModel";
import type { SheetValues } from "@/lib/forms/review";
import type { FieldValues } from "@/lib/forms/pdfForm";

export const dynamic = "force-dynamic";

// The packet as one PDF, named and ordered the same way every time.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const lp = await loadPacket(db, Number((await params).id));
  if (!lp) return new Response("Not found", { status: 404 });
  const detailIds = lp.docs.filter((d) => d.template.kind === "detail").map((d) => d.templateId);
  const blanks = detailIds.length ? await db.select({ id: formTemplates.id, file: formTemplates.file }).from(formTemplates).where(inArray(formTemplates.id, detailIds)) : [];
  const blank = new Map(blanks.map((b) => [b.id, b.file]));
  // Grids first, then any other attachments, each in the order they were added.
  const files = (await db.select().from(paperworkFiles).where(eq(paperworkFiles.packetId, lp.packet.id)).orderBy(asc(paperworkFiles.id))).sort(
    (a, b) => Number(a.kind !== "grid") - Number(b.kind !== "grid"),
  );
  const { packet } = lp;
  const bytes = await buildPacketPdf({
    title: lp.fileName.replace(/\.pdf$/, ""),
    stamp: packet.version > 1 || packet.label !== "Sale Paperwork" ? `v${packet.version} ${packet.label}` : undefined,
    superseded: lp.newer ? `Superseded by v${lp.newer.version}` : packet.status === "draft" ? "Draft - not submitted" : undefined,
    docs: lp.docs.map((d) =>
      d.template.kind === "worksheet"
        ? { kind: "worksheet" as const, title: d.title, model: d.template.model as WorkbookModel, values: d.values as SheetValues }
        : { kind: "detail" as const, title: d.title, template: blank.get(d.templateId)!, values: d.values as FieldValues },
    ),
    notes: packet.notes,
    files: files.map((f) => ({ name: f.name, contentType: f.contentType, data: f.data })),
    signatures: lp.signatures,
    contentHash: lp.contentHash,
    generatedAt: new Date(),
  });
  const inline = new URL(req.url).searchParams.has("view");
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${lp.fileName.replace(/"/g, "")}"`,
    },
  });
}
