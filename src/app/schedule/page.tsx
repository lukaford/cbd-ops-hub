import Link from "next/link";
import { AutoRefresh } from "@/app/AutoRefresh";
import { freshBoard } from "@/lib/freshBoard";
import type { BoardJob } from "@/lib/jobBoard";
import { parseJobQuery, queryJobs, queryParams } from "@/lib/jobFilters";
import { MATERIALS, materialLabel, STAGES, COMPLETE, stageInfo } from "@/lib/jobtread/fields";
import { PrintButton } from "@/app/reports/PrintButton";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthStart(m: string | undefined, today: string): string {
  return /^\d{4}-\d{2}$/.test(m ?? "") ? `${m}-01` : `${today.slice(0, 7)}-01`;
}

function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
}

function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { today, board, error, refreshing } = await freshBoard();
  const mode = params.mode === "list" ? "list" : "calendar";
  const start = monthStart(typeof params.month === "string" ? params.month : undefined, today);
  const end = addDays(addMonths(start, 1), -1);
  const query = parseJobQuery(params, { when: "all", from: start, to: end, sort: "install" });
  const jobs = queryJobs(board.jobs, { ...query, from: start, to: end });
  const byDay = Map.groupBy(jobs, (j) => j.installOn!);

  const monthLabel = new Date(`${start}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
  const keep = queryParams({ materials: query.materials, stages: query.stages, q: query.q });
  const link = (over: Record<string, string>) => {
    const p = new URLSearchParams(keep);
    p.set("month", start.slice(0, 7));
    p.set("mode", mode);
    for (const [k, v] of Object.entries(over)) p.set(k, v);
    return `/schedule?${p}`;
  };

  // Calendar grid: whole weeks from the Sunday on or before the 1st.
  const firstDow = new Date(`${start}T12:00:00Z`).getUTCDay();
  const gridStart = addDays(start, -firstDow);
  const days: string[] = [];
  for (let d = gridStart; d <= end || days.length % 7; d = addDays(d, 1)) days.push(d);

  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design · Installation</div>
          <h1>Install schedule</h1>
          <p>
            {jobs.length} installs in {monthLabel}, from the install date in each sold job&apos;s JobTread name.
          </p>
          {error && <p className="small" style={{ color: "var(--crit)" }}>Couldn&apos;t refresh from JobTread: {error}</p>}
        </div>
        <div className="noprint" style={{ display: "flex", gap: 8 }}>
          <PrintButton />
        </div>
        <AutoRefresh everyMs={3 * 60 * 1000} refreshing={refreshing} />
      </header>

      <div className="controls noprint">
        <Link className="btn" href={link({ month: addMonths(start, -1).slice(0, 7) })}>‹ Previous</Link>
        <strong style={{ minWidth: 140, textAlign: "center" }}>{monthLabel}</strong>
        <Link className="btn" href={link({ month: addMonths(start, 1).slice(0, 7) })}>Next ›</Link>
        <Link className="btn" href={link({ month: today.slice(0, 7) })}>This month</Link>
        <nav className="tabs" aria-label="Layout">
          <Link className="tab" aria-current={mode === "calendar" ? "page" : undefined} href={link({ mode: "calendar" })}>Calendar</Link>
          <Link className="tab" aria-current={mode === "list" ? "page" : undefined} href={link({ mode: "list" })}>List</Link>
        </nav>
      </div>

      <form key={JSON.stringify(params)} className="controls noprint" method="get" action="/schedule">
        <input type="hidden" name="month" value={start.slice(0, 7)} />
        <input type="hidden" name="mode" value={mode} />
        <input type="search" name="q" defaultValue={query.q} placeholder="Search customer, job #, city" aria-label="Search" />
        <label>
          Material{" "}
          <select name="material" defaultValue={query.materials[0] ?? ""}>
            <option value="">Any</option>
            {MATERIALS.map((m) => (
              <option key={m} value={m}>{materialLabel(m)}</option>
            ))}
          </select>
        </label>
        <label>
          Stage{" "}
          <select name="stage" defaultValue={query.stages[0] ?? ""}>
            <option value="">Any</option>
            {[...STAGES.map((s) => s.name), COMPLETE].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">Apply</button>
      </form>

      {mode === "calendar" ? (
        <div className="cal">
          {WEEKDAYS.map((d) => (
            <div key={d} className="cal-head">{d}</div>
          ))}
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const out = d < start || d > end;
            return (
              <div key={d} className={`cal-day${out ? " out" : ""}${d === today ? " today" : ""}`}>
                <div className="cal-num">{Number(d.slice(8))}</div>
                {list.map((j) => (
                  <JobChip key={j.jobtreadId} j={j} />
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Install</th>
                <th>Job #</th>
                <th>Customer</th>
                <th>Status 2.0</th>
                <th>Materials</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">No installs this month match.</td>
                </tr>
              )}
              {[...byDay.entries()].map(([day, list]) =>
                list.map((j, i) => (
                  <tr key={j.jobtreadId} className={i === 0 ? "daystart" : undefined}>
                    <td>{i === 0 ? <strong>{longDate(day)}</strong> : null}</td>
                    <td><span className="jobno">{j.jobNumber}</span></td>
                    <td>
                      <strong>{j.customer || j.name}</strong>
                      <div className="small">{j.city}</div>
                    </td>
                    <td>{j.stage}</td>
                    <td className="small">{j.materials.map(materialLabel).join(", ") || "—"}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function JobChip({ j }: { j: BoardJob }) {
  const cls = j.stage === COMPLETE ? "done" : stageInfo(j.stage)?.inProduction ? "ok" : j.risk === "critical" || j.risk === "warning" ? "crit" : "plain";
  const title = [j.name, j.stage, j.materials.map(materialLabel).join(", ")].filter(Boolean).join(" · ");
  return (
    <div className={`chip ${cls}`} title={title}>
      <span className="jobno">{j.jobNumber}</span> {j.customer.split(",")[0]}
      {j.materials.length > 0 && <span className="mat">{j.materials.length}</span>}
    </div>
  );
}
