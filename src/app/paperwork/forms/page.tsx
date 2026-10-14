import Link from "next/link";
import { getDb } from "@/db";
import { loadEditableForms, loadLists } from "@/lib/forms/native/editing";
import { allFields } from "@/lib/forms/native/detailSheets";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const db = await getDb();
  const [forms, lists] = await Promise.all([loadEditableForms(db), loadLists(db)]);

  return (
    <>
      <header className="top">
        <div>
          <div className="label">
            <Link href="/paperwork">Paperwork</Link> · Forms
          </div>
          <h1>Sales forms</h1>
          <p>
            Change what designers are asked on each detail sheet: reword or reorder questions, add new ones, turn some off, mark them required, and turn typed answers into dropdowns so designers
            can only pick from your choices. Changes apply to new and unfinished paperwork. Submitted paperwork keeps the form it was filled on.
          </p>
        </div>
        <div className="actions">
          <Link className="btn" href="/paperwork/forms/lists">
            Dropdown lists ({lists.length})
          </Link>
        </div>
      </header>

      <section className="panel">
        <h2>Detail sheets</h2>
        <table className="list">
          <thead>
            <tr>
              <th>Form</th>
              <th>Questions</th>
              <th>Dropdowns</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {forms.map(({ def, changed, updatedAt }) => {
              const fields = allFields(def).filter((f) => !f.hidden);
              return (
                <tr key={def.key}>
                  <td>{def.name}</td>
                  <td>{fields.length}</td>
                  <td>{fields.filter((f) => f.type === "select" || f.type === "choice" || f.type === "checks").length}</td>
                  <td>{changed ? <span className="pill warn">Edited {updatedAt?.toLocaleDateString("en-US")}</span> : <span className="pill plain">As built in</span>}</td>
                  <td>
                    <Link className="btn" href={`/paperwork/forms/${def.key}`}>
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted">
          The work sheets follow the company Excel files line for line, so their lines and formulas are not edited here. Their prices are on <Link href="/paperwork/prices">Prices</Link>.
        </p>
      </section>
    </>
  );
}
