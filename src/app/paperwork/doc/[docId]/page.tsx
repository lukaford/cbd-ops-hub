import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { formTemplates, paperworkDocs, paperworkPackets } from "@/db/schema";
import { attachNative, templateColumns } from "@/lib/paperwork";
import { inScope, visibleJobs } from "@/lib/auth/current";
import { cellRightOf } from "@/lib/forms/review";
import type { Answers, DetailFormDef } from "@/lib/forms/native/types";
import type { WorksheetFormDef } from "@/lib/forms/native";
import NativeDetailEditor from "./NativeDetailEditor";
import NativeWorksheetEditor from "./NativeWorksheetEditor";
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
  if (!packet || !inScope(await visibleJobs(), packet.jobNumber)) notFound();
  const [template] = await db.select(templateColumns).from(formTemplates).where(eq(formTemplates.id, doc.templateId));
  const locked = packet.status !== "draft";
  const [loaded] = await attachNative(db, [{ ...doc, template }]);
  const native = loaded.native;

  // The work sheet's headline numbers, shown above the form as it is filled in.
  const totals: { label: string; ref: { sheet: string; addr: string } }[] = [];
  if (native && "model" in native) {
    const pres = native.model.sheets.find((s) => /presentation/i.test(s.name));
    const coll = native.def.layout.sections.find((s) => s.sheet === pres?.name && /collection/i.test(s.title));
    for (const r of coll?.rows ?? []) {
      const sale = r.cells.find((c) => c.kind === "out" && /sale/i.test(c.col ?? "")) ?? r.cells.find((c) => c.kind === "out");
      if (sale) totals.push({ label: `${r.label} sale`, ref: sale });
    }
    const sale = pres && cellRightOf(pres, /^sale price:?$/i, "formula");
    if (pres && sale) totals.push({ label: "Total sale price", ref: { sheet: pres.name, addr: sale } });
  }

  return (
    <>
      <div className="label">
        <Link href="/paperwork">Paperwork</Link> · <Link href={`/paperwork/${packet.id}`}>{`${packet.jobNumber} ${packet.customer}: ${packetTitle(packet)}`}</Link> · {template.name}{" "}
        {template.revision && <span className="muted">({template.revision})</span>}
      </div>
      {native && "model" in native ? (
        <NativeWorksheetEditor
          docId={doc.id}
          title={doc.title}
          name={template.name}
          revision={template.revision}
          layout={(native.def as WorksheetFormDef).layout}
          model={native.model}
          initial={doc.values as SheetValues}
          locked={locked}
          pricesMissing={!Object.keys(native.prices).length}
          totals={totals}
        />
      ) : native ? (
        <NativeDetailEditor docId={doc.id} title={doc.title} def={native.def as DetailFormDef} initial={doc.values as Answers} locked={locked} />
      ) : template.kind === "worksheet" ? (
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
