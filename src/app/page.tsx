import Link from "next/link";
import { getDb } from "@/db";
import { todayIn } from "@/lib/board";
import { isJobAtRisk, loadJobBoard, type BoardJob } from "@/lib/jobBoard";
import { SORTS, sortJobs, type SortKey } from "@/lib/jobFilters";
import { MATERIALS, materialLabel, STAGES, stageInfo } from "@/lib/jobtread/fields";
import { jobTreadConfigured, refreshFromJobTread } from "@/lib/jobtread/refresh";
import { RISK_WINDOW_DAYS, type Risk } from "@/lib/manager/progress";
import { STEPS } from "@/lib/manager/steps";
import { refreshNow } from "./actions";
import { AutoRefresh } from "./AutoRefresh";

export const dynamic = "force-dynamic";

const TIME_ZONE = process.env.SHOP_TIME_ZONE ?? "America/New_York";
const WINDOWS = [7, 14, 30] as const;
const NO_STAGE = "none";
const AUTO_REFRESH_MS = 3 * 60 * 1000;

type Params = { window?: string; stage?: string; q?: string; ready?: string; view?: string; material?: string; sort?: string };

const RISK_CLASS: Record<Risk, string> = {
  "in-production": "ok",
  "past-install": "crit",
  critical: "crit",
  warning: "warn",
  ok: "plain",
  "no-date": "plain",
};

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
}

function md(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

function riskText(j: BoardJob): string {
  if (j.risk === "in-production") return stageInfo(j.stage)?.name ?? "In production";
  const d = j.daysToInstall;
  if (d === null) return "No install date";
  if (d < 0) return `${-d}d past install`;
  if (d === 0) return "Installs today";
  return `${d}d to install`;
}

function since(today: string, at: Date | null): string {
  if (!at) return "";
  const day = todayIn(TIME_ZONE, at);
  const n = Math.round((Date.parse(today) - Date.parse(day)) / 864e5);
  return `since ${md(day)}${n > 0 ? `, ${n}d` : ", today"}`;
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const db = await getDb();
  const today = todayIn(TIME_ZONE);
  const refresh = await refreshFromJobTread(db);
  const board = await loadJobBoard(db, today);

  if (!board.lastSync) {
    return (
      <header className="top">
        <div>
          <div className="label">Closets by Design · Production</div>
          <h1>Install Readiness Board</h1>
          {jobTreadConfigured() ? (
            <p>Couldn&apos;t read from JobTread yet{refresh.error ? `: ${refresh.error}` : "."}</p>
          ) : (
            <p>
              Not connected to JobTread yet. Add a JobTread grant key as <code>JOBTREAD_GRANT_KEY</code> (see the README), or use the{" "}
              <Link href="/folders">folders board</Link> from a Manager paste.
            </p>
          )}
        </div>
      </header>
    );
  }

  const past = params.view === "past";
  const material = MATERIALS.includes(params.material ?? "") ? params.material! : null;
  const windowDays = WINDOWS.find((w) => String(w) === params.window) ?? (params.window === "all" ? null : 14);
  const sort: SortKey = SORTS.find((x) => x.key === params.sort)?.key ?? (past ? "install-desc" : "install");
  const stageFilter = past ? null : (params.stage ?? null);
  const showReady = params.ready === "1";
  const q = (params.q ?? "").trim().toLowerCase();

  const inView = board.jobs.filter((j) => j.past === past);
  const materialCount = new Map<string, number>();
  for (const j of inView) for (const m of j.materials) materialCount.set(m, (materialCount.get(m) ?? 0) + 1);
  const scoped = material ? inView.filter((j) => j.materials.includes(material)) : inView;

  const atRisk = scoped.filter(isJobAtRisk);
  const soonest = atRisk[0];
  const stageKey = (j: BoardJob) => (stageInfo(j.stage) ? j.stage! : NO_STAGE);
  const count = new Map<string, number>();
  const riskCount = new Map<string, number>();
  for (const j of scoped) {
    count.set(stageKey(j), (count.get(stageKey(j)) ?? 0) + 1);
    if (isJobAtRisk(j)) riskCount.set(stageKey(j), (riskCount.get(stageKey(j)) ?? 0) + 1);
  }

  const list = scoped.filter((j) => {
    if (past) return matches(j, q);
    if (stageFilter) return stageKey(j) === stageFilter && matches(j, q);
    if (!showReady && j.risk === "in-production") return false;
    if (windowDays !== null && j.daysToInstall !== null && j.daysToInstall > windowDays) return false;
    return matches(j, q);
  });
  const sorted = sortJobs(list, sort);

  const href = (next: Partial<Params>) => {
    const merged = { ...params, ...next };
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
    return qs.size ? `/?${qs}` : "/";
  };

  const queues = STAGES.map((s) => ({ key: s.name, name: s.name, dept: s.department }));

  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design · Production</div>
          <h1>Install Readiness Board</h1>
          <p>
            Every sold job by its confirmed install date, read from JobTread at{" "}
            {board.lastSync.createdAt.toLocaleString("en-US", { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short" })}. Nothing is changed in JobTread.
          </p>
          {refresh.error && <p className="small" style={{ color: "var(--crit)" }}>Couldn&apos;t refresh from JobTread: {refresh.error}</p>}
        </div>
        <form action={refreshNow}>
          <button className="btn primary" type="submit">Refresh now</button>
        </form>
        <AutoRefresh everyMs={AUTO_REFRESH_MS} />
      </header>

      <nav className="tabs" aria-label="View">
        <Link className="tab" aria-current={!past ? "page" : undefined} href={href({ view: undefined, stage: undefined })}>
          Upcoming <span className="num">{board.jobs.filter((j) => !j.past).length}</span>
        </Link>
        <Link className="tab" aria-current={past ? "page" : undefined} href={href({ view: "past", stage: undefined })}>
          Past <span className="num">{board.jobs.filter((j) => j.past).length}</span>
        </Link>
      </nav>


      {!past && (<>
      <section className={`alert${atRisk.length ? "" : " calm"}`}>
        <div className="big num">{atRisk.length}</div>
        {atRisk.length ? (
          <div>
            <div className="what">jobs install within {RISK_WINDOW_DAYS} days and are not yet in production</div>
            <div className="sub">
              Soonest: job <span className="jobno" style={{ fontSize: "inherit" }}>{soonest.jobNumber}</span> on {shortDate(soonest.installOn)}, in{" "}
              {soonest.stage ?? "no Status 2.0 stage"}.
            </div>
          </div>
        ) : (
          <div>
            <div className="what">Every job installing in the next {RISK_WINDOW_DAYS} days is in production</div>
            <div className="sub">Nothing needs chasing right now.</div>
          </div>
        )}
      </section>

      <section>
        <div className="label" style={{ marginBottom: 8 }}>Jobs in each Status 2.0 stage · click one to filter</div>
        <div className="queues">
          {queues.map((s) => {
            const risk = riskCount.get(s.key);
            return (
              <Link key={s.key} className="queue" aria-pressed={stageFilter === s.key} href={href({ stage: stageFilter === s.key ? undefined : s.key })}>
                <span className="n num">{count.get(s.key) ?? 0}</span>
                <span className="s">{s.name}</span>
                <span className="d">{s.dept}</span>
                <span className="risk">{risk ? `${risk} installing within ${RISK_WINDOW_DAYS} days` : ""}</span>
              </Link>
            );
          })}
        </div>
      </section>
      </>)}

      <form key={JSON.stringify(params)} className="controls" method="get" action="/">
        {stageFilter && <input type="hidden" name="stage" value={stageFilter} />}
        {past && <input type="hidden" name="view" value="past" />}

        <input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Search customer, job #, city" aria-label="Search" />
        <label>
          Material{" "}
          <select name="material" defaultValue={material ?? ""}>
            <option value="">Any</option>
            {MATERIALS.map((m) => (
              <option key={m} value={m}>{materialLabel(m)} ({materialCount.get(m) ?? 0})</option>
            ))}
          </select>
        </label>
        <label>
          Sort{" "}
          <select name="sort" defaultValue={sort}>
            {SORTS.map((x) => (
              <option key={x.key} value={x.key}>{x.label}</option>
            ))}
          </select>
        </label>
        {!past && (<>
        <label>
          Installing within{" "}
          <select name="window" defaultValue={windowDays === null ? "all" : String(windowDays)}>
            {WINDOWS.map((w) => (
              <option key={w} value={w}>{w} days</option>
            ))}
            <option value="all">any time</option>
          </select>
        </label>
        <label>
          <input type="checkbox" name="ready" value="1" defaultChecked={showReady} /> Show jobs already in production
        </label>
        </>)}
        <button className="btn" type="submit">Apply</button>
        <span className="small">
          {list.length} of {scoped.length} {past ? "past" : "upcoming"} jobs shown{stageFilter ? " · stage filter on" : ""}
        </span>
      </form>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Install</th>
              <th>Job #</th>
              <th>Customer</th>
              <th>Status 2.0</th>
              <th>Production</th>
              <th>Materials</th>
              <th>Manager folders</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">No jobs match. Try another tab, widen the install window or clear the search.</td>
              </tr>
            )}
            {sorted.map((j) => (
              <JobRow key={j.jobtreadId} j={j} today={today} />
            ))}
          </tbody>
        </table>
      </div>

      <footer>
        {board.jobs.length} jobs from JobTread: every job whose Status 2.0 is Sold through Complete. Install dates come from the job name (the Confirmed Install Date field if the name has none). Past means installed or marked Complete. The board reloads by itself every few minutes. Today is {shortDate(today)}. Folder
        detail comes from the latest Manager paste when the job is in it.
      </footer>
    </>
  );
}

function matches(j: BoardJob, q: string): boolean {
  if (!q) return true;
  return [j.customer, j.jobNumber, j.name, j.city].join(" ").toLowerCase().includes(q);
}

function JobRow({ j, today }: { j: BoardJob; today: string }) {
  const mismatch = j.manager?.installOn && j.installOn && j.manager.installOn !== j.installOn;
  const prodDone = j.production.filter((p) => p.on);
  return (
    <tr className="folder">
      <td>
        <div className="date">{shortDate(j.installOn)}</div>
        <span className={`pill ${RISK_CLASS[j.risk]}`}>{riskText(j)}</span>
        {j.installFieldOn && j.installOn && j.installFieldOn !== j.installOn && (
          <div className="small" style={{ color: "var(--crit)", fontWeight: 600 }}>Install Date field says {md(j.installFieldOn)}</div>
        )}
      </td>
      <td>
        <span className="jobno">{j.jobNumber}</span>
      </td>
      <td>
        <strong>{j.customer || j.name}</strong>
        <div className="small">{j.city}</div>
      </td>
      <td>
        {j.stage ? (
          <>
            <strong>{j.stage}</strong>
            <div className="small">{[stageInfo(j.stage)?.department, since(today, j.stageSince)].filter(Boolean).join(" · ")}</div>
          </>
        ) : (
          <span className="small">Not set</span>
        )}
      </td>
      <td>
        {prodDone.length ? (
          prodDone.map((p) => (
            <div key={p.label} className="small">
              {p.label} {md(p.on)}
            </div>
          ))
        ) : (
          <span className="small">—</span>
        )}
      </td>
      <td>
        {j.materials.length ? (
          j.materials.map((m) => (
            <div key={m} className="small">{materialLabel(m)}</div>
          ))
        ) : (
          <span className="small">—</span>
        )}
        {j.orderBy && <div className="small">Order by {md(j.orderBy)}</div>}
        {j.materialsOrdered === false && j.materials.length > 0 && <div className="small" style={{ color: "var(--crit)", fontWeight: 600 }}>Not all ordered</div>}
        {j.materialsOrdered && <div className="small">All ordered</div>}
      </td>
      <td>
        {j.manager ? (
          <>
            <Link href={`/folders?q=${encodeURIComponent(j.jobNumber)}&window=all&ready=1`}>
              {j.manager.folders} folder{j.manager.folders === 1 ? "" : "s"}
            </Link>
            <div className="small">
              {j.manager.waitingOnStep ? `Waiting on ${STEPS[j.manager.waitingOnStep].name.toLowerCase()}` : j.manager.folders ? "All received by production" : ""}
            </div>
            {mismatch && (
              <div className="small" style={{ color: "var(--crit)", fontWeight: 600 }}>
                Manager install date is {md(j.manager.installOn)}
              </div>
            )}
          </>
        ) : (
          <span className="small">Not in the last paste</span>
        )}
      </td>
    </tr>
  );
}
