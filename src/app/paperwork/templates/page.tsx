import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { formTemplates } from "@/db/schema";
import { templateColumns } from "@/lib/paperwork";
import { builtinForm, ensureBuiltinTemplates, isNativeKind } from "@/lib/forms/native";
import { allFields } from "@/lib/forms/native/detailSheets";
import type { WorkbookModel } from "@/lib/forms/sheetModel";
import type { PdfFormModel } from "@/lib/forms/pdfForm";
import { archiveTemplate, uploadTemplates } from "../actions";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = await getDb();
  await ensureBuiltinTemplates(db);
  const rows = await db.select(templateColumns).from(formTemplates).orderBy(asc(formTemplates.archived), asc(formTemplates.position), desc(formTemplates.uploadedAt));
  const active = rows.filter((t) => !t.archived);
  const old = rows.filter((t) => t.archived);

  return (
    <>
      <header className="top">
        <div>
          <div className="label">
            <Link href="/paperwork">Paperwork</Link> · Templates
          </div>
          <h1>Form templates</h1>
          <p>
            The closet, pantry, office, wall bed, garage and laundry forms are built into the app and need nothing uploaded; their prices live on{" "}
            <Link href="/paperwork/prices">Prices</Link>. Upload a file here only for a form the app doesn&apos;t have yet.
          </p>
          <p>
            Upload the blank work sheets (.xlsx) and fillable detail sheets (.pdf). Start file names with their number, like &quot;01. Closet Work Sheet.xlsx&quot; and &quot;01a. Closet Detail Sheet.pdf&quot;, so each
            packet lists rooms in that order. Uploading a newer copy replaces the old one for new paperwork. Templates stay in this app&apos;s database only.
          </p>
        </div>
      </header>

      <form className="panel" action={uploadTemplates}>
        <label className="drop">
          <input type="file" name="files" multiple accept=".xlsx,.pdf" required />
        </label>
        <button className="btn primary" type="submit">
          Upload
        </button>
        {sp.added && <p className="msg">Added: {sp.added}</p>}
        {sp.skipped && <p className="msg err">Not added: {sp.skipped}</p>}
      </form>

      <section className="panel">
        <h2>In use ({active.length})</h2>
        <table className="list">
          <thead>
            <tr>
              <th>Order</th>
              <th>Form</th>
              <th>Room</th>
              <th>Type</th>
              <th>Revision</th>
              <th>Contents</th>
              <th>Uploaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {active.map((t) => (
              <tr key={t.id}>
                <td className="mono">{(t.position / 100).toFixed(1)}</td>
                <td>{t.name}</td>
                <td>{t.room}</td>
                <td>{(/worksheet/.test(t.kind) ? "Work sheet" : "Detail sheet") + (isNativeKind(t.kind) ? " (built in)" : "")}</td>
                <td>{t.revision}</td>
                <td className="muted">
                  {isNativeKind(t.kind)
                    ? contents(t.builtinKey)
                    : t.kind === "worksheet"
                    ? `${(t.model as WorkbookModel).sheets.length} tabs, ${(t.model as WorkbookModel).sheets.reduce((n, s) => n + Object.values(s.cells).filter((c) => c.input).length, 0)} fill-in cells`
                    : `${(t.model as PdfFormModel).pages.length} page, ${(t.model as PdfFormModel).fields.length} fields`}
                </td>
                <td>{isNativeKind(t.kind) ? "In the app" : t.uploadedAt.toLocaleDateString("en-US")}</td>
                <td>
                  <form action={archiveTemplate}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="link" type="submit">
                      Retire
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {old.length > 0 && (
        <details className="panel">
          <summary>Retired or replaced ({old.length})</summary>
          <ul>
            {old.map((t) => (
              <li key={t.id}>
                {t.name} {t.revision && `(${t.revision})`}, uploaded {t.uploadedAt.toLocaleDateString("en-US")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function contents(key: string | null): string {
  const f = builtinForm(key);
  if (!f) return "";
  if (f.kind === "detail") return `${f.sections.length} sections, ${allFields(f).length} questions`;
  return `${f.layout.sections.length} sections, ${f.layout.sections.reduce((n, s) => n + s.rows.length, 0)} lines`;
}
