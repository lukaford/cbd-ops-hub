import Link from "next/link";
import { getDb } from "@/db";
import { loadPrices, priceStatus, WORKSHEETS, type WorksheetFormDef } from "@/lib/forms/native";
import { priceKeys } from "@/lib/forms/native/worksheetBuild";
import { setPrice, uploadPrices } from "../actions";

export const dynamic = "force-dynamic";

// Where each price sits on the form, in words, for the price table.
function priceLabels(def: WorksheetFormDef): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of def.layout.sections)
    for (const r of s.rows)
      for (const c of r.cells)
        if (c.kind === "price") out.set(`${c.sheet}!${c.addr}`, [s.title, r.label, c.col].filter(Boolean).join(" / "));
  return out;
}

export default async function PricesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = await getDb();
  const prices = await loadPrices(db);
  const open = WORKSHEETS.find((w) => w.key === sp.form);

  return (
    <>
      <header className="top">
        <div>
          <div className="label">
            <Link href="/paperwork">Paperwork</Link> · Prices
          </div>
          <h1>Work sheet prices</h1>
          <p>
            The built-in work sheets calculate with these prices. They are kept in this app&apos;s database, not in the app&apos;s code. To load or update them, upload the company work sheet files
            (.xlsx): each price is read from the same cell. A prices file (.json) saved from the app works too.
          </p>
        </div>
      </header>

      <form className="panel" action={uploadPrices}>
        <label className="drop">
          <input type="file" name="files" multiple accept=".xlsx,.json" required />
        </label>
        <button className="btn primary" type="submit">
          Load prices
        </button>
        {sp.loaded && <p className="msg">Loaded: {sp.loaded}</p>}
        {sp.skipped && <p className="msg err">Not loaded: {sp.skipped}</p>}
      </form>

      <section className="panel">
        <table className="list">
          <thead>
            <tr>
              <th>Work sheet</th>
              <th>Revision</th>
              <th>Prices loaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {WORKSHEETS.map((w) => {
              const st = priceStatus(w, prices[w.key]);
              return (
                <tr key={w.key}>
                  <td>{w.name}</td>
                  <td>{w.revision}</td>
                  <td>
                    <span className={`pill ${st.loaded === st.needed ? "ok" : st.loaded ? "warn" : "crit"}`}>
                      {st.loaded} of {st.needed}
                    </span>
                  </td>
                  <td>
                    <Link href={`/paperwork/prices?form=${w.key}`}>See and edit</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {open && (
        <section className="panel">
          <h2>{open.name}</h2>
          <p className="muted">Change a price and press Enter. Paperwork already submitted keeps the prices it was signed with.</p>
          <table className="list">
            <thead>
              <tr>
                <th>Item</th>
                <th>Cell</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const labels = priceLabels(open);
                const p = prices[open.key] ?? {};
                return priceKeys(open.model).map((k) => (
                  <tr key={k} id={k}>
                    <td>{labels.get(k) ?? <span className="muted">Used in a calculation</span>}</td>
                    <td className="mono muted">{k}</td>
                    <td>
                      {typeof p[k] === "string" ? (
                        <span>{p[k]}</span>
                      ) : (
                        <form action={setPrice} className="inline">
                          <input type="hidden" name="form" value={open.key} />
                          <input type="hidden" name="cell" value={k} />
                          <input name="value" inputMode="decimal" defaultValue={p[k] === undefined ? "" : String(p[k])} aria-label={`Price for ${labels.get(k) ?? k}`} size={8} />
                        </form>
                      )}
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
