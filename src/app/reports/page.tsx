import { desc } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db";
import { savedReports } from "@/db/schema";
import { freshBoard } from "@/lib/freshBoard";
import { parseJobQuery, queryJobs, SORTS } from "@/lib/jobFilters";
import { COMPLETE, MATERIALS, materialLabel, STAGES } from "@/lib/jobtread/fields";
import { COLUMNS, DEFAULT_COLUMNS, pickColumns } from "@/lib/reportColumns";
import { deleteReport, saveReport } from "./actions";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

function asList(v: string | string[] | undefined): string[] {
  return Array.isArray(v) ? v : v ? [v] : [];
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { board, error } = await freshBoard();
  const saved = await (await getDb()).select().from(savedReports).orderBy(desc(savedReports.createdAt));

  const query = parseJobQuery(params);
  const cols = pickColumns(asList(params.col));
  const jobs = queryJobs(board.jobs, query);

  // The current setup as a query string, for saving and for the CSV link.
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (k !== "saved") for (const x of asList(v)) if (x) qs.append(k, x);
  const current = qs.toString();
  const allStages = [...STAGES.map((s) => s.name), COMPLETE];

  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design · Reports</div>
          <h1>Report builder</h1>
          <p>Pick the jobs, materials and columns you want, then print it, download it for Excel, or save it to run again.</p>
          {error && <p className="small" style={{ color: "var(--crit)" }}>Couldn&apos;t refresh from JobTread: {error}</p>}
        </div>
      </header>

      {saved.length > 0 && (
        <section className="noprint">
          <div className="label" style={{ marginBottom: 6 }}>Saved reports</div>
          <div className="tabs">
            {saved.map((r) => (
              <span key={r.id} className="tab" aria-current={String(r.id) === params.saved ? "page" : undefined}>
                <Link href={`/reports?${r.query}${r.query ? "&" : ""}saved=${r.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                  {r.name}
                </Link>
                <form action={deleteReport} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="link" type="submit" title={`Delete ${r.name}`} aria-label={`Delete ${r.name}`}>×</button>
                </form>
              </span>
            ))}
          </div>
        </section>
      )}

      <form key={current} className="builder noprint" method="get" action="/reports">
        <fieldset>
          <legend>Jobs</legend>
          {(["upcoming", "past", "all"] as const).map((w) => (
            <label key={w}>
              <input type="radio" name="when" value={w} defaultChecked={query.when === w} /> {w === "all" ? "All" : w === "past" ? "Past" : "Upcoming"}
            </label>
          ))}
          <label>
            Install from <input type="date" name="from" defaultValue={query.from ?? ""} />
          </label>
          <label>
            to <input type="date" name="to" defaultValue={query.to ?? ""} />
          </label>
          <label>
            Search <input type="search" name="q" defaultValue={query.q} placeholder="Customer, job #, city" />
          </label>
        </fieldset>
        <fieldset>
          <legend>Materials (any of)</legend>
          {MATERIALS.map((m) => (
            <label key={m}>
              <input type="checkbox" name="material" value={m} defaultChecked={query.materials.includes(m)} /> {materialLabel(m)}
            </label>
          ))}
          <label>
            All ordered{" "}
            <select name="ordered" defaultValue={query.ordered}>
              <option value="any">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Status 2.0</legend>
          {allStages.map((s) => (
            <label key={s}>
              <input type="checkbox" name="stage" value={s} defaultChecked={query.stages.includes(s)} /> {s}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Columns</legend>
          {COLUMNS.map((c) => (
            <label key={c.key}>
              <input type="checkbox" name="col" value={c.key} defaultChecked={cols.some((x) => x.key === c.key)} /> {c.label}
            </label>
          ))}
        </fieldset>
        <div className="row">
          <label>
            Sort{" "}
            <select name="sort" defaultValue={query.sort}>
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </label>
          <button className="btn primary" type="submit">Run report</button>
          <Link className="btn" href="/reports">Clear</Link>
        </div>
      </form>

      <div className="controls noprint">
        <span className="small">{jobs.length} jobs</span>
        <PrintButton />
        <a className="btn" href={`/reports/csv?${current}`}>Download for Excel</a>
        <form action={saveReport} className="controls" style={{ margin: 0 }}>
          <input type="hidden" name="query" value={current} />
          <input type="text" name="name" placeholder="Name this report" aria-label="Report name" required />
          <button className="btn" type="submit">Save report</button>
        </form>
      </div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="empty">No jobs match these filters.</td>
              </tr>
            )}
            {jobs.map((j) => (
              <tr key={j.jobtreadId}>
                {cols.map((c) => (
                  <td key={c.key}>{c.key === "job" ? <span className="jobno">{c.value(j)}</span> : c.value(j) || "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small noprint">Default columns: {DEFAULT_COLUMNS.map((k) => COLUMNS.find((c) => c.key === k)!.label).join(", ")}.</p>
    </>
  );
}
