import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { paperworkPackets } from "@/db/schema";
import { activeTemplates, findJobs } from "@/lib/paperwork";
import { keepJobTreadFresh } from "@/lib/jobtread/refresh";
import { PACKET_LABELS, packetTitle } from "@/lib/forms/naming";
import { currentStaff, inScope, visibleJobs } from "@/lib/auth/current";
import { can } from "@/lib/auth/permissions";
import { loadPrices, WORKSHEETS } from "@/lib/forms/native";
import { startPacket } from "./actions";

export const dynamic = "force-dynamic";

export default async function PaperworkPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const db = await getDb();
  // Searching uses the local copy of JobTread; keep it current in the background (read only).
  const sync = q ? await keepJobTreadFresh(db) : undefined;
  const scope = await visibleJobs();
  const [allPackets, templates, jobs] = await Promise.all([
    db.select().from(paperworkPackets).orderBy(desc(paperworkPackets.createdAt)).limit(scope ? 2000 : 200),
    activeTemplates(db),
    q ? findJobs(db, q) : Promise.resolve([]),
  ]);
  const staff = await currentStaff();
  const managesPrices = !staff || can(staff.access, "pricebook.manage");
  const managesForms = !staff || can(staff.access, "forms.manage");
  const prices = await loadPrices(db);
  const unpriced = WORKSHEETS.filter((w) => !prices[w.key]);
  const packets = allPackets.filter((p) => inScope(scope, p.jobNumber)).slice(0, 200);
  const latest = new Map<string, number>();
  for (const p of packets) if (p.status === "submitted") latest.set(p.jobNumber, Math.max(latest.get(p.jobNumber) ?? 0, p.version));

  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design · Sales</div>
          <h1>Paperwork</h1>
          <p>
            Fill each room&apos;s work sheet and detail sheet as in-app forms, attach grids, collect signatures, and download one PDF per submission. Every answer is saved to the job. Nothing is sent to
            JobTread.
          </p>
        </div>
        {(managesPrices || managesForms) && (
          <div className="actions">
            {managesForms && (
              <Link className="btn" href="/paperwork/forms">
                Edit forms
              </Link>
            )}
            {managesPrices && (
              <>
                <Link className="btn" href="/paperwork/prices">
                  Prices
                </Link>
                <Link className="btn" href="/paperwork/templates">
                  Templates ({templates.length})
                </Link>
              </>
            )}
          </div>
        )}
      </header>

      {unpriced.length > 0 && (
        <div className="banner">
          <p>
            Work sheet prices are not loaded for {unpriced.map((w) => w.room).join(", ")}, so those totals show $0.
            {managesPrices ? " Load them from the company work sheet files." : " Ask an admin to load them."}
          </p>
          {managesPrices && (
            <Link className="btn primary" href="/paperwork/prices">
              Load prices
            </Link>
          )}
        </div>
      )}
      {sp.error && <p className="msg err">{sp.error}</p>}

      <section className="panel">
        <h2>Start paperwork</h2>
        <form className="controls" action="/paperwork">
          <input type="search" name="q" defaultValue={q} placeholder="Find a job: number, customer, city" aria-label="Find a job" />
          <button className="btn" type="submit">
            Find
          </button>
        </form>
        {sync?.error && <p className="msg err">Could not refresh from JobTread ({sync.error}); showing the last copy.</p>}
        {q && jobs.length === 0 && <p className="muted">No JobTread jobs match. You can enter the job by hand below.</p>}
        {jobs.length > 0 && (
          <table className="list">
            <thead>
              <tr>
                <th>Job #</th>
                <th>Customer</th>
                <th>City</th>
                <th>Stage</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.jobtreadId}>
                  <td className="mono">{j.jobNumber}</td>
                  <td>{j.customer}</td>
                  <td>{j.city}</td>
                  <td>{j.stage}</td>
                  <td>
                    <form action={startPacket} className="inline">
                      <input type="hidden" name="jobtreadId" value={j.jobtreadId} />
                      <select name="label" aria-label="Paperwork type" defaultValue="Sale Paperwork">
                        {PACKET_LABELS.map((l) => (
                          <option key={l}>{l}</option>
                        ))}
                      </select>
                      <button className="btn primary" type="submit">
                        Start
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <details>
          <summary>Enter a job by hand</summary>
          <form action={startPacket} className="controls">
            <input name="jobNumber" placeholder="Job #" required aria-label="Job number" />
            <input name="customer" placeholder="Customer name" required aria-label="Customer name" />
            <input name="designer" placeholder="Designer" aria-label="Designer" />
            <select name="label" aria-label="Paperwork type" defaultValue="Sale Paperwork">
              {PACKET_LABELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            <button className="btn primary" type="submit">
              Start
            </button>
          </form>
        </details>
      </section>

      <section className="panel">
        <h2>All paperwork</h2>
        {packets.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Job #</th>
                <th>Customer</th>
                <th>Paperwork</th>
                <th>Status</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {packets.map((p) => {
                const superseded = p.status === "submitted" && (latest.get(p.jobNumber) ?? 0) > p.version;
                return (
                  <tr key={p.id} className={superseded ? "dim" : undefined}>
                    <td className="mono">{p.jobNumber}</td>
                    <td>{p.customer}</td>
                    <td>
                      <Link href={`/paperwork/${p.id}`}>{packetTitle(p)}</Link>
                    </td>
                    <td>
                      <span className={`pill ${p.status === "submitted" ? (superseded ? "" : "ok") : "warn"}`}>
                        {superseded ? "Superseded" : p.status === "submitted" ? "Submitted" : "Draft"}
                      </span>
                    </td>
                    <td>{p.createdAt.toLocaleDateString("en-US")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
