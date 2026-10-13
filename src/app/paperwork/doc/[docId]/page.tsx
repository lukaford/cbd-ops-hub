import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { formTemplates, paperworkDocs, paperworkPackets } from "@/db/schema";
import { templateColumns } from "@/lib/paperwork";
import { packetTitle } from "@/lib/forms/naming";
import type { WorkbookModel } from "@/lib/forms/sheetModel";
import type { DetailModel, SheetValues } from "@/lib/forms/review";
import type { FieldValues } from "@/lib/forms/pdfForm";
import WorksheetEditor from "./WorksheetEditor";
import DetailEditor from "./DetailEditorLazy";

export const dynamic = "force-dynamic";

export default async function DocPage({ params }: { params: Promise<{ docId: string }> }) {
  const db = await getDb();
  const [doc] = await db.select().from(paperworkDocs).where(eq(paperworkDocs.id, Number((await params).docId)));
  if (!doc) notFound();
  const [packet] = await db.select().from(paperworkPackets).where(eq(paperworkPackets.id, doc.packetId));
  const [template] = await db.select(templateColumns).from(formTemplates).where(eq(formTemplates.id, doc.templateId));
  const locked = packet.status !== "draft";

  return (
    <>
      <div className="label">
        <Link href="/paperwork">Paperwork</Link> · <Link href={`/paperwork/${packet.id}`}>{`${packet.jobNumber} ${packet.customer}: ${packetTitle(packet)}`}</Link> · {template.name}{" "}
        {template.revision && <span className="muted">({template.revision})</span>}
      </div>
      {template.kind === "worksheet" ? (
        <WorksheetEditor docId={doc.id} title={doc.title} model={template.model as WorkbookModel} initial={doc.values as SheetValues} locked={locked} />
      ) : (
        <DetailEditor docId={doc.id} templateId={template.id} title={doc.title} model={template.model as DetailModel} initial={doc.values as FieldValues} locked={locked} />
      )}
      <p>
        <Link className="btn" href={`/paperwork/${packet.id}`}>
          Done: back to the paperwork
        </Link>
      </p>
    </>
  );
}
