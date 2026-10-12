import Link from "next/link";
import { getDb } from "@/db";
import { isAtRisk, loadBoard, todayIn, type BoardFolder } from "@/lib/board";
import { RISK_WINDOW_DAYS, type Risk } from "@/lib/manager/progress";
import { PRODUCTION_STEPS, STEPS } from "@/lib/manager/steps";

export const dynamic = "force-dynamic";

const TIME_ZONE = process.env.SHOP_TIME_ZONE ?? "America/New_York";
const WINDOWS = [7, 14, 30] as const;

type Params = { window?: string; step?: string; q?: string; ready?: string; open?: string };

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

function money(cents: number | null): string {
  return cents === null ? "—" : `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function riskText(f: BoardFolder): string {
  if (f.nextStep === null) return "In production";
  const d = f.daysToInstall;
  if (d === null) return "No install date";
  if (d < 0) return `${-d}d past install`;
  if (d === 0) return "Installs today";
  return `${d}d to install`;
}

function ago(today: string, iso: string): string {
  const n = Math.round((Date.parse(today) - Date.parse(iso)) / 864e5);
  return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
}

export default async function BoardPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const db = await getDb();
  const today = todayIn(TIME_ZONE);
  const board = await loadBoard(db, today);

  if (!board.lastImport) {
    return (
      <>
        <header className="top">
          <div>
            <div className="label">Closets by Design · Production</div>
            <h1>Install Readiness Board</h1>
            <p>No Special Orders table has been pasted yet.</p>
          </div>
          <Link className="btn primary" href="/import">Paste Special Orders</Link>
        </header>
      </>
    );
  }

  const windowDays = WINDOWS.find((w) => String(w) === params.window) ?? (params.window === "all" ? null : 14);
  const stepFilter = params.step ?? null;
  const showReady = params.ready === "1";
  const q = (params.q ?? "").trim().toLowerCase();

  const atRisk = board.folders.filter(isAtRisk);
  const atRiskJobs = new Set(atRisk.map((f) => f.jobNumber)).size;
  const soonest = atRisk[0];

  const queueKey = (f: BoardFolder) => (f.nextStep === null ? "done" : String(f.nextStep));
  const queueCount = new Map<string, number>();
  const queueRisk = new Map<string, number>();
  for (const f of board.folders) {
    queueCount.set(queueKey(f), (queueCount.get(queueKey(f)) ?? 0) + 1);
    if (isAtRisk(f)) queueRisk.set(queueKey(f), (queueRisk.get(queueKey(f)) ?? 0) + 1);
  }

  const list = board.folders.filter((f) => {
    if (stepFilter) return queueKey(f) === stepFilter && matches(f, q);
    if (!showReady && f.nextStep === null) return false;
    if (windowDays !== null && f.daysToInstall !== null && f.daysToInstall > windowDays) return false;
    return matches(f, q);
  });

  const href = (next: Partial<Params>) => {
    const merged = { ...params, ...next };
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
    return qs.size ? `/?${qs}` : "/";
  };

  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design · Production</div>
          <h1>Install Readiness Board</h1>
          <p>
            Every production folder by its firm install date, from the Special Orders paste of{" "}
            {board.lastImport.createdAt.toLocaleString("en-US", { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short" })}.
          </p>
        </div>
        <Link className="btn primary" href="/import">Paste a newer table</Link>
      </header>

      <section className={`alert${atRisk.length ? "" : " calm"}`}>
        <div className="big num">{atRisk.length}</div>
        {atRisk.length ? (
          <div>
            <div className="what">folders install within {RISK_WINDOW_DAYS} days and are not yet received by production</div>
            <div className="sub">
              {atRiskJobs} jobs. Soonest: job <span className="mono">{soonest.jobNumber}</span> on {shortDate(soonest.installOn)}, waiting on{" "}
              {STEPS[soonest.nextStep!].name.toLowerCase()}.
            </div>
          </div>
        ) : (
          <div>
            <div className="what">Every folder installing in the next {RISK_WINDOW_DAYS} days is in production</div>
            <div className="sub">Nothing needs chasing right now.</div>
          </div>
        )}
      </section>

      <section>
        <div className="label" style={{ marginBottom: 8 }}>Folders waiting on each step · click one to filter</div>
        <div className="queues">
          {[...PRODUCTION_STEPS.map(String), "done"].map((k) => {
            const name = k === "done" ? "All 9 steps done" : `${k}. ${STEPS[Number(k)].name}`;
            const dept = k === "done" ? "In production" : STEPS[Number(k)].department;
            const risk = queueRisk.get(k);
            return (
              <Link key={k} className="queue" aria-pressed={stepFilter === k} href={href({ step: stepFilter === k ? undefined : k, open: undefined })}>
                <span className="n num">{queueCount.get(k) ?? 0}</span>
                <span className="s">{name}</span>
                <span className="d">{dept}</span>
                <span className="risk">{risk ? `${risk} installing within ${RISK_WINDOW_DAYS} days` : ""}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <form className="controls" method="get" action="/">
        {stepFilter && <input type="hidden" name="step" value={stepFilter} />}
        <input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Search customer, job #, designer, installer" aria-label="Search" />
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
          <input type="checkbox" name="ready" value="1" defaultChecked={showReady} /> Show folders already received by production
        </label>
        <button className="btn" type="submit">Apply</button>
        <span className="small">
          {list.length} of {board.folders.length} folders shown{stepFilter ? " · step filter on" : ""}
        </span>
      </form>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Install</th>
              <th>Job</th>
              <th>Folder</th>
              <th>Steps 1 to 9</th>
              <th>Waiting on</th>
              <th>Last step</th>
              <th>Designer · Installer</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">No folders match. Widen the install window or clear the search.</td>
              </tr>
            )}
            {list.map((f) => {
              const open = params.open === String(f.id);
              return (
                <FolderRows key={f.id} f={f} open={open} today={today} toggle={href({ open: open ? undefined : String(f.id) })} />
              );
            })}
          </tbody>
        </table>
      </div>

      <footer>
        {board.lastImport.rowCount} rows, {board.lastImport.jobCount} jobs, {board.lastImport.folderCount} folders in the latest paste. Today is{" "}
        {shortDate(today)}. A folder&apos;s progress is its furthest step with a received date in Manager; job color counts once a color is entered.
      </footer>
    </>
  );
}

function matches(f: BoardFolder, q: string): boolean {
  if (!q) return true;
  return [f.customer, f.jobNumber, f.designer, f.installer, f.description, f.room].join(" ").toLowerCase().includes(q);
}

function FolderRows({ f, open, today, toggle }: { f: BoardFolder; open: boolean; today: string; toggle: string }) {
  const byStep = new Map(f.steps.map((s) => [s.step, s]));
  const passed = (s: number) => f.nextStep === null || s < f.nextStep;
  return (
    <>
      <tr className="folder">
        <td>
          <div className="date">{shortDate(f.installOn)}</div>
          <span className={`pill ${RISK_CLASS[f.risk]}`}>{riskText(f)}</span>
        </td>
        <td>
          <Link className="cust" href={toggle} scroll={false} aria-expanded={open}>{f.customer}</Link>
          <div className="small">
            <span className="mono">{f.jobNumber}</span> · {f.description}
          </div>
        </td>
        <td>
          {f.letter ? `Folder ${f.letter}` : "Folder"}
          <div className="small">{[f.room, f.color].filter(Boolean).join(" · ")}</div>
        </td>
        <td>
          <div className="track">
            {PRODUCTION_STEPS.map((s) => {
              const row = byStep.get(s);
              const dated = Boolean(row?.doneOn);
              const cls = dated ? "done" : passed(s) ? "done implied" : s === f.nextStep ? "next" : "";
              const title = `${s} ${STEPS[s].name}${dated ? `, done ${md(row!.doneOn)} by ${row!.ref || "?"}` : passed(s) ? ", passed (no date in Manager)" : ", not done"}`;
              return <span key={s} className={cls} title={title}>{s}</span>;
            })}
          </div>
        </td>
        <td>
          {f.nextStep === null ? (
            <span className="pill ok">Received by production</span>
          ) : (
            <>
              <strong>{STEPS[f.nextStep].name}</strong>
              <div className="small">{STEPS[f.nextStep].department}</div>
            </>
          )}
        </td>
        <td>
          {f.lastStep && f.lastDoneOn ? (
            <>
              {STEPS[f.lastStep]?.name ?? `Step ${f.lastStep}`}
              <div className="small">{f.lastRef || "?"} · {ago(today, f.lastDoneOn)}</div>
            </>
          ) : (
            <span className="small">Nothing done yet</span>
          )}
        </td>
        <td>
          {f.designer}
          <div className="small">{f.installer}</div>
        </td>
      </tr>
      {open && (
        <tr className="detail">
          <td colSpan={7}>
            <div className="small" style={{ marginBottom: 8 }}>
              Contract {md(f.contractOn)} · Production due {md(f.dueOn)} · Install {md(f.installOn)} · Job {money(f.amountCents)}, balance{" "}
              {money(f.balanceCents)}
              {f.city ? ` · ${f.city}` : ""}
            </div>
            <ul className="steps">
              {[10, ...PRODUCTION_STEPS].map((s) => {
                const row = byStep.get(s);
                const extra = row && (s === 9 || s === 10) && row.detail ? ` · ${row.detail}` : "";
                return (
                  <li key={s}>
                    <span className="st">{s}</span>
                    <span>
                      {STEPS[s].name}:{" "}
                      {row?.doneOn ? `${md(row.doneOn)} · ${row.ref || "?"}` : <span className="no">{s <= 9 && passed(s) ? "passed, no date" : "not done"}</span>}
                      {extra}
                    </span>
                  </li>
                );
              })}
            </ul>
            {f.specialOrders.length > 0 && (
              <div className="so">
                <div className="label">Special orders on this job</div>
                {f.specialOrders.map((o, i) => (
                  <div key={i}>
                    {o.item} · {o.vendor}
                    {o.detail ? ` · ${o.detail}` : ""} ·{" "}
                    {o.receivedOn ? `received ${md(o.receivedOn)}` : o.eta ? `ETA ${md(o.eta)}` : <strong>not received, no ETA</strong>}
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
