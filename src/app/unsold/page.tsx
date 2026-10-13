import Link from "next/link";
import { AutoRefresh } from "@/app/AutoRefresh";
import { PrintButton } from "@/app/reports/PrintButton";
import { todayIn } from "@/lib/board";
import { freshBoard, TIME_ZONE } from "@/lib/freshBoard";
import { LEAD_VIEWS as VIEWS, viewOf, type LeadView as View } from "@/lib/leads";
import { daysBetween } from "@/lib/manager/progress";

export const dynamic = "force-dynamic";

type Params = { view?: string; q?: string; from?: string; to?: string };


function md(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;


export default async function UnsoldPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { today, board, error } = await freshBoard();
  const view: View = VIEWS.find((v) => v.key === params.view)?.key ?? "unsold";
  const q = (params.q ?? "").trim().toLowerCase();
  const from = ISO.test(params.from ?? "") ? params.from! : null;
  const to = ISO.test(params.to ?? "") ? params.to! : null;

  const counts = new Map<View, number>();
  for (const l of board.leads) {
    const v = viewOf(l, today);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  const list = board.leads
    .filter((l) => viewOf(l, today) === view)
    .filter((l) => !q || [l.customer, l.jobNumber, l.name, l.city].join(" ").toLowerCase().includes(q))
    .filter((l) => (!from || (l.apptOn !== null && l.apptOn >= from)) && (!to || (l.apptOn !== null && l.apptOn <= to)))
    .sort((a, b) => (view === "upcoming" ? 1 : -1) * (a.apptOn ?? "").localeCompare(b.apptOn ?? ""));

  const href = (next: Partial<Params>) => {
    const qs = new URLSearchParams(Object.entries({ ...params, ...next }).filter(([, v]) => v) as [string, string][]);
    return qs.size ? `/unsold?${qs}` : "/unsold";
  };
  const current = VIEWS.find((v) => v.key === view)!;

  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design · Sales</div>
          <h1>Unsold jobs tracker</h1>
          <p>Every lead and unsold job in JobTread by its appointment date (the date in the job name). Nothing is changed in JobTread.</p>
          {error && <p className="small" style={{ color: "var(--crit)" }}>Couldn&apos;t refresh from JobTread: {error}</p>}
        </div>
        <div className="noprint">
          <PrintButton />
        </div>
        <AutoRefresh everyMs={3 * 60 * 1000} />
      </header>

      <nav className="tabs noprint" aria-label="View">
        {VIEWS.map((v) => (
          <Link key={v.key} className="tab" aria-current={view === v.key ? "page" : undefined} href={href({ view: v.key })}>
            {v.label} <span className="num">{counts.get(v.key) ?? 0}</span>
          </Link>
        ))}
      </nav>
      <p className="small">{current.note}</p>

      <form key={JSON.stringify(params)} className="controls noprint" method="get" action="/unsold">
        <input type="hidden" name="view" value={view} />
        <input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Search customer, job #, city" aria-label="Search" />
        <label>
          Appointment from <input type="date" name="from" defaultValue={from ?? ""} />
        </label>
        <label>
          to <input type="date" name="to" defaultValue={to ?? ""} />
        </label>
        <button className="btn" type="submit">Apply</button>
        <span className="small">{list.length} shown</span>
      </form>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Appointment</th>
              <th>Job #</th>
              <th>Customer</th>
              <th>City</th>
              <th>{view === "unsold" ? "Marked unsold" : "Lead created"}</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">Nothing here.</td>
              </tr>
            )}
            {list.map((l) => {
              const d = l.apptOn ? daysBetween(today, l.apptOn) : null;
              const marked = view === "unsold" ? l.stageSince : l.createdAt;
              return (
                <tr key={l.jobtreadId}>
                  <td>
                    <div className="date">{md(l.apptOn)}</div>
                    {d !== null && <span className={`pill ${view === "result" ? "warn" : "plain"}`}>{d === 0 ? "Today" : d > 0 ? `in ${d}d` : `${-d}d ago`}</span>}
                  </td>
                  <td><span className="jobno">{l.jobNumber}</span></td>
                  <td>
                    <strong>{l.customer || l.name}</strong>
                    {!l.apptOn && <div className="small">No date in the job name</div>}
                  </td>
                  <td>{l.city}</td>
                  <td className="small">{marked ? md(todayIn(TIME_ZONE, marked)) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
