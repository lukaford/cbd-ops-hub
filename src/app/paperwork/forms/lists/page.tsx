import Link from "next/link";
import { getDb } from "@/db";
import { loadEditableForms, loadLists } from "@/lib/forms/native/editing";
import { allFields } from "@/lib/forms/native/detailSheets";
import { removeList, saveList } from "../actions";
import ConfirmButton from "../ConfirmButton";

export const dynamic = "force-dynamic";

export default async function ListsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = await getDb();
  const [lists, forms] = await Promise.all([loadLists(db), loadEditableForms(db)]);
  // Which questions use each list.
  const usedBy = new Map<string, string[]>();
  for (const { def } of forms)
    for (const f of allFields(def)) if (f.list && !f.hidden) (usedBy.get(f.list) ?? usedBy.set(f.list, []).get(f.list)!).push(`${def.name.replace(/ Detail Sheet$/, "")}: ${f.label}`);
  const open = lists.find((l) => l.key === sp.list);
  const isNew = sp.list === "new";

  return (
    <>
      <header className="top">
        <div>
          <div className="label">
            <Link href="/paperwork">Paperwork</Link> · <Link href="/paperwork/forms">Forms</Link> · Dropdown lists
          </div>
          <h1>Dropdown lists</h1>
          <p>
            Shared choices used by questions on the detail sheets, such as colors or handles. Change a list here and every question that uses it offers the new choices. Designers can only pick
            from the list.
          </p>
        </div>
        <div className="actions">
          <Link className="btn primary" href="/paperwork/forms/lists?list=new">
            + New list
          </Link>
        </div>
      </header>
      {sp.error && <p className="msg err">{sp.error}</p>}
      {sp.saved && <p className="msg">Saved.</p>}

      {(open || isNew) && (
        <form className="panel stack" action={saveList} id="edit">
          <h2>{open ? open.name : "New list"}</h2>
          <input type="hidden" name="key" value={open?.key ?? ""} />
          <label>
            <span className="nf-label">Name</span>
            <input name="name" defaultValue={open?.name ?? ""} required maxLength={80} />
          </label>
          <label>
            <span className="nf-label">Choices, one per line, in the order designers see them</span>
            <textarea name="options" rows={Math.min(24, Math.max(6, (open?.options.length ?? 0) + 2))} defaultValue={open?.options.join("\n") ?? ""} required />
          </label>
          {open && (
            <p className="muted">
              Used by {usedBy.get(open.key)?.length ?? 0} questions{usedBy.get(open.key)?.length ? `: ${usedBy.get(open.key)!.join("; ")}` : "."}
            </p>
          )}
          <div className="controls">
            <button className="btn primary" type="submit">
              Save list
            </button>
            <Link className="btn" href="/paperwork/forms/lists">
              Cancel
            </Link>
          </div>
        </form>
      )}
      {open && (open.changed || !open.builtin) && (
        <form action={removeList} className="controls">
          <input type="hidden" name="key" value={open.key} />
          <ConfirmButton message={open.builtin ? "Put this list back as built into the app?" : "Delete this list?"}>
            {open.builtin ? "Put this list back as built into the app" : "Delete this list"}
          </ConfirmButton>
        </form>
      )}

      <section className="panel">
        <table className="list">
          <thead>
            <tr>
              <th>List</th>
              <th>Choices</th>
              <th>Used by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lists.map((l) => (
              <tr key={l.key}>
                <td>
                  {l.name} {!l.builtin ? <span className="pill plain">Added</span> : l.changed ? <span className="pill warn">Edited</span> : null}
                </td>
                <td className="muted">
                  {l.options.length}: {l.options.slice(0, 4).join(", ")}
                  {l.options.length > 4 ? ", …" : ""}
                </td>
                <td>{usedBy.get(l.key)?.length ?? 0} questions</td>
                <td>
                  <Link href={`/paperwork/forms/lists?list=${encodeURIComponent(l.key)}#edit`}>Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
