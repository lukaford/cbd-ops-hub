import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs, jobtreadJobs } from "@/db/schema";
import { clientJobNumbers } from "@/lib/auth/accounts";
import { currentAccount } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

function longDate(iso: string | null): string {
  if (!iso) return "To be scheduled";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// The client's own jobs only. Shows what a customer would ask the office about;
// internal stages, prices and notes stay out.
export default async function PortalPage() {
  const account = await currentAccount();
  if (account?.kind !== "client") return null;
  const db = await getDb();
  const numbers = await clientJobNumbers(db, account.client.id);
  const [jt, mgr] = numbers.length
    ? await Promise.all([
        db.select().from(jobtreadJobs).where(inArray(jobtreadJobs.jobNumber, numbers)),
        db.select().from(jobs).where(inArray(jobs.jobNumber, numbers)),
      ])
    : [[], []];

  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design</div>
          <h1>Hi {account.client.name.split(" ")[0]}</h1>
          <p>Here&apos;s where your project stands. Your signed paperwork and design updates will appear here too.</p>
        </div>
      </header>
      {numbers.length === 0 && <div className="empty">No projects are linked to your account yet. Your designer can add them.</div>}
      {numbers.map((n) => {
        const j = jt.find((r) => r.jobNumber === n);
        const m = mgr.find((r) => r.jobNumber === n);
        const installOn = j?.installOn ?? m?.installOn ?? null;
        return (
          <section key={n} className="pastebox">
            <div className="label">Project {n}</div>
            <div className="cust">{j?.name || m?.description || "Your project"}</div>
            <div>
              <span className="label">Install date</span>
              <div className="date">{longDate(installOn)}</div>
              {installOn && j && !j.installConfirmed && <div className="small">We&apos;ll confirm this date with you.</div>}
            </div>
          </section>
        );
      })}
    </>
  );
}
